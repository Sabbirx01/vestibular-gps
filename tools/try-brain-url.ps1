$ErrorActionPreference = 'SilentlyContinue'
$dest = 'F:\Nasa Project\VESTIBULAR GPS Webpage\assets\models\nih-brain.glb'
$tmp  = 'F:\Nasa Project\VESTIBULAR GPS Webpage\assets\models\_probe.bin'

$runs = @(
    'b660a11c-e73d-41ae-a254-b07b8e0d4678'
)
$ids = 659755..659766

$found = $false
foreach ($run in $runs) {
    if ($found) { continue }
    foreach ($id in $ids) {
        if ($found) { continue }
        $u = "https://3d.nih.gov/api/submissions/27696/runs/$run/output-files/$id"
        Remove-Item $tmp -ErrorAction SilentlyContinue
        $code = & curl.exe -sS -L -o $tmp -w "%{http_code}|%{size_download}" $u 2>$null
        $len = 0
        if (Test-Path $tmp) { $len = (Get-Item $tmp).Length }
        $magic = ''
        if ($len -ge 4) {
            $b = [System.IO.File]::ReadAllBytes($tmp)
            $magic = [System.Text.Encoding]::ASCII.GetString($b[0..3])
        }
        Write-Host ("  id=$id  http=$code  bytes=$len  magic='$magic'")
        if ($magic -eq 'glTF' -and $len -gt 100000) {
            Move-Item $tmp $dest -Force
            $found = $true
            Write-Host "  ===> VALID GLB SAVED as nih-brain.glb"
        }
    }
}
Remove-Item $tmp -ErrorAction SilentlyContinue
Write-Host ""
Write-Host ("RESULT: " + $(if ($found) { 'brain GLB downloaded via the NIH API proxy' } else { 'no GLB through the output-files proxy' }))
