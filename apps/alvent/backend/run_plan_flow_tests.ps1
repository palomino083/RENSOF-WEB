$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PythonExe = Join-Path $RepoRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    throw "No se encontró Python en .venv. Activa/crea la venv primero."
}

Push-Location $RepoRoot
try {
    & $PythonExe -m unittest backend.tests.test_plan_flows -v
}
finally {
    Pop-Location
}
