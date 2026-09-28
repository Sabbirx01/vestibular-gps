# Syntax-check every JS module the site loads, including vendor addons.
#
# WHY THIS IS SHAPED LIKE THIS
# The first version ran `node --check <file>` per file and read $LASTEXITCODE
# straight after. In this environment node is launched through a shim that
# returns BEFORE the script has finished running, so $LASTEXITCODE was 0 (or
# unset) no matter what the file contained — the tool printed "0 failures" for
# modules it had never parsed. A checker that cannot fail is worse than no
# checker.
#
# So now the whole sweep happens inside ONE node process, which writes its
# findings to a JSON file, and this script WAITS for that file. No result file
# means NOT VERIFIED, and it exits non-zero — it never reports a pass it did
# not observe.
#
#   powershell -ExecutionPolicy Bypass -File tools/check-syntax.ps1

$root = Split-Path -Parent $PSScriptRoot
$tmp  = Join-Path $env:TEMP 'vgps-syntax'
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$helper = Join-Path $tmp 'check.mjs'
$result = Join-Path $tmp 'result.json'

$js = @'
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

/* argv: [node, helper, root, resultPath, tmpDir] */
const [root, resultPath, tmpDir] = process.argv.slice(2);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (extname(e.name) === '.js') out.push(p);
  }
  return out;
}

/* `node --check` only accepts CommonJS by default; these are ES modules, so
   each file is copied to .mjs first — same trick the original script used. */
const files = walk(join(root, 'src'));
const vendor = ['vendor/three.module.js', 'vendor/loaders/GLTFLoader.js', 'vendor/utils/BufferGeometryUtils.js']
  .map((v) => ({ label: v, path: join(root, v) }));

const failures = [];
const checked = [];

function check(label, srcPath) {
  const dest = join(tmpDir, basename(srcPath).replace(/\.js$/, '.mjs'));
  writeFileSync(dest, readFileSync(srcPath));
  try {
    execFileSync(process.execPath, ['--check', dest], { stdio: 'pipe' });
    checked.push(label);
  } catch (e) {
    const err = String(e.stderr || e.message || e);
    failures.push({ label, error: err.split('\n').slice(0, 4).join(' | ') });
  }
}

for (const f of files) check(f.replace(root, ''), f);
let vendorMissing = 0;
for (const v of vendor) {
  try { statSync(v.path); } catch { vendorMissing++; failures.push({ label: v.label, error: 'FILE MISSING' }); continue; }
  check(v.label, v.path);
}

writeFileSync(resultPath, JSON.stringify({
  srcModules: files.length,
  vendorModules: vendor.length - vendorMissing,
  failures,
}, null, 2));
'@

[System.IO.File]::WriteAllText($helper, $js, (New-Object System.Text.UTF8Encoding($false)))
& node $helper $root $result $tmp | Out-Null

$waited = 0
while (-not (Test-Path $result) -and $waited -lt 40000) {
  Start-Sleep -Milliseconds 500
  $waited += 500
}

if (-not (Test-Path $result)) {
  Write-Host "  node produced no result after $($waited/1000)s."
  Write-Host "  NOT VERIFIED - do not read this as a pass."
  exit 1
}

$r = Get-Content $result -Raw | ConvertFrom-Json

Write-Host "=== src/ ==="
Write-Host ("  modules: " + $r.srcModules + "   failures: " + $r.failures.Count)
Write-Host ""
Write-Host "=== vendor/ ==="
foreach ($v in @('vendor\three.module.js', 'vendor\loaders\GLTFLoader.js', 'vendor\utils\BufferGeometryUtils.js')) {
  $p = Join-Path $root $v
  if (Test-Path $p) {
    Write-Host ("  ok    " + $v + "  (" + (Get-Item $p).Length + " bytes)")
  } else {
    Write-Host ("  MISSING  " + $v)
  }
}

if ($r.failures.Count -gt 0) {
  Write-Host ""
  Write-Host "=== failures ==="
  foreach ($f in $r.failures) { Write-Host ("  FAIL  " + $f.label); Write-Host ("        " + $f.error) }
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
Write-Host ("TOTAL FAILURES: " + $r.failures.Count)
if ($r.failures.Count -gt 0) { exit 1 }
