# Locate the token gh already stored, so it can be re-supplied via GH_TOKEN
# (gh refuses to use its keyring in a non-interactive shell).
# The token is never printed - only its presence and length.

function Mask($t) {
    if (-not $t) { return '(none)' }
    if ($t.Length -le 10) { return '(short)' }
    return $t.Substring(0, 6) + '...' + $t.Substring($t.Length - 4) + '  (len ' + $t.Length + ')'
}

Write-Host "=== 1. gh auth token ==="
$tok = $null
try {
    $tok = (& gh auth token 2>&1 | Out-String).Trim()
    if ($tok -match 'gho_|ghp_|github_pat_') { Write-Host ("  found: " + (Mask $tok)) }
    else { Write-Host ("  no token: " + $tok.Substring(0, [Math]::Min(120, $tok.Length))); $tok = $null }
} catch { Write-Host ("  failed: " + $_.Exception.Message) }

Write-Host ""
Write-Host "=== 2. gh config / hosts.yml ==="
$candidates = @(
    (Join-Path $env:APPDATA 'GitHub CLI\hosts.yml'),
    (Join-Path $env:LOCALAPPDATA 'GitHub CLI\hosts.yml'),
    (Join-Path $env:USERPROFILE '.config\gh\hosts.yml')
)
foreach ($c in $candidates) {
    if (Test-Path $c) {
        Write-Host ("  file: " + $c)
        $txt = Get-Content -Raw $c
        foreach ($line in ($txt -split "`n")) {
            if ($line -match 'user:|oauth_token|users:') {
                if ($line -match 'oauth_token:\s*(\S+)') {
                    Write-Host ("    oauth_token -> " + (Mask $Matches[1]))
                    if (-not $tok) { $tok = $Matches[1] }
                } else {
                    Write-Host ("    " + $line.Trim())
                }
            }
        }
    }
}
if (-not (Get-ChildItem (Join-Path $env:APPDATA 'GitHub CLI') -ErrorAction SilentlyContinue)) {
    Write-Host "  no GitHub CLI config folder in APPDATA"
}

Write-Host ""
Write-Host "=== 3. git credential manager ==="
$out = (& git config --global --get credential.helper 2>&1 | Out-String).Trim()
Write-Host ("  credential.helper = " + $(if ($out) { $out } else { '(unset)' }))

Write-Host ""
Write-Host "=== 4. can git reach github without gh? ==="
$probe = (& git ls-remote https://github.com/octocat/Hello-World.git HEAD 2>&1 | Out-String).Trim()
if ($probe -match '^[0-9a-f]{40}') { Write-Host "  git network: OK" } else { Write-Host ("  git network: " + $probe.Substring(0, [Math]::Min(160, $probe.Length))) }

Write-Host ""
if ($tok) {
    Write-Host "TOKEN_AVAILABLE"
    # Persist for the next step without echoing it.
    Set-Content -Path (Join-Path $env:TEMP 'vgps-gh-token.txt') -Value $tok -Encoding UTF8 -NoNewline
    Write-Host ("  staged to " + (Join-Path $env:TEMP 'vgps-gh-token.txt') + " for the deploy step")
} else {
    Write-Host "NO_TOKEN_FOUND"
}
