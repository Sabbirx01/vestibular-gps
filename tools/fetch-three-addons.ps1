# Fetch GLTFLoader (and its local dependencies) for the vendored three.js r169.
# The npm copy imports from the bare specifier 'three', which browsers cannot
# resolve, so the specifier is rewritten to the local vendored module.

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$v    = Join-Path $root 'vendor'
$loaders = Join-Path $v 'loaders'
$utils   = Join-Path $v 'utils'
New-Item -ItemType Directory -Force -Path $loaders | Out-Null
New-Item -ItemType Directory -Force -Path $utils | Out-Null

$ver = '0.169.0'
$base = "https://cdn.jsdelivr.net/npm/three@$ver/examples/jsm"

$files = @(
    @{ url = "$base/loaders/GLTFLoader.js";           out = (Join-Path $loaders 'GLTFLoader.js') },
    @{ url = "$base/utils/BufferGeometryUtils.js";    out = (Join-Path $utils   'BufferGeometryUtils.js') }
)

foreach ($f in $files) {
    $name = Split-Path $f.out -Leaf
    Write-Host ("--- " + $name)
    try {
        Invoke-WebRequest -Uri $f.url -OutFile $f.out -TimeoutSec 120 -UseBasicParsing
        $len = (Get-Item $f.out).Length
        Write-Host ("    saved " + $len + " bytes")

        # rewrite bare 'three' specifier to the local vendored module
        $src = Get-Content -Raw -Encoding UTF8 $f.out
        $before = $src
        $src = $src -replace "from\s+'three'", "from '../../vendor/three.module.js'"
        $src = $src -replace 'from\s+"three"', 'from "../../vendor/three.module.js"'
        if ($src -ne $before) {
            Set-Content -Path $f.out -Value $src -Encoding UTF8 -NoNewline
            Write-Host "    rewrote 'three' import -> ../../vendor/three.module.js"
        }
        # show remaining relative imports so we can fetch anything else needed
        foreach ($m in [regex]::Matches($src, "from\s+'(\.[^']+)'")) {
            Write-Host ("    also imports: " + $m.Groups[1].Value)
        }
    } catch {
        Write-Host ("    FAILED: " + $_.Exception.Message)
    }
}

Write-Host ""
Write-Host "=== vendor tree ==="
Get-ChildItem $v -Recurse -File | ForEach-Object {
    Write-Host ("  {0,-40} {1,10} bytes" -f $_.FullName.Replace($root, ''), $_.Length)
}
