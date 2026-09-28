# Syntax-check every JS module the site loads, including vendor addons.
$root = Split-Path -Parent $PSScriptRoot
$tmp  = Join-Path $env:TEMP 'vgps-syntax'
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$fail = 0
$n    = 0

Write-Host "=== src/ ==="
foreach ($f in (Get-ChildItem -Path (Join-Path $root 'src') -Recurse -Filter *.js)) {
    $n++
    $dest = Join-Path $tmp ($f.Name -replace '\.js$', '.mjs')
    Copy-Item $f.FullName $dest -Force
    & node --check $dest 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $fail++
        Write-Host ("  FAIL  " + $f.FullName.Replace($root, ''))
        & node --check $dest 2>&1 | Select-Object -First 4 | ForEach-Object { Write-Host ("        " + $_) }
    }
}
Write-Host ("  modules: $n   failures: $fail")

Write-Host ""
Write-Host "=== vendor/ ==="
foreach ($v in @('vendor\three.module.js', 'vendor\loaders\GLTFLoader.js', 'vendor\utils\BufferGeometryUtils.js')) {
    $p = Join-Path $root $v
    if (-not (Test-Path $p)) { Write-Host ("  MISSING  " + $v); $fail++; continue }
    $dest = Join-Path $tmp ((Split-Path $v -Leaf) -replace '\.js$', '.mjs')
    Copy-Item $p $dest -Force
    & node --check $dest 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $fail++
        Write-Host ("  FAIL  " + $v)
        & node --check $dest 2>&1 | Select-Object -First 4 | ForEach-Object { Write-Host ("        " + $_) }
    } else {
        $len = (Get-Item $p).Length
        Write-Host ("  ok    " + $v + "  (" + $len + " bytes)")
    }
}

Write-Host ""
Write-Host "=== assets ==="
foreach ($a in @('assets\models\nasa-aces-suit.glb', 'assets\models\nih-brain.glb')) {
    $p = Join-Path $root $a
    if (Test-Path $p) {
        $len = (Get-Item $p).Length
        $b = [System.IO.File]::ReadAllBytes($p)
        $magic = if ($len -ge 4) { [System.Text.Encoding]::ASCII.GetString($b[0..3]) } else { '' }
        Write-Host ("  {0,-40} {1,10} bytes  magic='{2}'" -f $a, $len, $magic)
    } else {
        Write-Host ("  MISSING  " + $a)
    }
}

Write-Host ""
Write-Host ("TOTAL FAILURES: " + $fail)
