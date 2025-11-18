/**
 * 🔄 SINCRONIZAR BASE DE DATOS LOCAL → PRODUCCIÓN
 * 
 * Este script:
 * 1. Exporta la estructura y datos de DB local
 * 2. Se conecta a la DB de producción
 * 3. Aplica los cambios automáticamente
 * 
 * ⚠️  IMPORTANTE: Solo sincroniza estructura, NO datos transaccionales
 * 
 * Uso:
 *   node scripts/sync-db-to-production.js
 *   node scripts/sync-db-to-production.js --dry-run  (solo preview)
 *   node scripts/sync-db-to-production.js --force     (forzar sin confirmación)
 */

const { Pool } = require('pg');
const readline = require('readline');

// ========================================
// CONFIGURACIÓN
// ========================================

const LOCAL_DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/crm_v1';
const PRODUCTION_DB_URL = process.env.DATABASE_URL_PRODUCTION;

if (!PRODUCTION_DB_URL) {
  console.error('❌ ERROR: Debes configurar DATABASE_URL_PRODUCTION en .env');
  console.error('   Ejemplo: DATABASE_URL_PRODUCTION=postgresql://user:pass@host:5432/db');
  process.exit(1);
}

// Tablas con datos que SE sincronizan
const SYNC_DATA_TABLES = [
  'tenants',
  'users',
  'memberships'
];

// Tablas que solo sincronizamos estructura
const SYNC_STRUCTURE_ONLY = [
  'leads',
  'contacts',
  'accounts',
  'deals',
  'activities',
  'notes',
  'events',
  'audit_logs',
  'migrations_log'
];

// ========================================
// FUNCIONES AUXILIARES
// ========================================

function askConfirmation(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`${question} (y/N): `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function getTableStructure(client, tableName) {
  const result = await client.query(`
    SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns 
    WHERE table_name = $1 
    ORDER BY ordinal_position
  `, [tableName]);

  return result.rows;
}

async function getTableData(client, tableName) {
  const result = await client.query(`SELECT * FROM ${tableName}`);
  return result.rows;
}

async function compareSchemas(localClient, prodClient, tableName) {
  console.log(`🔍 Comparando esquema de tabla: ${tableName}`);
  
  const localSchema = await getTableStructure(localClient, tableName);
  const prodSchema = await getTableStructure(prodClient, tableName);

  // Detectar columnas nuevas en local que no están en producción
  const newColumns = localSchema.filter(localCol => 
    !prodSchema.some(prodCol => prodCol.column_name === localCol.column_name)
  );

  // Detectar columnas que fueron eliminadas
  const removedColumns = prodSchema.filter(prodCol =>
    !localSchema.some(localCol => localCol.column_name === prodCol.column_name)
  );

  return {
    tableName,
    newColumns,
    removedColumns,
    hasChanges: newColumns.length > 0 || removedColumns.length > 0
  };
}

async function syncTableStructure(prodClient, tableName, changes, dryRun = false) {
  if (!changes.hasChanges) {
    console.log(`  ✅ ${tableName}: Sin cambios de estructura`);
    return;
  }

  console.log(`\n📝 Sincronizando estructura de tabla: ${tableName}`);

  // Agregar columnas nuevas
  for (const col of changes.newColumns) {
    let dataType = col.data_type.toUpperCase();
    if (dataType === 'CHARACTER VARYING') {
      dataType = col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'TEXT';
    } else if (dataType === 'BIGINT') {
      dataType = 'BIGINT';
    }

    const nullable = col.is_nullable === 'YES' ? '' : ' NOT NULL';
    const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
    
    const sql = `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${col.column_name} ${dataType}${nullable}${defaultVal};`;
    
    console.log(`  + Agregar columna: ${col.column_name} (${dataType})`);
    
    if (!dryRun) {
      try {
        await prodClient.query(sql);
        console.log(`    ✅ Columna agregada`);
      } catch (err) {
        console.error(`    ❌ Error agregando columna:`, err.message);
      }
    } else {
      console.log(`    🔍 [DRY RUN] SQL: ${sql}`);
    }
  }

  // Eliminar columnas (solo con confirmación)
  for (const col of changes.removedColumns) {
    console.log(`  - Eliminar columna: ${col.column_name}`);
    console.log(`    ⚠️  ADVERTENCIA: Esta columna existe en producción pero no en local`);
    
    if (!dryRun) {
      const confirm = await askConfirmation(`    ¿Eliminar columna ${tableName}.${col.column_name}?`);
      if (confirm) {
        const sql = `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${col.column_name};`;
        try {
          await prodClient.query(sql);
          console.log(`    ✅ Columna eliminada`);
        } catch (err) {
          console.error(`    ❌ Error eliminando columna:`, err.message);
        }
      } else {
        console.log(`    ⏭️  Columna preservada`);
      }
    }
  }
}

async function syncTableData(localClient, prodClient, tableName, dryRun = false) {
  console.log(`\n📊 Sincronizando datos de tabla: ${tableName}`);
  
  const localData = await getTableData(localClient, tableName);
  
  if (localData.length === 0) {
    console.log(`  ℹ️  No hay datos en local para sincronizar`);
    return;
  }

  console.log(`  📦 ${localData.length} registros encontrados en local`);

  if (dryRun) {
    console.log(`  🔍 [DRY RUN] Se sincronizarían ${localData.length} registros`);
    return;
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const row of localData) {
    const columns = Object.keys(row);
    const values = Object.values(row);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    
    // UPSERT: INSERT ... ON CONFLICT ... DO UPDATE
    const updateSet = columns
      .filter(col => col !== 'id') // No actualizar el ID
      .map(col => `${col} = EXCLUDED.${col}`)
      .join(', ');

    const sql = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (id) DO UPDATE SET ${updateSet}
    `;

    try {
      const result = await prodClient.query(sql, values);
      if (result.rowCount > 0) {
        inserted++;
      } else {
        updated++;
      }
    } catch (err) {
      errors++;
      console.error(`  ❌ Error sincronizando registro ${row.id}:`, err.message);
    }
  }

  console.log(`  ✅ Sincronización completada:`);
  console.log(`     - Insertados: ${inserted}`);
  console.log(`     - Actualizados: ${updated}`);
  if (errors > 0) {
    console.log(`     - Errores: ${errors}`);
  }
}

// ========================================
// FUNCIÓN PRINCIPAL
// ========================================

async function syncDatabase(options = {}) {
  const { dryRun = false, force = false } = options;

  console.log('🚀 SINCRONIZACIÓN DE BASE DE DATOS\n');
  console.log(`📍 LOCAL:      ${LOCAL_DB_URL}`);
  console.log(`📍 PRODUCCIÓN: ${PRODUCTION_DB_URL.replace(/:[^:@]+@/, ':***@')}\n`);

  if (dryRun) {
    console.log('🔍 MODO DRY RUN: No se harán cambios reales\n');
  }

  // Confirmar antes de proceder
  if (!force && !dryRun) {
    console.log('⚠️  ADVERTENCIA: Esta operación modificará la base de datos de PRODUCCIÓN');
    const confirmed = await askConfirmation('¿Deseas continuar?');
    if (!confirmed) {
      console.log('❌ Operación cancelada por el usuario');
      process.exit(0);
    }
  }

  const localPool = new Pool({ connectionString: LOCAL_DB_URL });
  const prodPool = new Pool({ connectionString: PRODUCTION_DB_URL });

  try {
    const localClient = await localPool.connect();
    const prodClient = await prodPool.connect();

    console.log('✅ Conectado a ambas bases de datos\n');

    const allTables = [...SYNC_DATA_TABLES, ...SYNC_STRUCTURE_ONLY];

    // ========================================
    // PASO 1: Sincronizar estructura
    // ========================================

    console.log('📋 PASO 1: SINCRONIZANDO ESTRUCTURA\n');

    for (const table of allTables) {
      const changes = await compareSchemas(localClient, prodClient, table);
      await syncTableStructure(prodClient, table, changes, dryRun);
    }

    // ========================================
    // PASO 2: Sincronizar datos (solo tablas configuradas)
    // ========================================

    console.log('\n📊 PASO 2: SINCRONIZANDO DATOS\n');

    for (const table of SYNC_DATA_TABLES) {
      await syncTableData(localClient, prodClient, table, dryRun);
    }

    console.log('\n✨ SINCRONIZACIÓN COMPLETADA EXITOSAMENTE\n');

    localClient.release();
    prodClient.release();

  } catch (err) {
    console.error('\n❌ ERROR FATAL:', err);
    throw err;
  } finally {
    await localPool.end();
    await prodPool.end();
  }
}

// ========================================
// EJECUCIÓN
// ========================================

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

syncDatabase({ dryRun, force })
  .then(() => {
    console.log('👋 Proceso finalizado');
    process.exit(0);
  })
  .catch(err => {
    console.error('💥 Error fatal:', err);
    process.exit(1);
  });
