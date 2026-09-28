# ==============================================================
# run-tests.ps1
# Runs the OSI engine validation harness.
#
#   powershell -ExecutionPolicy Bypass -File tools\run-tests.ps1
#
# ASCII only on purpose: Windows PowerShell 5.1 reads a UTF-8 file
# without a BOM as ANSI, and a non-ASCII character in a comment can
# break the parser.
# ==============================================================

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# The harness writes its own report file next to itself. Node's stdout is not
# captured reliably when piped through this shell, and piping also masks the
# real exit code (a pipeline reports the LAST command's code, not node's).
$report = Join-Path $root 'tests\osi.test.result.txt'
Remove-Item $report -ErrorAction SilentlyContinue

& node 'tests\osi.test.mjs' 2>&1 | Out-Null
$code = $LASTEXITCODE

if (Test-Path $report) {
    Get-Content $report | ForEach-Object { Write-Host $_ }
} else {
    Write-Host "no report file written - the harness did not reach the end"
}

Write-Host ""
Write-Host ("exit code: " + $code)
if ($code -eq 0) {
    Write-Host "RESULT: ALL TESTS PASSED"
} else {
    Write-Host "RESULT: TESTS FAILED"
}
