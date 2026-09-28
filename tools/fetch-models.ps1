# ==============================================================
# fetch-models.ps1
# Downloads the real, openly-licensed 3D assets used by
# VESTIBULAR GPS. Run once; the files are then shipped with the
# project so the site works fully offline.
#
#   powershell -ExecutionPolicy Bypass -File tools\fetch-models.ps1
#
# NOTE: ASCII-only on purpose. Windows PowerShell 5.1 reads a
# UTF-8 file without a BOM as ANSI, which corrupts any non-ASCII
# character and breaks the parser.
# ==============================================================

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$dir  = Join-Path $root 'assets\models'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function Get-Asset {
    param([string]$Url, [string]$OutFile, [string]$Label)
    Write-Host ""
    Write-Host "--- $Label"
    Write-Host "    $Url"
    try {
        Invoke-WebRequest -Uri $Url -OutFile $OutFile -TimeoutSec 300 -UseBasicParsing
        $len = (Get-Item $OutFile).Length
        Write-Host ("    saved {0} bytes ({1} KB)" -f $len, [math]::Round($len / 1KB, 1))
        return $true
    } catch {
        Write-Host ("    FAILED: " + $_.Exception.Message)
        return $false
    }
}

# --- 1. NASA Advanced Crew Escape Suit ------------------------
# Source : NASA 3D Resources  https://science.nasa.gov/3d-resources/
# Repo   : https://github.com/nasa/NASA-3D-Resources
# Terms  : the NASA 3D Resources repository states the assets are
#          "free and without copyright". See the NASA Images and
#          Media Usage Guidelines:
#          https://www.nasa.gov/nasa-brand-center/images-and-media
$suit = Join-Path $dir 'nasa-aces-suit.glb'
Get-Asset -Url 'https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/advanced-crew-escape-suit/Advanced%20Crew%20Escape%20Suit.glb' -OutFile $suit -Label 'NASA Advanced Crew Escape Suit (GLB)' | Out-Null

# --- 2. NIH 3D - Detailed Human Brain Model -------------------
# Entry  : 3DPX-021161   https://3d.nih.gov/entries/3DPX-021161
# Author : Johnson J
# Licence: CC-BY  https://creativecommons.org/licenses/by/4.0/
#          Attribution is required and is shown in the UI.
#
# The /entries/download/<id>/<ver> endpoint returns an HTML landing
# page, not the asset. The real file URL is discovered from that page
# (tools\find-nih-file.ps1) and lives on NIH's S3 media bucket.
$brain = Join-Path $dir 'nih-brain.glb'
Get-Asset -Url 'https://persist-3d-media.s3.amazonaws.com/659758/brain+human.glb' -OutFile $brain -Label 'NIH 3D Detailed Human Brain (3DPX-021161, CC-BY)' | Out-Null

# --- 3. Report ------------------------------------------------
Write-Host ""
Write-Host "=== assets/models ==="
Get-ChildItem $dir -Recurse -File | ForEach-Object {
    Write-Host ("  {0,-46} {1,10} bytes" -f $_.Name, $_.Length)
}

Write-Host ""
Write-Host "=== GLB magic check (first four bytes must read glTF) ==="
Get-ChildItem $dir -Recurse -Filter *.glb | ForEach-Object {
    $b = [System.IO.File]::ReadAllBytes($_.FullName)
    if ($b.Length -ge 12) {
        $magic    = [System.Text.Encoding]::ASCII.GetString($b[0..3])
        $declared = [System.BitConverter]::ToUInt32($b, 8)
        Write-Host ("  {0,-46} magic='{1}' declared={2} actual={3}" -f $_.Name, $magic, $declared, $b.Length)
    } else {
        Write-Host ("  {0} - too small to be a GLB" -f $_.Name)
    }
}
