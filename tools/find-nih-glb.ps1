$ErrorActionPreference = 'SilentlyContinue'
$ua = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
$dest = 'F:\Nasa Project\VESTIBULAR GPS Webpage\assets\models\nih-brain.glb'

# Candidate NIH 3D brain entries. Each landing page embeds the real s3 URL.
$entries = @(
    @{ id = '3DPX-021159'; page = 'https://3d.nih.gov/entries/3DPX-021159'; label = 'Well Explained Brain Model' },
    @{ id = '3DPX-003765'; page = 'https://3d.nih.gov/entries/3DPX-003765'; label = '3D model of the Brain' },
    @{ id = '3DPX-021161'; page = 'https://3d.nih.gov/entries/3DPX-021161'; label = 'Detailed Human Brain Model' }
)

$found = $false
foreach ($e in $entries) {
    if ($found) { continue }
    Write-Host ("--- " + $e.id + "  " + $e.label)
    try {
        $r = Invoke-WebRequest -Uri $e.page -Headers $ua -TimeoutSec 90 -UseBasicParsing -ErrorAction Stop
        $html = if ($r.Content -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
    } catch { Write-Host "    page fetch failed"; continue }

    $urls = [regex]::Matches($html, 'https?://persist-3d-media\.s3\.amazonaws\.com/[^"\\\s]+\.glb') |
            ForEach-Object { $_.Value } | Sort-Object -Unique
    if (-not $urls) { Write-Host "    no glb url found"; continue }

    foreach ($u in $urls) {
        if ($found) { continue }
        Write-Host ("    trying " + $u)
        $code = & curl.exe -sS -L -o $dest -w "%{http_code}" $u 2>$null
        $len = 0
        if (Test-Path $dest) { $len = (Get-Item $dest).Length }
        $magic = ''
        if ($len -ge 4) {
            $b = [System.IO.File]::ReadAllBytes($dest)
            $magic = [System.Text.Encoding]::ASCII.GetString($b[0..3])
        }
        Write-Host ("    http=" + $code + "  bytes=" + $len + "  magic='" + $magic + "'")
        if ($magic -eq 'glTF') {
            $found = $true
            Write-Host ("    SUCCESS - " + $e.id)
        } else {
            Remove-Item $dest -ErrorAction SilentlyContinue
        }
    }
}

Write-Host ""
if ($found) { Write-Host "RESULT: brain GLB downloaded" } else { Write-Host "RESULT: no public NIH brain GLB found; astronaut asset only" }
