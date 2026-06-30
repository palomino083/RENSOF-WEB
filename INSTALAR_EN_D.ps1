$source = "C:\Users\MARTIN\Documents\Codex\2026-06-30\ha\outputs\RENSOF-WEB-actualizado"
$target = "D:\NUBE MARTIN\OneDrive\ARCHIVOS 2026\RENSOF-WEB"
$items = @("index.html", "servicios.html", "proyectos.html", "nosotros.html", "publicaciones.html", "contacto.html", "main.py", "README.md", "requirements.txt", "CNAME", "LICENSE", "assets")
foreach ($item in $items) {
  $from = Join-Path $source $item
  $to = Join-Path $target $item
  if (Test-Path $from) {
    if (Test-Path $to) { Remove-Item $to -Recurse -Force }
    Copy-Item $from $to -Recurse -Force
  }
}
Write-Host "RENSOF-WEB actualizado en $target"
