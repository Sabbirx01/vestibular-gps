# Probe which deployment / tunnelling tools are actually usable here.
# Capability discovery only - nothing is installed or changed.

function Probe($name, $cmd) {
    $c = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($c) {
        $ver = ''
        try { $ver = (& $cmd --version 2>&1 | Select-Object -First 1) } catch {}
        Write-Host ("  YES  {0,-14} {1}" -f $name, $c.Source)
        if ($ver) { Write-Host ("       version: {0}" -f $ver) }
        return $true
    } else {
        Write-Host ("  no   {0}" -f $name)
        return $false
    }
}

Write-Host "=== runtimes ==="
Probe 'node'    'node'    | Out-Null
Probe 'npm'     'npm'     | Out-Null
Probe 'npx'     'npx'     | Out-Null
Probe 'git'     'git'     | Out-Null
Probe 'python'  'python'  | Out-Null
Probe 'ssh'     'ssh'     | Out-Null

Write-Host ""
Write-Host "=== deploy / tunnel tools ==="
Probe 'gh'           'gh'           | Out-Null
Probe 'cloudflared'  'cloudflared'  | Out-Null
Probe 'ngrok'        'ngrok'        | Out-Null
Probe 'vercel'       'vercel'       | Out-Null
Probe 'netlify'      'netlify'      | Out-Null
Probe 'surge'        'surge'        | Out-Null
Probe 'wrangler'     'wrangler'     | Out-Null

Write-Host ""
Write-Host "=== auth state (read-only) ==="
$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
    $s = (& gh auth status 2>&1 | Out-String)
    if ($s -match 'Logged in') { Write-Host "  gh: AUTHENTICATED" } else { Write-Host "  gh: not authenticated" }
} else { Write-Host "  gh: not installed" }

$git = Get-Command git -ErrorAction SilentlyContinue
if ($git) {
    $cfg = (& git config --global user.email 2>&1 | Out-String).Trim()
    if ($cfg) { Write-Host ("  git user.email: " + $cfg) } else { Write-Host "  git user.email: unset" }
}

Write-Host ""
Write-Host "=== is the project a git repo? ==="
$root = Split-Path -Parent $PSScriptRoot
if (Test-Path (Join-Path $root '.git')) { Write-Host "  yes" } else { Write-Host "  no" }

Write-Host ""
Write-Host "=== project size ==="
$files = Get-ChildItem $root -Recurse -File
$mb = [math]::Round((($files | Measure-Object -Property Length -Sum).Sum) / 1MB, 2)
Write-Host ("  files: " + $files.Count + "   total: " + $mb + " MB")
