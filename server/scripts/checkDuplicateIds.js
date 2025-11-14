require('dotenv').config();
const { Pool } = require('pg');

// Construir DATABASE_URL desde variables individuales si no existe
const DATABASE_URL = process.env.DATABASE_URL || 
  `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'atomica'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'crm-v1'}`;

const pool = new Pool({ connectionString: DATABASE_URL });

async function checkDuplicates() {
  try {
    console.log('🔍 Verificando IDs duplicados en PostgreSQL...\n');

    // Check notes
    const notesResult = await pool.query(`
      SELECT id, COUNT(*) as count 
      FROM notes 
      GROUP BY id 
      HAVING COUNT(*) > 1 
      ORDER BY count DESC 
      LIMIT 20
    `);
    
    console.log(`📋 IDs duplicados en tabla NOTES: ${notesResult.rows.length}`);
    if (notesResult.rows.length > 0) {
      notesResult.rows.forEach(r => {
        console.log(`  ❌ ID: ${r.id} | Count: ${r.count}`);
      });
    } else {
      console.log('  ✅ No hay IDs duplicados en notes');
    }

    console.log('');

    // Check activities
    const activitiesResult = await pool.query(`
      SELECT id, COUNT(*) as count 
      FROM activities 
      GROUP BY id 
      HAVING COUNT(*) > 1 
      ORDER BY count DESC 
      LIMIT 20
    `);
    
    console.log(`🎯 IDs duplicados en tabla ACTIVITIES: ${activitiesResult.rows.length}`);
    if (activitiesResult.rows.length > 0) {
      activitiesResult.rows.forEach(r => {
        console.log(`  ❌ ID: ${r.id} | Count: ${r.count}`);
      });
    } else {
      console.log('  ✅ No hay IDs duplicados en activities');
    }

    console.log('');

    // Check total counts
    const notesCount = await pool.query('SELECT COUNT(*) as total FROM notes');
    const activitiesCount = await pool.query('SELECT COUNT(*) as total FROM activities');
    
    console.log(`📊 Total de registros:`);
    console.log(`  Notes: ${notesCount.rows[0].total}`);
    console.log(`  Activities: ${activitiesCount.rows[0].total}`);

    // Check ID length distribution
    console.log('\n📏 Distribución de longitud de IDs (notes):');
    const notesLengthResult = await pool.query(`
      SELECT LENGTH(id) as id_length, COUNT(*) as count 
      FROM notes 
      GROUP BY LENGTH(id) 
      ORDER BY id_length
    `);
    notesLengthResult.rows.forEach(r => {
      console.log(`  Longitud ${r.id_length}: ${r.count} registros`);
    });

    console.log('\n📏 Distribución de longitud de IDs (activities):');
    const activitiesLengthResult = await pool.query(`
      SELECT LENGTH(id) as id_length, COUNT(*) as count 
      FROM activities 
      GROUP BY LENGTH(id) 
      ORDER BY id_length
    `);
    activitiesLengthResult.rows.forEach(r => {
      console.log(`  Longitud ${r.id_length}: ${r.count} registros`);
    });

    // Check recent IDs that start with common prefixes
    console.log('\n🔍 Últimos 10 IDs generados (activities):');
    const recentActivitiesResult = await pool.query(`
      SELECT id, created_at 
      FROM activities 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    recentActivitiesResult.rows.forEach(r => {
      console.log(`  ${r.id} (${r.created_at})`);
    });

    console.log('\n🔍 Últimos 10 IDs generados (notes):');
    const recentNotesResult = await pool.query(`
      SELECT id, created_at 
      FROM notes 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    recentNotesResult.rows.forEach(r => {
      console.log(`  ${r.id} (${r.created_at})`);
    });

    // Check if there are IDs with the same prefix
    console.log('\n🎯 Buscando IDs con prefijos comunes (activities):');
    const prefixResult = await pool.query(`
      SELECT SUBSTRING(id, 1, 10) as prefix, COUNT(*) as count 
      FROM activities 
      GROUP BY SUBSTRING(id, 1, 10) 
      HAVING COUNT(*) > 5
      ORDER BY count DESC 
      LIMIT 10
    `);
    if (prefixResult.rows.length > 0) {
      console.log(`  ⚠️ Encontrados ${prefixResult.rows.length} prefijos con >5 registros:`);
      prefixResult.rows.forEach(r => {
        console.log(`    Prefix: ${r.prefix} | Count: ${r.count}`);
      });
    } else {
      console.log('  ✅ No hay prefijos con alta repetición');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDuplicates();
