# Verify every URL in the science source registry actually resolves.
# Dead links in a submission damage credibility, so this is run before publishing.
# ASCII only.

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$content = Join-Path $root 'src\science\content.js'

if (-not (Test-Path $content)) { Write-Host "content.js not found"; exit 1 }

$text = Get-Content -Raw -Encoding UTF8 $content

# pair up each source key with its url inside the SOURCES block
$matches = [regex]::Matches($text, "(?s)(\w+):\s*\{\s*id:.*?url:\s*'([^']+)'")

Write-Host ("checking " + $matches.Count + " registry URLs")
Write-Host ""

$ok = 0
$bad = 0
$results = @()

foreach ($m in $matches) {
    $key = $m.Groups[1].Value
    $url = $m.Groups[2].Value

    $code = 'ERR'
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 45 -MaximumRedirection 5 `
             -Headers @{ 'User-Agent' = 'Mozilla/5.0 (compatible; VESTIBULAR-GPS/1.0)' }
        $code = [string]$r.StatusCode
    } catch {
        if ($_.Exception.Response) { $code = [string]([int]$_.Exception.Response.StatusCode) }
        else { $code = 'n/a' }
    }

    $flag = if ($code -eq '200') { 'OK  ' } else { 'FAIL' }
    if ($code -eq '200') { $ok++ } else { $bad++ }

    Write-Host ("  {0} {1,-32} {2}  {3}" -f $flag, $key, $code, $url)
    $results += "{0}`t{1}`t{2}`t{3}" -f $flag.Trim(), $key, $code, $url
}

Write-Host ""
Write-Host ("resolved: " + $ok + "   failed: " + $bad)

$out = Join-Path $root 'docs\_source-check.txt'
Set-Content -Path $out -Value ((Get-Date -Format o) + "`n" + ($results -join "`n")) -Encoding UTF8
Write-Host ("written: " + $out)
