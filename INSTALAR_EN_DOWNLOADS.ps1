$source = "C:\Users\MARTIN\Documents\Codex\2026-06-30\ha\outputs\RENSOF-WEB-futurista-agro5"
$target = "C:\Users\MARTIN\Downloads\RENSOF-WEB"
$items = @("index.html", "servicios.html", "assets")
foreach ($item in $items) {
  $from = Join-Path $source $item
  $to = Join-Path $target $item
  if (Test-Path $from) {
    if (Test-Path $to) { Remove-Item $to -Recurse -Force }
    Copy-Item $from $to -Recurse -Force
  }
}
Write-Host "RENSOF futurista Agro 5.0 instalado en $target"
