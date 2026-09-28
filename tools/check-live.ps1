# Verify the deployed site serves every critical file, including the
# 13 MB brain asset and the Draco decoder that the suit needs.
param(
    [string]$Base = 'https://sabbirx01.github.io/vestibular-gps'
)

$ErrorActionPreference = 'Continue'
$targets = @(
    @{ path = '/';                                                 label = 'index.html' },
    @{ path = '/src/main.js';                                      label = 'app entry' },
    @{ path = '/src/three/ModelLibrary.js';                        label = 'ModelLibrary' },
    @{ path = '/vendor/three.module.js';                           label = 'three.js' },
    @{ path = '/vendor/loaders/GLTFLoader.js';                     label = 'GLTFLoader' },
    @{ path = '/vendor/loaders/DRACOLoader.js';                    label = 'DRACOLoader' },
    @{ path = '/vendor/libs/draco/gltf/draco_decoder.js';          label = 'draco decoder js' },
    @{ path = '/vendor/libs/draco/gltf/draco_decoder.wasm';        label = 'draco decoder wasm' },
    @{ path = '/vendor/libs/draco/gltf/draco_wasm_wrapper.js';     label = 'draco wasm wrapper' },
    @{ path = '/assets/models/nasa-aces-suit.glb';                 label = 'NASA suit GLB' },
    @{ path = '/assets/models/nih-brain.glb';                      label = 'NIH brain GLB' },
    @{ path = '/src/core/osi.js';                                  label = 'OSI engine' },
    @{ path = '/src/ui/console.js';                                label = 'Mission Console' },
    @{ path = '/src/ui/integration.js';                            label = 'Integration' },
    @{ path = '/src/sensors/webcam.js';                            label = 'CameraProvider' },
    @{ path = '/src/three/environment.js';                         label = 'IBL environment' },
    @{ path = '/src/three/surfaceDetail.js';                       label = 'Surface detail' },
    @{ path = '/src/styles/console.css';                           label = 'console styles' },
    @{ path = '/docs/ARCHITECTURE.md';                             label = 'docs/ARCHITECTURE' },
    @{ path = '/docs/SOURCES.md';                                  label = 'docs/SOURCES' },
    @{ path = '/docs/SENSOR_API.md';                               label = 'docs/SENSOR_API' },
    @{ path = '/docs/TESTING.md';                                  label = 'docs/TESTING' },
    @{ path = '/docs/DEPLOYMENT.md';                               label = 'docs/DEPLOYMENT' },
    @{ path = '/docs/SCIENCE.md';                                  label = 'docs/SCIENCE' }
)

Write-Host ("checking " + $Base)
Write-Host ""
$bad = 0
$mb  = 0
foreach ($t in $targets) {
    try {
        $r = Invoke-WebRequest -Uri ($Base + $t.path) -UseBasicParsing -TimeoutSec 180
        $mb += $r.RawContentLength
        $ct = $r.Headers['Content-Type']
        $ok = ($r.StatusCode -eq 200)
        if (-not $ok) { $bad++ }
        Write-Host ("  {0} {1,-22} {2}  {3,10} bytes  {4}" -f $(if ($ok) { 'OK  ' } else { 'BAD ' }), $t.label, $r.StatusCode, $r.RawContentLength, $ct)
    } catch {
        $bad++
        Write-Host ("  FAIL {0,-22} {1}" -f $t.label, $_.Exception.Message)
    }
}
Write-Host ""
Write-Host ("total delivered: " + [math]::Round($mb / 1MB, 2) + " MB")
Write-Host ("problems: " + $bad)
if ($bad -eq 0) { Write-Host "ALL GOOD - the public URL serves the complete site" }
