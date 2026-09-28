# Read the JSON chunk out of a GLB and list its material names + PBR values,
# so materials can be targeted by name instead of guessed at.
param([string]$Path)

$b = [System.IO.File]::ReadAllBytes($Path)
$c0len  = [System.BitConverter]::ToUInt32($b, 12)
$c0type = [System.Text.Encoding]::ASCII.GetString($b[16..19])
$json = [System.Text.Encoding]::UTF8.GetString($b[20..(20 + $c0len - 1)])
$g = $json | ConvertFrom-Json

Write-Host ("file: " + (Split-Path $Path -Leaf))
Write-Host ("materials: " + ($g.materials | Measure-Object).Count)
Write-Host ""
Write-Host ("{0,-34} {1,-10} {2,-16} {3}" -f 'NAME', 'ALBEDO', 'METAL/ROUGH', 'EXTENSIONS')
Write-Host ("-" * 92)

foreach ($m in $g.materials) {
    $alb = 'n/a'
    if ($m.pbrMetallicRoughness.baseColorFactor) {
        $c = $m.pbrMetallicRoughness.baseColorFactor
        $alb = ('{0:F2},{1:F2},{2:F2}' -f $c[0], $c[1], $c[2])
    } elseif ($m.extensions.KHR_materials_pbrSpecularGlossiness.diffuseFactor) {
        $c = $m.extensions.KHR_materials_pbrSpecularGlossiness.diffuseFactor
        $alb = ('SG {0:F2},{1:F2},{2:F2}' -f $c[0], $c[1], $c[2])
    } elseif ($m.extensions.KHR_materials_pbrSpecularGlossiness.diffuseTexture) {
        $alb = 'SG textured'
    }

    $mr = 'default'
    if ($m.pbrMetallicRoughness.metallicFactor -ne $null) {
        $mr = ('m{0:F2} r{1:F2}' -f $m.pbrMetallicRoughness.metallicFactor, $m.pbrMetallicRoughness.roughnessFactor)
    } elseif ($m.extensions.KHR_materials_pbrSpecularGlossiness.glossinessFactor -ne $null) {
        $mr = ('gloss {0:F2}' -f $m.extensions.KHR_materials_pbrSpecularGlossiness.glossinessFactor)
    }

    $ext = ''
    if ($m.extensions) { $ext = (($m.extensions | Get-Member -MemberType NoteProperty).Name -join ', ') }

    Write-Host ("{0,-34} {1,-10} {2,-16} {3}" -f $m.name, $alb, $mr, $ext)
}

Write-Host ""
Write-Host "=== which materials each mesh primitive uses ==="
foreach ($mesh in $g.meshes) {
    Write-Host ("mesh: " + $mesh.name)
    foreach ($p in $mesh.primitives) {
        $n = '?'
        if ($p.material -ne $null) { $n = $g.materials[$p.material].name }
        Write-Host ("   primitive material: " + $n)
    }
}

Write-Host ""
Write-Host "=== images / textures present? ==="
Write-Host ("images: " + ($g.images | Measure-Object).Count + "   textures: " + ($g.textures | Measure-Object).Count)
if ($g.images) { $g.images | ForEach-Object { Write-Host ("   image: " + $_.name + "  mime=" + $_.mimeType) } }
