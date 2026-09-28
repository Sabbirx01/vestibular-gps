# ==============================================================
# fetch-draco.ps1
# The NASA Advanced Crew Escape Suit GLB is Draco-compressed, so
# GLTFLoader refuses to parse it unless a DRACOLoader with a local
# decoder is supplied. This fetches the decoder that matches the
# vendored three.js version and rewrites the bare 'three' import
# specifier to the local module.
#
#   powershell -ExecutionPolicy Bypass -File tools\fetch-draco.ps1
# ==============================================================

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$ver  = '0.169.0'
$base = "https://cdn.jsdelivr.net/npm/three@$ver/examples/jsm"

$decoderDir = Join-Path $root 'vendor\libs\draco\gltf'
$loadersDir = Join-Path $root 'vendor\loaders'
New-Item -ItemType Directory -Force -Path $decoderDir | Out-Null
New-Item -ItemType Directory -Force -Path $loadersDir | Out-Null

# 1. DRACOLoader itself
$dl = Join-Path $loadersDir 'DRACOLoader.js'
Write-Host "--- DRACOLoader.js"
try {
    Invoke-WebRequest -Uri "$base/loaders/DRACOLoader.js" -OutFile $dl -TimeoutSec 120 -UseBasicParsing
    Write-Host ("    saved " + (Get-Item $dl).Length + " bytes")
    $src = Get-Content -Raw -Encoding UTF8 $dl
    $before = $src
    $src = $src -replace "from\s+'three'", "from '../../vendor/three.module.js'"
    $src = $src -replace 'from\s+"three"', 'from "../../vendor/three.module.js"'
    if ($src -ne $before) {
        Set-Content -Path $dl -Value $src -Encoding UTF8 -NoNewline
        Write-Host "    rewrote 'three' import -> ../../vendor/three.module.js"
    }
    foreach ($m in [regex]::Matches($src, "from\s+'(\.[^']+)'")) {
        Write-Host ("    also imports: " + $m.Groups[1].Value)
    }
} catch { Write-Host ("    FAILED: " + $_.Exception.Message) }

# 2. Decoder runtime — all three files must sit together
$decoderFiles = @('draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js')
foreach ($f in $decoderFiles) {
    $out = Join-Path $decoderDir $f
    Write-Host ("--- " + $f)
    try {
        Invoke-WebRequest -Uri "$base/libs/draco/gltf/$f" -OutFile $out -TimeoutSec 180 -UseBasicParsing
        Write-Host ("    saved " + (Get-Item $out).Length + " bytes")
    } catch { Write-Host ("    FAILED: " + $_.Exception.Message) }
}

Write-Host ""
Write-Host "=== draco decoder folder ==="
Get-ChildItem $decoderDir -File | ForEach-Object {
    Write-Host ("  {0,-30} {1,10} bytes" -f $_.Name, $_.Length)
}

Write-Host ""
Write-Host "=== sanity: does draco_decoder.wasm look like wasm? ==="
$w = Join-Path $decoderDir 'draco_decoder.wasm'
if (Test-Path $w) {
    $b = [System.IO.File]::ReadAllBytes($w)
    $magic = ($b[0..3] | ForEach-Object { $_.ToString('x2') }) -join ' '
    Write-Host ("  first bytes: " + $magic + "   (expect '00 61 73 6d' for wasm)")
} else {
    Write-Host "  missing"
}
