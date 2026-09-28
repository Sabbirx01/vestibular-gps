# Fetch the NIH 3D brain asset (3DPX-021161, CC-BY).
# The S3 link on the landing page is not directly fetchable without the
# right headers, so try several request shapes until one returns a real GLB.

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$dir  = Join-Path $root 'assets\models'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$out  = Join-Path $dir 'nih-brain.glb'

$landing = 'https://3d.nih.gov/entries/download/21161/1.01'
$page    = 'https://3d.nih.gov/entries/3DPX-021161'

# --- 1. Pull the landing page and extract the FULL href(s) ----------
Write-Host "--- extracting candidate URLs from $landing"
$html = $null
try {
    $r = Invoke-WebRequest -Uri $landing -TimeoutSec 90 -UseBasicParsing -Headers @{ 'User-Agent' = 'Mozilla/5.0' }
    $html = [System.Text.Encoding]::UTF8.GetString($r.Content)
} catch { Write-Host ("    landing fetch failed: " + $_.Exception.Message) }

$candidates = @()
if ($html) {
    foreach ($m in [regex]::Matches($html, 'https?://[^"''<>\s]+')) {
        $u = $m.Value -replace '\\u0026', '&' -replace '&amp;', '&'
        if ($u -match '\.(glb|gltf|stl|zip|obj)(\?|$)') { $candidates += $u }
    }
    $candidates = $candidates | Sort-Object -Unique
}
if (-not $candidates) {
    $candidates = @(
        'https://persist-3d-media.s3.amazonaws.com/659758/brain+human.glb',
        'https://persist-3d-media.s3.amazonaws.com/659758/brain%20human.glb'
    )
}
Write-Host "candidates:"
$candidates | ForEach-Object { Write-Host ("  " + $_) }

# --- 2. Try each candidate with progressively richer headers --------
$headerSets = @(
    @{ 'User-Agent' = 'Mozilla/5.0'; 'Referer' = $page; 'Origin' = 'https://3d.nih.gov'; 'Accept' = '*/*' },
    @{ 'User-Agent' = 'Mozilla/5.0'; 'Referer' = $landing; 'Accept' = '*/*' },
    @{ 'User-Agent' = 'Mozilla/5.0' }
)

$saved = $false
foreach ($url in $candidates) {
    if ($saved) { break }
    foreach ($h in $headerSets) {
        if ($saved) { break }
        Write-Host ""
        Write-Host ("--- try " + $url)
        Write-Host ("    referer=" + $h['Referer'])
        try {
            Invoke-WebRequest -Uri $url -OutFile $out -TimeoutSec 180 -UseBasicParsing -Headers $h
            $len = (Get-Item $out).Length
            $b   = [System.IO.File]::ReadAllBytes($out)
            $magic = ''
            if ($len -ge 4) { $magic = [System.Text.Encoding]::ASCII.GetString($b[0..3]) }
            Write-Host ("    got " + $len + " bytes, magic='" + $magic + "'")
            if ($magic -eq 'glTF') { $saved = $true; Write-Host "    OK - valid GLB" }
            else { Write-Host "    not a GLB, continuing" }
        } catch {
            Write-Host ("    failed: " + $_.Exception.Message)
        }
    }
}

if (-not $saved -and (Test-Path $out)) { Remove-Item $out -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host ("RESULT: " + $(if ($saved) { 'brain GLB downloaded' } else { 'NOT downloaded - use the NIH page manually' }))
Get-ChildItem $dir -File | ForEach-Object { Write-Host ("  {0,-42} {1,10} bytes" -f $_.Name, $_.Length) }
