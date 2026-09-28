# Confirm the files added in the latest deploy are actually live.
$ErrorActionPreference = 'Continue'
$base = 'https://sabbirx01.github.io/vestibular-gps'

$paths = @(
    '/src/core/osi.js',
    '/src/ui/console.js',
    '/src/ui/integration.js',
    '/src/sensors/webcam.js',
    '/src/three/environment.js',
    '/src/three/surfaceDetail.js',
    '/src/styles/console.css',
    '/docs/ARCHITECTURE.md',
    '/docs/SOURCES.md',
    '/docs/SENSOR_API.md',
    '/docs/TESTING.md',
    '/docs/DEPLOYMENT.md',
    '/docs/SCIENCE.md',
    '/docs/MASTER-PROMPT-BN.md',
    '/README.md',
    '/serve.py',
    '/tests/osi.test.mjs',
    '/tools/check-syntax.ps1'
)

$bad = 0
foreach ($p in $paths) {
    try {
        $r = Invoke-WebRequest -Uri ($base + $p) -UseBasicParsing -TimeoutSec 60
        $flag = if ($r.StatusCode -eq 200) { 'OK  ' } else { 'BAD ' ; $bad++ }
        Write-Host ("  {0} {1,-34} {2}  {3,8} bytes" -f $flag, $p, $r.StatusCode, $r.RawContentLength)
    } catch {
        $bad++
        Write-Host ("  FAIL {0,-34} {1}" -f $p, $_.Exception.Message)
    }
}
Write-Host ""
Write-Host ("new-file problems: " + $bad)
