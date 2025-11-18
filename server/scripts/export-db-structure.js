/**
 * 📦 EXPORTAR ESTRUCTURA Y DATOS DE BASE DE DATOS
 * 
 * Este script exporta:
 * 1. Estructura de todas las tablas (CREATE TABLE)
 * 2. Datos de tablas específicas (opcional)
 * 3. Genera archivo SQL para replicar en producción
 * 
 * Uso:
 *   node scripts/export-db-structure.js
 *   node scripts/export-db-structure.js --with-data
 */

const { pool } = require("../db/connection");
const fs = require("fs");
const path = require("path");

// Tablas que SI queremos exportar datos (usuarios demo, configuración, etc.)
const TABLES_WITH_DATA = [
  'tenants',
  'users', 
  'memberships'
];

// Tablas que NO exportamos datos (datos transaccionales)
const TABLES_STRUCTURE_ONLY = [
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

async function getTableStructure(client, tableName) {
  console.log(`📋 Obteniendo estructura de tabla: ${tableName}`);
  
  // Obtener columnas
  const columns = await client.query(`
    SELECT 
      column_name, 
      data_type, 
      character_maximum_length,
      is_nullable,
      column_default
    FROM information_schema.columns 
    WHERE table_name = $1 
    ORDER BY ordinal_position
  `, [tableName]);

  if (columns.rows.length === 0) {
    console.log(`⚠️  Tabla ${tableName} no existe, saltando...`);
    return null;
  }

  // Obtener constraints (PRIMARY KEY, UNIQUE, etc.)
  const constraints = await client.query(`
    SELECT 
      tc.constraint_name,
      tc.constraint_type,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_name = $1
  `, [tableName]);

  // Obtener índices
  const indexes = await client.query(`
    SELECT 
      indexname,
      indexdef
    FROM pg_indexes 
    WHERE tablename = $1
      AND indexname NOT LIKE '%_pkey'
  `, [tableName]);

  return {
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows
  };
}

async function generateCreateTableSQL(tableName, structure) {
  if (!structure) return '';

  let sql = `\n-- Tabla: ${tableName}\n`;
  sql += `DROP TABLE IF EXISTS ${tableName} CASCADE;\n`;
  sql += `CREATE TABLE ${tableName} (\n`;

  // Columnas
  const columnDefs = structure.columns.map(col => {
    let def = `  ${col.column_name} `;
    
    // Tipo de dato
    if (col.data_type === 'character varying') {
      def += col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'TEXT';
    } else if (col.data_type === 'bigint') {
      def += 'BIGINT';
    } else if (col.data_type === 'integer') {
      def += 'INTEGER';
    } else if (col.data_type === 'boolean') {
      def += 'BOOLEAN';
    } else {
      def += col.data_type.toUpperCase();
    }

    // NOT NULL
    if (col.is_nullable === 'NO') {
      def += ' NOT NULL';
    }

    // DEFAULT
    if (col.column_default) {
      // Limpiar defaults de PostgreSQL
      let defaultVal = col.column_default;
      if (defaultVal.includes('nextval')) {
        def += ' SERIAL';
      } else {
        def += ` DEFAULT ${defaultVal}`;
      }
    }

    return def;
  });

  sql += columnDefs.join(',\n');

  // PRIMARY KEY
  const pk = structure.constraints.find(c => c.constraint_type === 'PRIMARY KEY');
  if (pk) {
    sql += `,\n  PRIMARY KEY (${pk.column_name})`;
  }

  // UNIQUE constraints
  const uniques = structure.constraints.filter(c => c.constraint_type === 'UNIQUE');
  uniques.forEach(u => {
    sql += `,\n  UNIQUE (${u.column_name})`;
  });

  sql += '\n);\n';

  // Índices
  structure.indexes.forEach(idx => {
    sql += `${idx.indexdef};\n`;
  });

  return sql;
}

async function exportTableData(client, tableName) {
  console.log(`📊 Exportando datos de: ${tableName}`);
  
  const result = await client.query(`SELECT * FROM ${tableName}`);
  
  if (result.rows.length === 0) {
    return `\n-- Tabla ${tableName}: sin datos\n`;
  }

  let sql = `\n-- Datos de tabla: ${tableName} (${result.rows.length} registros)\n`;
  
  result.rows.forEach(row => {
    const columns = Object.keys(row);
    const values = Object.values(row).map(v => {
      if (v === null) return 'NULL';
      if (typeof v === 'number') return v;
      if (typeof v === 'boolean') return v;
      // Escapar strings
      return `'${String(v).replace(/'/g, "''")}'`;
    });

    sql += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
  });

  return sql;
}

async function exportDatabase(withData = false) {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Iniciando exportación de base de datos...\n');

    let fullSQL = `-- ========================================
-- 🐘 EXPORTACIÓN DE BASE DE DATOS
-- Generado: ${new Date().toISOString()}
-- ========================================

-- Configuración PostgreSQL
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

`;

    // ========================================
    // ESTRUCTURA DE TABLAS
    // ========================================
    
    const allTables = [...TABLES_WITH_DATA, ...TABLES_STRUCTURE_ONLY];
    
    console.log('📋 EXPORTANDO ESTRUCTURA DE TABLAS\n');
    
    for (const table of allTables) {
      const structure = await getTableStructure(client, table);
      if (structure) {
        const createSQL = await generateCreateTableSQL(table, structure);
        fullSQL += createSQL;
      }
    }

    // ========================================
    // DATOS (si se solicita)
    // ========================================

    if (withData) {
      console.log('\n📊 EXPORTANDO DATOS\n');
      
      fullSQL += '\n-- ========================================\n';
      fullSQL += '-- DATOS DE TABLAS\n';
      fullSQL += '-- ========================================\n';

      for (const table of TABLES_WITH_DATA) {
        const dataSQL = await exportTableData(client, table);
        fullSQL += dataSQL;
      }
    }

    // ========================================
    // GUARDAR ARCHIVO
    // ========================================

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `db-export-${timestamp}.sql`;
    const exportPath = path.join(__dirname, '..', 'exports', filename);
    
    // Crear carpeta exports si no existe
    const exportsDir = path.join(__dirname, '..', 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    fs.writeFileSync(exportPath, fullSQL, 'utf8');

    console.log(`\n✅ Exportación completada exitosamente!`);
    console.log(`📁 Archivo generado: ${exportPath}`);
    console.log(`📦 Tamaño: ${(fullSQL.length / 1024).toFixed(2)} KB`);
    console.log(`\n🚀 Para importar en producción:`);
    console.log(`   psql $DATABASE_URL < ${filename}`);

  } catch (err) {
    console.error('❌ Error exportando base de datos:', err);
    throw err;
  } finally {
    client.release();
  }
}

// ========================================
// EJECUCIÓN
// ========================================

const withData = process.argv.includes('--with-data');

exportDatabase(withData)
  .then(() => {
    console.log('\n✨ Proceso finalizado');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n💥 Error fatal:', err);
    process.exit(1);
  });
