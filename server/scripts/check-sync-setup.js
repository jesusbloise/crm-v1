#!/usr/bin/env node

/**
 * 🧪 VERIFICAR CONFIGURACIÓN DE SINCRONIZACIÓN
 * 
 * Este script verifica que todo esté configurado correctamente
 * antes de ejecutar la sincronización.
 */

require('dotenv').config();
const { Pool } = require('pg');

const checks = [];

async function runChecks() {
  console.log('🔍 VERIFICANDO CONFIGURACIÓN DE SINCRONIZACIÓN\n');

  // ========================================
  // CHECK 1: Variables de entorno
  // ========================================
  
  console.log('1️⃣ Verificando variables de entorno...');
  
  const DATABASE_URL = process.env.DATABASE_URL;
  const DATABASE_URL_PRODUCTION = process.env.DATABASE_URL_PRODUCTION;
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!DATABASE_URL) {
    checks.push({ name: 'DATABASE_URL', status: '❌', message: 'No configurada' });
  } else {
    checks.push({ name: 'DATABASE_URL', status: '✅', message: 'Configurada' });
  }

  if (!DATABASE_URL_PRODUCTION) {
    checks.push({ name: 'DATABASE_URL_PRODUCTION', status: '⚠️', message: 'No configurada (necesaria para sync)' });
  } else {
    checks.push({ name: 'DATABASE_URL_PRODUCTION', status: '✅', message: 'Configurada' });
  }

  if (!JWT_SECRET) {
    checks.push({ name: 'JWT_SECRET', status: '⚠️', message: 'No configurada' });
  } else {
    checks.push({ name: 'JWT_SECRET', status: '✅', message: 'Configurada' });
  }

  // ========================================
  // CHECK 2: Conexión a DB Local
  // ========================================

  console.log('\n2️⃣ Verificando conexión a base de datos local...');

  if (DATABASE_URL) {
    try {
      const localPool = new Pool({ connectionString: DATABASE_URL });
      const client = await localPool.connect();
      const result = await client.query('SELECT current_database(), version()');
      const dbName = result.rows[0].current_database;
      const version = result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1];
      
      checks.push({ 
        name: 'DB Local', 
        status: '✅', 
        message: `Conectado a "${dbName}" (${version})` 
      });
      
      client.release();
      await localPool.end();
    } catch (err) {
      checks.push({ 
        name: 'DB Local', 
        status: '❌', 
        message: `Error: ${err.message}` 
      });
    }
  } else {
    checks.push({ 
      name: 'DB Local', 
      status: '⏭️', 
      message: 'Saltado (DATABASE_URL no configurada)' 
    });
  }

  // ========================================
  // CHECK 3: Conexión a DB Producción
  // ========================================

  console.log('\n3️⃣ Verificando conexión a base de datos de producción...');

  if (DATABASE_URL_PRODUCTION) {
    try {
      const prodPool = new Pool({ connectionString: DATABASE_URL_PRODUCTION });
      const client = await prodPool.connect();
      const result = await client.query('SELECT current_database(), version()');
      const dbName = result.rows[0].current_database;
      const version = result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1];
      
      checks.push({ 
        name: 'DB Producción', 
        status: '✅', 
        message: `Conectado a "${dbName}" (${version})` 
      });
      
      client.release();
      await prodPool.end();
    } catch (err) {
      checks.push({ 
        name: 'DB Producción', 
        status: '❌', 
        message: `Error: ${err.message}` 
      });
    }
  } else {
    checks.push({ 
      name: 'DB Producción', 
      status: '⏭️', 
      message: 'Saltado (DATABASE_URL_PRODUCTION no configurada)' 
    });
  }

  // ========================================
  // CHECK 4: Archivos de scripts
  // ========================================

  console.log('\n4️⃣ Verificando archivos de scripts...');

  const fs = require('fs');
  const path = require('path');

  const scriptsDir = path.join(__dirname);
  const requiredScripts = [
    'export-db-structure.js',
    'sync-db-to-production.js',
    'check-sync-setup.js'
  ];

  requiredScripts.forEach(script => {
    const scriptPath = path.join(scriptsDir, script);
    if (fs.existsSync(scriptPath)) {
      checks.push({ name: script, status: '✅', message: 'Existe' });
    } else {
      checks.push({ name: script, status: '❌', message: 'No encontrado' });
    }
  });

  // ========================================
  // CHECK 5: GitHub Workflow
  // ========================================

  console.log('\n5️⃣ Verificando GitHub Workflow...');

  const workflowPath = path.join(__dirname, '..', '..', '.github', 'workflows', 'sync-db.yml');
  if (fs.existsSync(workflowPath)) {
    checks.push({ name: 'GitHub Workflow', status: '✅', message: 'Configurado' });
  } else {
    checks.push({ name: 'GitHub Workflow', status: '⚠️', message: 'No encontrado (opcional)' });
  }

  // ========================================
  // RESUMEN
  // ========================================

  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMEN DE VERIFICACIÓN\n');

  checks.forEach(check => {
    console.log(`${check.status} ${check.name.padEnd(35)} ${check.message}`);
  });

  console.log('\n' + '='.repeat(80));

  const errors = checks.filter(c => c.status === '❌').length;
  const warnings = checks.filter(c => c.status === '⚠️').length;
  const success = checks.filter(c => c.status === '✅').length;

  console.log(`\n✅ Exitosos: ${success}`);
  console.log(`⚠️  Advertencias: ${warnings}`);
  console.log(`❌ Errores: ${errors}`);

  if (errors > 0) {
    console.log('\n❌ HAY ERRORES QUE DEBEN SER CORREGIDOS');
    console.log('   Revisa la configuración antes de ejecutar sincronización\n');
    process.exit(1);
  } else if (warnings > 0) {
    console.log('\n⚠️  HAY ADVERTENCIAS');
    console.log('   La sincronización puede funcionar pero con limitaciones\n');
    process.exit(0);
  } else {
    console.log('\n✅ TODO CONFIGURADO CORRECTAMENTE');
    console.log('   Puedes ejecutar: npm run db:sync:preview\n');
    process.exit(0);
  }
}

// ========================================
// EJECUCIÓN
// ========================================

runChecks()
  .catch(err => {
    console.error('\n💥 ERROR FATAL:', err);
    process.exit(1);
  });
