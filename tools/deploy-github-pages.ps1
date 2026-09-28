# ==============================================================
# deploy-github-pages.ps1
# Publishes this folder to a public GitHub repository and enables
# GitHub Pages, giving a permanent HTTPS URL.
#
#   powershell -ExecutionPolicy Bypass -File tools\deploy-github-pages.ps1
#   powershell -ExecutionPolicy Bypass -File tools\deploy-github-pages.ps1 -RepoName other-name
#
# WHY NOT `gh`:
#   The gh CLI is NOT logged in on this machine, and in a non-interactive
#   shell it additionally refuses to use a stored credential
#   ("To use GitHub CLI in automation, set the GH_TOKEN environment
#   variable"). However git's credential helper (wincred) DOES hold a valid
#   GitHub token. So this script reads that token via `git credential fill`
#   and talks to the REST API directly. The token is never printed.
# ==============================================================
param(
    [string]$RepoName = 'vestibular-gps',
    [string]$Description = 'VESTIBULAR GPS - an interactive 3D laboratory for the human vestibular system: inner ear, brain pathways, the vestibulo-ocular reflex, and what changes when gravity does. Educational visualization, not a medical device.'
)

$ErrorActionPreference = 'Continue'
$gitPrompt = $env:GIT_TERMINAL_PROMPT
$env:GIT_TERMINAL_PROMPT = '0'   # never hang waiting for a password prompt

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# --- 0. obtain the token git already holds ----------------------------
Write-Host "=== 0. GitHub credential (from git's credential helper) ==="
$credReq = "protocol=https`nhost=github.com`n`n"
$cred = ($credReq | & git credential fill 2>&1 | Out-String)
$user = (($cred -split "`n" | Where-Object { $_ -match '^username=' } | Select-Object -First 1) -replace '^username=', '').Trim()
$token = (($cred -split "`n" | Where-Object { $_ -match '^password=' } | Select-Object -First 1) -replace '^password=', '').Trim()

if (-not $token -or -not $user) {
    Write-Host "  No usable GitHub credential found in the git credential store."
    Write-Host "  Run this once in your own terminal, then re-run this script:"
    Write-Host "      gh auth login"
    Write-Host "  ...or store a personal access token with:"
    Write-Host '      git config --global credential.helper wincred'
    $env:GIT_TERMINAL_PROMPT = $gitPrompt
    exit 1
}
Write-Host ("  user : " + $user)
Write-Host ("  token: " + $token.Substring(0, 6) + '...' + $token.Substring($token.Length - 4) + "  (len " + $token.Length + ")")

$H = @{
    'Authorization' = "token $token"
    'Accept'        = 'application/vnd.github+json'
    'User-Agent'    = 'vestibular-gps-deploy'
}

# --- 1. whoami --------------------------------------------------------
Write-Host ""
Write-Host "=== 1. verify the token against the API ==="
try {
    $me = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $H -TimeoutSec 60
    Write-Host ("  authenticated as: " + $me.login + "  (" + $me.name + ")")
    $owner = $me.login
} catch {
    Write-Host ("  API rejected the token: " + $_.Exception.Message)
    $env:GIT_TERMINAL_PROMPT = $gitPrompt
    exit 1
}

$full = "$owner/$RepoName"
$webUrl = "https://github.com/$full"
$liveUrl = "https://$owner.github.io/$RepoName/"

# --- 2. housekeeping --------------------------------------------------
Write-Host ""
Write-Host "=== 2. housekeeping ==="
Get-ChildItem $root -Recurse -File -Include '_probe.bin', '_nih-brain*.zip', '_*.tmp' -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host ("  removing " + $_.Name); Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }

if (-not (Test-Path (Join-Path $root '.nojekyll'))) {
    New-Item -ItemType File -Path (Join-Path $root '.nojekyll') | Out-Null
    Write-Host "  created .nojekyll (stops Jekyll skipping underscore paths)"
}
if (-not (Test-Path (Join-Path $root '.gitignore'))) {
    Set-Content -Path (Join-Path $root '.gitignore') -Encoding UTF8 -Value @"
.DS_Store
Thumbs.db
__pycache__/
*.pyc
_probe.bin
_nih-brain*.zip
*.tmp
*.log
"@
    Write-Host "  created .gitignore"
}

# --- 3. create the repository if needed -------------------------------
Write-Host ""
Write-Host "=== 3. repository ==="
$exists = $false
try {
    Invoke-RestMethod -Uri "https://api.github.com/repos/$full" -Headers $H -TimeoutSec 60 | Out-Null
    $exists = $true
} catch { $exists = $false }

if ($exists) {
    Write-Host ("  already exists: " + $webUrl)
} else {
    Write-Host ("  creating public repository " + $full)
    $body = @{ name = $RepoName; description = $Description; private = $false; has_issues = $true; has_wiki = $false; auto_init = $false } | ConvertTo-Json
    try {
        Invoke-RestMethod -Uri 'https://api.github.com/user/repos' -Method Post -Headers $H -Body $body -ContentType 'application/json' -TimeoutSec 90 | Out-Null
        Write-Host "  created"
    } catch {
        Write-Host ("  create failed: " + $_.Exception.Message)
        if ($_.ErrorDetails.Message) { Write-Host ("  detail: " + $_.ErrorDetails.Message.Substring(0, [Math]::Min(300, $_.ErrorDetails.Message.Length))) }
        $env:GIT_TERMINAL_PROMPT = $gitPrompt
        exit 1
    }
}

# --- 4. commit and push ----------------------------------------------
Write-Host ""
Write-Host "=== 4. commit and push ==="
if (-not (Test-Path (Join-Path $root '.git'))) {
    & git init -b main 2>&1 | Out-Null
    Write-Host "  initialised repository"
}
# Regenerate the language page from index.html before staging, so the Bengali
# URL can never be deployed out of step with the English one.
& powershell -ExecutionPolicy Bypass -File (Join-Path $root 'tools\sync-lang-pages.ps1') 2>&1 | ForEach-Object { Write-Host ("  " + $_) }

& git add -A 2>&1 | Out-Null
$msg = 'VESTIBULAR GPS - interactive 3D vestibular navigation experience'
& git commit -m $msg 2>&1 | Select-Object -First 2 | ForEach-Object { Write-Host ("  " + $_) }

& git remote remove origin 2>&1 | Out-Null
& git remote add origin "https://github.com/$full.git" 2>&1 | Out-Null

$env:GIT_TERMINAL_PROMPT = '0'
$push = (& git push -u origin main 2>&1 | Out-String)
$push.Trim().Split("`n") | Select-Object -Last 4 | ForEach-Object { if ($_.Trim()) { Write-Host ("  " + $_.Trim()) } }

# --- 5. enable Pages --------------------------------------------------
Write-Host ""
Write-Host "=== 5. enable GitHub Pages ==="
$pagesBody = @{ source = @{ branch = 'main'; path = '/' } } | ConvertTo-Json -Depth 4
$pagesOk = $false
try {
    Invoke-RestMethod -Uri "https://api.github.com/repos/$full/pages" -Method Post -Headers $H -Body $pagesBody -ContentType 'application/json' -TimeoutSec 60 | Out-Null
    Write-Host "  Pages enabled (POST)"
    $pagesOk = $true
} catch {
    try {
        Invoke-RestMethod -Uri "https://api.github.com/repos/$full/pages" -Method Put -Headers $H -Body $pagesBody -ContentType 'application/json' -TimeoutSec 60 | Out-Null
        Write-Host "  Pages updated (PUT)"
        $pagesOk = $true
    } catch {
        Write-Host ("  could not enable Pages automatically: " + $_.Exception.Message)
        if ($_.ErrorDetails.Message) { Write-Host ("  detail: " + $_.ErrorDetails.Message.Substring(0, [Math]::Min(300, $_.ErrorDetails.Message.Length))) }
    }
}

# --- 6. wait for the first build --------------------------------------
if ($pagesOk) {
    Write-Host ""
    Write-Host "=== 6. waiting for the Pages build (up to 3 minutes) ==="
    $ready = $false
    for ($i = 1; $i -le 18; $i++) {
        Start-Sleep -Seconds 10
        try {
            $p = Invoke-RestMethod -Uri "https://api.github.com/repos/$full/pages" -Headers $H -TimeoutSec 30
            $st = $p.status
            Write-Host ("  [" + ($i * 10) + "s] status=" + $st)
            if ($st -eq 'built') { $ready = $true; break }
            if ($st -eq 'errored') { Write-Host "  build errored - check the repository Actions tab"; break }
        } catch { Write-Host ("  [" + ($i * 10) + "s] not ready yet") }
    }

    Write-Host ""
    Write-Host "=== 7. reachability ==="
    foreach ($attempt in 1..6) {
        try {
            $r = Invoke-WebRequest -Uri $liveUrl -UseBasicParsing -TimeoutSec 30 -MaximumRedirection 5
            Write-Host ("  HTTP " + $r.StatusCode + "  " + $r.RawContentLength + " bytes")
            if ($r.StatusCode -eq 200) { Write-Host "  LIVE"; break }
        } catch {
            Write-Host ("  attempt " + $attempt + ": " + $_.Exception.Message.Substring(0, [Math]::Min(90, $_.Exception.Message.Length)))
        }
        Start-Sleep -Seconds 15
    }
}

Write-Host ""
Write-Host "======================================================"
Write-Host ("  repository : " + $webUrl)
Write-Host ("  LIVE SITE  : " + $liveUrl)
Write-Host "======================================================"

$env:GIT_TERMINAL_PROMPT = $gitPrompt
