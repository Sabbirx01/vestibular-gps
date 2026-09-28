# Where is the GitHub credential actually coming from?
# Values are masked - never print a secret.

function Mask($t) {
    if (-not $t) { return $null }
    if ($t.Length -le 10) { return '(short,len ' + $t.Length + ')' }
    return $t.Substring(0, 6) + '...' + $t.Substring($t.Length - 4) + '  (len ' + $t.Length + ')'
}

Write-Host "=== environment variables ==="
foreach ($n in @('GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_CONFIG_DIR', 'GH_ENTERPRISE_TOKEN')) {
    $v = [Environment]::GetEnvironmentVariable($n)
    if ($v) { Write-Host ("  {0,-22} = {1}" -f $n, (Mask $v)) }
    else    { Write-Host ("  {0,-22} = (not set)" -f $n) }
}

Write-Host ""
Write-Host "=== gh auth status (full output) ==="
$s = (& gh auth status 2>&1 | Out-String)
$s.Split("`n") | ForEach-Object { if ($_.Trim()) { Write-Host ("  " + $_.Trim()) } }

Write-Host ""
Write-Host "=== Windows Credential Manager: github entries ==="
$cm = (& cmdkey /list 2>&1 | Out-String)
$hit = $false
foreach ($line in ($cm -split "`n")) {
    if ($line -match 'github|git:') { Write-Host ("  " + $line.Trim()); $hit = $true }
}
if (-not $hit) { Write-Host "  no github credential stored in cmdkey" }

Write-Host ""
Write-Host "=== git credential fill test (does git have a usable password?) ==="
# Ask git's configured helper for a github.com credential WITHOUT printing it.
$req = "protocol=https`nhost=github.com`n`n"
$resp = $req | & git credential fill 2>&1 | Out-String
$u = ($resp -split "`n" | Where-Object { $_ -match '^username=' } | Select-Object -First 1)
$p = ($resp -split "`n" | Where-Object { $_ -match '^password=' } | Select-Object -First 1)
if ($u) { Write-Host ("  username: " + $u.Trim()) } else { Write-Host "  username: (none returned)" }
if ($p) {
    $pv = ($p -replace '^password=', '').Trim()
    Write-Host ("  password: " + (Mask $pv))
    Write-Host "  --> git CAN authenticate to github.com"
    Set-Content -Path (Join-Path $env:TEMP 'vgps-git-user.txt') -Value ($u -replace '^username=', '').Trim() -Encoding UTF8 -NoNewline
} else {
    Write-Host "  password: (none returned)"
    Write-Host "  --> git has NO stored github credential"
}
