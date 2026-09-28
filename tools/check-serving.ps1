# ==============================================================
# check-serving.ps1
# Verifies that every file the running server must deliver is
# actually reachable, including the 3D model files. Run this
# after `python serve.py` is up.
#
#   powershell -ExecutionPolicy Bypass -File tools\check-serving.ps1
#   powershell -ExecutionPolicy Bypass -File tools\check-serving.ps1 -Port 8323
# ==============================================================
param([int]$Port = 8322)

$base = "http://127.0.0.1:$Port"

$targets = @(
    @{ path = '/';                                    label = 'index.html' },
    @{ path = '/src/main.js';                         label = 'app entry' },
    @{ path = '/src/three/ModelLibrary.js';           label = 'ModelLibrary' },
    @{ path = '/src/three/Astronaut.js';              label = 'Astronaut' },
    @{ path = '/src/three/BrainModel.js';             label = 'BrainModel' },
    @{ path = '/vendor/three.module.js';              label = 'three.js' },
    @{ path = '/vendor/loaders/GLTFLoader.js';        label = 'GLTFLoader' },
    @{ path = '/vendor/loaders/DRACOLoader.js';       label = 'DRACOLoader' },
    @{ path = '/vendor/utils/BufferGeometryUtils.js'; label = 'BufferGeometryUtils' },
    @{ path = '/vendor/libs/draco/gltf/draco_decoder.js';       label = 'draco decoder js' },
    @{ path = '/vendor/libs/draco/gltf/draco_decoder.wasm';     label = 'draco decoder wasm' },
    @{ path = '/vendor/libs/draco/gltf/draco_wasm_wrapper.js';  label = 'draco wasm wrapper' },
    @{ path = '/assets/models/nasa-aces-suit.glb';    label = 'NASA suit GLB' },
    @{ path = '/assets/models/nih-brain.glb';         label = 'NIH brain GLB' }
)

Write-Host ("checking " + $base)
Write-Host ""
$bad = 0
$total = 0
foreach ($t in $targets) {
    try {
        $r = Invoke-WebRequest -Uri ($base + $t.path) -UseBasicParsing -TimeoutSec 90 -Method Get
        $total += $r.RawContentLength
        $cc = $r.Headers['Cache-Control']
        $ct = $r.Headers['Content-Type']
        $flag = 'OK  '
        if ($r.StatusCode -ne 200) { $flag = 'BAD '; $bad++ }
        Write-Host ("  {0} {1,-22} {2}  {3,10} bytes  {4}" -f $flag, $t.label, $r.StatusCode, $r.RawContentLength, $ct)
        if ($cc -notmatch 'no-store') { Write-Host ("       warning: Cache-Control is '" + $cc + "' (expected no-store)"); $bad++ }
    } catch {
        $bad++
        Write-Host ("  FAIL {0,-22} {1}" -f $t.label, $_.Exception.Message)
    }
}

Write-Host ""
Write-Host ("payload total: " + [math]::Round($total / 1MB, 2) + " MB")
Write-Host ("problems: " + $bad)
if ($bad -eq 0) { Write-Host "ALL GOOD - open $base/" }
