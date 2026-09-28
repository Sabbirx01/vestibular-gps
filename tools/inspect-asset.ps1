# Inspect a downloaded asset: real type, GLB validity, and what is inside.
param([string]$Path)

if (-not (Test-Path $Path)) { Write-Host "not found: $Path"; exit 1 }

$b    = [System.IO.File]::ReadAllBytes($Path)
$name = Split-Path $Path -Leaf
Write-Host ("file   : " + $name)
Write-Host ("size   : " + $b.Length + " bytes")
Write-Host ("first4 : '" + [System.Text.Encoding]::ASCII.GetString($b[0..3]) + "'")
Write-Host ("hex    : " + (($b[0..15] | ForEach-Object { $_.ToString('x2') }) -join ' '))

if ($b.Length -ge 12 -and [System.Text.Encoding]::ASCII.GetString($b[0..3]) -eq 'glTF') {
    $ver = [System.BitConverter]::ToUInt32($b, 4)
    $len = [System.BitConverter]::ToUInt32($b, 8)
    Write-Host "type   : GLB (binary glTF)"
    Write-Host ("version: " + $ver)
    Write-Host ("declared length: " + $len + "  actual: " + $b.Length + "  match: " + ($len -eq $b.Length))

    # first chunk header: length then type
    $c0len  = [System.BitConverter]::ToUInt32($b, 12)
    $c0type = [System.Text.Encoding]::ASCII.GetString($b[16..19])
    Write-Host ("chunk0 : '" + $c0type + "' " + $c0len + " bytes")
    if ($c0type.Trim() -eq 'JSON') {
        $json = [System.Text.Encoding]::UTF8.GetString($b[20..(20 + $c0len - 1)])
        Write-Host ""
        Write-Host "--- glTF JSON summary ---"
        try {
            $g = $json | ConvertFrom-Json
            Write-Host ("generator : " + $g.asset.generator)
            Write-Host ("version   : " + $g.asset.version)
            Write-Host ("meshes    : " + ($g.meshes | Measure-Object).Count)
            Write-Host ("nodes     : " + ($g.nodes | Measure-Object).Count)
            Write-Host ("materials : " + ($g.materials | Measure-Object).Count)
            Write-Host ("textures  : " + ($g.textures | Measure-Object).Count)
            Write-Host ("images    : " + ($g.images | Measure-Object).Count)
            Write-Host ("animations: " + ($g.animations | Measure-Object).Count)
            if ($g.meshes) { Write-Host ("mesh names: " + (($g.meshes | ForEach-Object { $_.name }) -join ', ')) }
            if ($g.nodes)  { Write-Host ("node names: " + (($g.nodes  | ForEach-Object { $_.name } | Select-Object -First 25) -join ', ')) }
        } catch {
            Write-Host ("JSON parse failed: " + $_.Exception.Message)
            Write-Host ($json.Substring(0, [Math]::Min(400, $json.Length)))
        }
    }
} else {
    Write-Host "type   : NOT a GLB"
    Write-Host ("as text: " + [System.Text.Encoding]::UTF8.GetString($b[0..([Math]::Min(300, $b.Length - 1))]))
}
