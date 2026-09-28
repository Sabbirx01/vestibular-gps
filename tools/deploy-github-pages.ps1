# ==============================================================
# deploy-github-pages.ps1
# Publishes this folder to a public GitHub repository and turns on
# GitHub Pages, giving a permanent HTTPS URL the team can open.
#
#   powershell -ExecutionPolicy Bypass -File tools\deploy-github-pages.ps1
#   powershell -ExecutionPolicy Bypass -File tools\deploy-github-pages.ps1 -RepoName my-name
#
# Requires: git + gh, both already authenticated.
# ==============================================================
param(
    [string]$RepoName = 'vestibular-gps',
    [string]$Description = 'VESTIBULAR GPS - an interactive 3D laboratory for the human vestibular system: inner ear, brain pathways, the vestibulo-ocular reflex, and what changes when gravity does. Educational visualization, not a medical device.'
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "=== 0. clean stray download artefacts ==="
Get-ChildItem $root -Recurse -File -Include '_probe.bin', '_nih-brain*.zip', '_*.tmp' -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host ("  removing " + $_.FullName.Replace($root, ''))
    Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "=== 1. housekeeping files ==="

# .nojekyll stops GitHub Pages running the folder through Jekyll, which would
# otherwise skip any path beginning with an underscore.
$nojekyll = Join-Path $root '.nojekyll'
if (-not (Test-Path $nojekyll)) { New-Item -ItemType File -Path $nojekyll | Out-Null; Write-Host "  created .nojekyll" }

$gitignore = Join-Path $root '.gitignore'
if (-not (Test-Path $gitignore)) {
    Set-Content -Path $gitignore -Encoding UTF8 -Value @"
# OS / editor
.DS_Store
Thumbs.db
desktop.ini
*.swp

# Python
__pycache__/
*.pyc

# download artefacts
_probe.bin
_nih-brain*.zip
*.tmp

# local logs
*.log
"@
    Write-Host "  created .gitignore"
}

# Page config file so the hosted copy behaves like a normal site.
$qh = Join-Path $root '.nojekyll'

Write-Host ""
Write-Host "=== 2. git identity ==="
$email = (& git config --global user.email 2>&1 | Out-String).Trim()
$name  = (& git config --global user.name 2>&1 | Out-String).Trim()
if (-not $name)  { $name = 'VESTIBULAR GPS'; & git config --global user.name $name }
if (-not $email) { Write-Host "  WARNING: no global git user.email set" }
Write-Host ("  name : " + $name)
Write-Host ("  email: " + $email)

Write-Host ""
Write-Host "=== 3. git init and commit ==="
if (-not (Test-Path (Join-Path $root '.git'))) {
    & git init -b main 2>&1 | Out-Null
    Write-Host "  initialised"
} else {
    Write-Host "  already a repository"
}
& git add -A 2>&1 | Out-Null
& git -c user.name="$name" -c user.email="$email" commit -m "VESTIBULAR GPS - interactive 3D vestibular navigation experience" 2>&1 | Select-Object -First 3 | ForEach-Object { Write-Host ("  " + $_) }

Write-Host ""
Write-Host "=== 4. what will be published ==="
$tracked = & git ls-files
Write-Host ("  tracked files: " + ($tracked | Measure-Object).Count)
Write-Host ("  repo size    : " + [math]::Round(((Get-ChildItem $root -Recurse -File -Force | Where-Object { $_.FullName -notmatch '\\\.git\\' } | Measure-Object Length -Sum).Sum)/1MB, 2) + " MB")

Write-Host ""
Write-Host "=== 5. create the repository and push ==="
$user = (& gh api user --jq .login 2>&1 | Out-String).Trim()
Write-Host ("  github user: " + $user)

$exists = & gh repo view "$user/$RepoName" --json name 2>&1 | Out-String
if ($exists -match '"name"') {
    Write-Host "  repo already exists - pushing to it"
    & git remote remove origin 2>&1 | Out-Null
    & git remote add origin "https://github.com/$user/$RepoName.git" 2>&1 | Out-Null
    & git push -u origin main 2>&1 | Select-Object -Last 4 | ForEach-Object { Write-Host ("  " + $_) }
} else {
    & gh repo create $RepoName --public --description $Description --source=. --remote=origin --push 2>&1 | Select-Object -Last 6 | ForEach-Object { Write-Host ("  " + $_) }
}

Write-Host ""
Write-Host "=== 6. enable GitHub Pages ==="
& gh api --method POST "repos/$user/$RepoName/pages" -f "source[branch]=main" -f "source[path]=/" 2>&1 | Select-Object -First 3 | ForEach-Object { Write-Host ("  " + $_) }
& gh api --method PUT "repos/$user/$RepoName/pages" -f "source[branch]=main" -f "source[path]=/" 2>&1 | Out-Null

Write-Host ""
Write-Host "=== 7. result ==="
$url = "https://$user.github.io/$RepoName/"
Write-Host ("  repository : https://github.com/$user/$RepoName")
Write-Host ("  live site  : " + $url)
Write-Host ""
Write-Host "  Pages takes 1-3 minutes for the first build. Check status with:"
Write-Host ("    gh api repos/$user/$RepoName/pages/builds/latest")
