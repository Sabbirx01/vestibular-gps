# ==============================================================
# sync-lang-pages.ps1
#
# Generates bn/index.html from index.html.
#
# WHY THIS EXISTS
# The app decides its language from the URL path alone (see detectLang in
# src/i18n/index.js): /bn/ is Bengali, everything else is English. So the two
# pages hold IDENTICAL markup and the only thing the Bengali file needs is a
# <base href="../"> tag, because every relative path in the page (src/main.js,
# src/styles/*.css, vendor/three.module.js) has to resolve from the repository
# root rather than from /bn/.
#
# Keeping a hand-maintained second copy of a 38 KB page is how the two versions
# drift apart, so this file is GENERATED, never edited, and the deploy script
# runs this before staging. Edit index.html, run this, both are correct.
#
#   powershell -ExecutionPolicy Bypass -File tools/sync-lang-pages.ps1
#
# ASCII only.
# ==============================================================

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$src = Join-Path $root 'index.html'
$outDir = Join-Path $root 'bn'
$out = Join-Path $outDir 'index.html'

if (-not (Test-Path $src)) {
  Write-Host '  index.html not found - nothing to sync'
  exit 1
}

$html = [System.IO.File]::ReadAllText($src, [System.Text.Encoding]::UTF8)

# Drop any base tag we inserted on a previous run, so this is idempotent.
$html = [regex]::Replace($html, '<base\s+href="\.\./">\s*', '')

# Match the bare <head> tag and nothing else. The original pattern here was
# (<head[^>]*>) -- which also matches <header class="section-head">, because
# "header" starts with "head" and [^>]* happily eats "er class=...". That is
# how eleven base tags ended up scattered through the BODY of bn/index.html,
# one before every section header. Only the first one has any effect, so the
# page still worked, which is exactly why it survived unnoticed. Do not widen
# this pattern again without checking the base-tag count in the output.
if (-not [regex]::IsMatch($html, '(?i)<head>')) {
  Write-Host '  no bare <head> tag in index.html - refusing to generate'
  exit 1
}

# Insert the base tag as the first thing in <head>. It must come before any
# relative URL in the document.
$html = [regex]::Replace($html, '(?i)<head>', "<head>`r`n  <base href=`"../`">", 1)

# Belt and braces: whatever the source contained, the generated page must hold
# exactly one base tag, and it must be the first line inside <head>.
$count = ([regex]::Matches($html, '<base\s+href=')).Count
if ($count -ne 1) {
  Write-Host ("  refusing to write: {0} base tags in the generated page" -f $count)
  exit 1
}

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
[System.IO.File]::WriteAllText($out, $html, (New-Object System.Text.UTF8Encoding($false)))

$kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host ("  bn/index.html regenerated from index.html ({0} KB, base href ../ inserted)" -f $kb)
