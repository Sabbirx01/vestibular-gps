# Discover the real NIH 3D asset URL for entry 3DPX-021161 / submission 27696.
# The /entries/download/<id>/<ver> endpoint returns a landing page, not the file.

$ErrorActionPreference = 'Continue'
$ua = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; VESTIBULAR-GPS/1.0)' }

function Show($label, $url) {
    Write-Host ""
    Write-Host "--- $label"
    Write-Host "    $url"
    try {
        $r = Invoke-WebRequest -Uri $url -Headers $ua -TimeoutSec 90 -UseBasicParsing
        Write-Host ("    HTTP " + $r.StatusCode + "  type=" + $r.Headers['Content-Type'] + "  bytes=" + $r.RawContentLength)
        return $r
    } catch {
        Write-Host ("    FAILED " + $_.Exception.Message)
        if ($_.Exception.Response) {
            Write-Host ("    status: " + [int]$_.Exception.Response.StatusCode)
        }
        return $null
    }
}

# 1. Try obvious API shapes first.
$apiTries = @(
    'https://3d.nih.gov/api/entries/3DPX-021161',
    'https://3d.nih.gov/api/submissions/27696',
    'https://3d.nih.gov/api/submissions/27696/runs/b660a11c-e73d-41ae-a254-b07b8e0d4678/output-files',
    'https://3d.nih.gov/api/submissions/27696/files'
)
foreach ($u in $apiTries) {
    $r = Show 'API probe' $u
    if ($r) {
        $txt = $r.Content
        if ($txt -is [byte[]]) { $txt = [System.Text.Encoding]::UTF8.GetString($txt) }
        Write-Host ("    body starts: " + $txt.Substring(0, [Math]::Min(500, $txt.Length)))
    }
}

# 2. Scrape the download landing page for candidate asset links.
Write-Host ""
Write-Host "=== scraping the download landing page for file links ==="
$land = Show 'landing' 'https://3d.nih.gov/entries/download/21161/1.01'
if ($land) {
    $html = $land.Content
    if ($html -is [byte[]]) { $html = [System.Text.Encoding]::UTF8.GetString($html) }
    $hits = [regex]::Matches($html, 'https?://[^"''\\ ]+|/[a-z0-9\-_/]*\.(glb|stl|zip|obj|ply|gltf|3mf)') |
            ForEach-Object { $_.Value } | Sort-Object -Unique
    Write-Host ""
    Write-Host "candidate links:"
    $hits | Where-Object { $_ -match 'glb|stl|zip|obj|ply|gltf|3mf|api/submissions' } | Select-Object -First 40 | ForEach-Object {
        Write-Host ("  " + $_)
    }
    Write-Host ""
    Write-Host ("total distinct links found: " + $hits.Count)
}
