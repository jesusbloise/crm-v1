// server/scripts/fix-all-sqlite-placeholders.js
// Verifica todos los archivos .js en busca de placeholders SQLite (?)
// y lista los que necesitan actualización a PostgreSQL ($1, $2, etc.)

const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '../routes');
const libDir = path.join(__dirname, '../lib');

// Pattern para detectar placeholders SQLite en queries
const sqlitePattern = /\.prepare\([^)]*WHERE[^)]*\?/g;

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = content.match(sqlitePattern);
  
  if (matches && matches.length > 0) {
    console.log(`\n📄 ${path.basename(filePath)}`);
    console.log(`   Placeholders SQLite encontrados: ${matches.length}`);
    
    // Contar líneas con ?
    const lines = content.split('\n');
    let count = 0;
    lines.forEach((line, index) => {
      if (line.includes('.prepare(') && line.includes('?')) {
        count++;
        if (count <= 5) { // Mostrar solo las primeras 5
          console.log(`   Línea ${index + 1}: ${line.trim().substring(0, 80)}...`);
        }
      }
    });
    
    if (count > 5) {
      console.log(`   ... y ${count - 5} más`);
    }
    
    return count;
  }
  
  return 0;
}

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  let totalFiles = 0;
  let totalMatches = 0;
  
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isFile() && file.endsWith('.js')) {
      const matches = scanFile(fullPath);
      if (matches > 0) {
        totalFiles++;
        totalMatches += matches;
      }
    }
  });
  
  return { files: totalFiles, matches: totalMatches };
}

console.log('🔍 BUSCANDO PLACEHOLDERS SQLite (?) en PostgreSQL\n');
console.log('═══════════════════════════════════════════════════\n');

console.log('📁 Escaneando /routes...');
const routesResult = scanDirectory(routesDir);

console.log('\n📁 Escaneando /lib...');
const libResult = scanDirectory(libDir);

console.log('\n\n📊 RESUMEN:');
console.log('═══════════════════════════════════════════════════');
console.log(`Archivos con placeholders SQLite: ${routesResult.files + libResult.files}`);
console.log(`Total de queries afectados: ${routesResult.matches + libResult.matches}`);

console.log('\n\n⚠️  ACCIÓN REQUERIDA:');
console.log('═══════════════════════════════════════════════════');
console.log('Los archivos listados arriba usan placeholders SQLite (?)');
console.log('que NO funcionan con PostgreSQL.');
console.log('\nDebes actualizar manualmente:');
console.log('  ❌ WHERE id = ?');
console.log('  ✅ WHERE id = $1');
console.log('\nPara múltiples placeholders:');
console.log('  ❌ WHERE id = ? AND tenant_id = ?');
console.log('  ✅ WHERE id = $1 AND tenant_id = $2');
console.log('\n✨ Recomendación: Actualiza los archivos de /routes primero,');
console.log('   ya que son los endpoints críticos del API.\n');
