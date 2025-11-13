# Script para convertir rutas a async/await
# Agrega 'await' antes de cada 'db.prepare(' que no lo tenga

$files = @(
    "routes\contacts.js",
    "routes\activities.js",
    "routes\accounts.js",
    "routes\notes.js"
)

foreach ($file in $files) {
    Write-Host "Procesando $file..." -ForegroundColor Cyan
    
    $content = Get-Content $file -Raw
    
    # Contar ocurrencias antes
    $beforeCount = ([regex]::Matches($content, "(?<!await )db\.prepare\(")).Count
    
    if ($beforeCount -eq 0) {
        Write-Host "  ✅ Ya está convertido (0 ocurrencias sin await)" -ForegroundColor Green
        continue
    }
    
    # Agregar 'await ' antes de 'db.prepare(' que NO tenga ya 'await '
    $content = $content -replace '(?<!await )(\s+)(db\.prepare\()', '$1await $2'
    
    # Contar después
    $afterCount = ([regex]::Matches($content, "(?<!await )db\.prepare\(")).Count
    
    # Guardar
    Set-Content -Path $file -Value $content -NoNewline
    
    Write-Host "  ✅ Convertido: $beforeCount llamadas → $afterCount restantes" -ForegroundColor Green
}

Write-Host "`n✅ Conversión completada!" -ForegroundColor Green
Write-Host "Reinicia el servidor con: npm start" -ForegroundColor Yellow
