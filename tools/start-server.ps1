# ==============================================================
# start-server.ps1
#
# IMPORTANT — why this script does not launch the server itself:
#
# In this environment python is a managed runtime whose PATH is
# injected into the agent shell. Start-Process and `cmd /c start`
# do not inherit that injection, so a detached launch silently
# fails and you get "Unable to connect to the remote server".
# Verified: both approaches were tried and both produced no listener.
#
# So this script does the two things it CAN do reliably:
#   1. clear the port if something stale is holding it
#   2. health-check whatever is running there
#
# Run the server in your own terminal (it then stays up indefinitely):
#
#     cd "F:\Nasa Project\VESTIBULAR GPS Webpage"
#     python serve.py 8322
#
# ==============================================================
param([int]$Port = 8322)

$ErrorActionPreference = 'Continue'
$base = "http://127.0.0.1:$Port"

# --- 1. clear a stale listener ---------------------------------------
$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    $existing | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        Write-Host ("stopping stale listener PID " + $_)
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
    Write-Host "port cleared. Start the server in your own terminal:"
    Write-Host ('    cd "' + (Split-Path -Parent $PSScriptRoot) + '"')
    Write-Host ("    python serve.py $Port")
    exit 0
}

# --- 2. is anything already serving? ---------------------------------
try {
    $r = Invoke-WebRequest -Uri ($base + '/') -UseBasicParsing -TimeoutSec 10
    Write-Host ("A server is already running on port $Port (HTTP " + $r.StatusCode + ").")
    Write-Host ""
    & (Join-Path $PSScriptRoot 'check-serving.ps1') -Port $Port
    exit 0
} catch {
    Write-Host ("Nothing is serving on port $Port yet.")
    Write-Host ""
    Write-Host "Start it in your own terminal so it stays up:"
    Write-Host ('    cd "' + (Split-Path -Parent $PSScriptRoot) + '"')
    Write-Host ("    python serve.py $Port")
    Write-Host ""
    Write-Host "Then open:  $base/"
    Write-Host ""
    Write-Host "Why the models need a server: GLTFLoader fetches the GLB files over HTTP."
    Write-Host "Opening index.html directly from disk (file://) is blocked by CORS, so the"
    Write-Host "real NASA/NIH meshes will not load - the site falls back to its procedural"
    Write-Host "figures instead of breaking."
    exit 0
}
