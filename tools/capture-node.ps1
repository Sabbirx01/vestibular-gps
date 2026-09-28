# Run the OSI harness and capture BOTH streams to a file so a crash is visible.
# ASCII only.
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$out = Join-Path $root 'tests\_node-output.txt'
Remove-Item $out -ErrorAction SilentlyContinue

$ErrorActionPreference = 'Continue'
$p = Start-Process -FilePath 'node' -ArgumentList 'tests\osi.test.mjs' -WorkingDirectory $root -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput (Join-Path $root 'tests\_node-stdout.txt') `
    -RedirectStandardError  (Join-Path $root 'tests\_node-stderr.txt')

Write-Host ("node exit code: " + $p.ExitCode)

foreach ($f in @('tests\_node-stdout.txt', 'tests\_node-stderr.txt')) {
    $p2 = Join-Path $root $f
    Write-Host ""
    Write-Host ("--- " + $f + " ---")
    if (Test-Path $p2) {
        $c = Get-Content $p2 -Raw
        if ($c -and $c.Trim()) { Write-Host $c } else { Write-Host "(empty)" }
    } else {
        Write-Host "(not created)"
    }
}

Write-Host ""
Write-Host "--- tests\osi.test.result.txt ---"
$r = Join-Path $root 'tests\osi.test.result.txt'
if (Test-Path $r) { Get-Content $r | ForEach-Object { Write-Host $_ } } else { Write-Host "(not written)" }
