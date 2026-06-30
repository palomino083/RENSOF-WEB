$source = "C:\Users\MARTIN\Documents\Codex\2026-06-30\ha\outputs\RENSOF-WEB-actualizado"
$target = "C:\Users\MARTIN\Downloads\RENSOF-WEB"
Copy-Item (Join-Path $source "index.html") (Join-Path $target "index.html") -Force
Copy-Item (Join-Path $source "assets\css\style.css") (Join-Path $target "assets\css\style.css") -Force
Write-Host "Grafico de Prospectiva actualizado en $target"
