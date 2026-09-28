# ==============================================================
# fix-readability.ps1
# Raises every undersized font in the stylesheet and the canvas
# drawing code to the token floor.
#
# Why: the UI carried labels at 0.55-0.6rem (8.8-9.6px) and canvas
# text at 9px. That is below the size most people read comfortably
# on a screen, and it was the main readability complaint.
#
#   powershell -ExecutionPolicy Bypass -File tools\fix-readability.ps1
#   powershell -ExecutionPolicy Bypass -File tools\fix-readability.ps1 -Apply
#
# Without -Apply it only reports what it would change.
# ==============================================================
param([switch]$Apply)

$root = Split-Path -Parent $PSScriptRoot
$dry  = -not $Apply

# --- CSS: replace tiny literal sizes with the token scale ------------
$cssMap = @(
    @{ find = 'font-size:\s*0\.5[0-9]+rem'; replace = 'font-size: var(--fs-2xs)' },
    @{ find = 'font-size:\s*0\.6\d*rem';    replace = 'font-size: var(--fs-xs)'  },
    @{ find = 'font-size:\s*0\.7[0-5]\d*rem'; replace = 'font-size: var(--fs-xs)' }
)

# --- canvas / JS: bump px text sizes ---------------------------------
$jsMap = @(
    @{ find = "font = '9px ui-monospace, monospace'";  replace = "font = '11px ui-monospace, monospace'" },
    @{ find = 'font = ''9px ui-monospace, monospace'''; replace = 'font = ''11px ui-monospace, monospace''' },
    @{ find = "font = '8px ui-monospace, monospace'";  replace = "font = '10px ui-monospace, monospace'" },
    @{ find = "font = '12px ui-monospace, monospace'"; replace = "font = '13px ui-monospace, monospace'" }
)

function Invoke-Map {
    param([string]$Path, $Map, [string]$Label)
    $text = Get-Content -Raw -Encoding UTF8 $Path
    $original = $text
    $hits = 0
    foreach ($m in $Map) {
        $found = [regex]::Matches($text, $m.find)
        if ($found.Count -gt 0) {
            $hits += $found.Count
            Write-Host ("    {0,-46} x{1}" -f $m.find, $found.Count)
            $text = [regex]::Replace($text, $m.find, $m.replace)
        }
    }
    if ($hits -gt 0 -and -not $dry) {
        Set-Content -Path $Path -Value $text -Encoding UTF8 -NoNewline
        Write-Host ("    -> written")
    }
    return $hits
}

$total = 0

Write-Host "=== stylesheets ==="
foreach ($f in (Get-ChildItem (Join-Path $root 'src\styles') -Filter *.css)) {
    Write-Host ("  " + $f.Name)
    $total += Invoke-Map -Path $f.FullName -Map $cssMap -Label $f.Name
}

Write-Host ""
Write-Host "=== canvas text in JS ==="
foreach ($f in (Get-ChildItem (Join-Path $root 'src') -Recurse -Filter *.js)) {
    $before = $total
    $n = Invoke-Map -Path $f.FullName -Map $jsMap -Label $f.Name
    if ($n -gt 0) { Write-Host ("  " + $f.Name) | Out-Null }
    $total += $n
}

Write-Host ""
Write-Host ("changes identified: " + $total)
if ($dry) {
    Write-Host "DRY RUN - nothing written. Re-run with -Apply to commit the changes."
} else {
    Write-Host "APPLIED."
}
