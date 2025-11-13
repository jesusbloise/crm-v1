// server/scripts/addGoogleIcsColumn.js
// Agrega la columna google_ics_url a la tabla users si no existe

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 
  `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;

const pool = new Pool({ connectionString });

async function addColumn() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 AGREGANDO COLUMNA google_ics_url A TABLA users');
    console.log(`📋 Conectando a: ${connectionString.replace(/:[^:]*@/, ':****@')}`);
    
    // Verificar si la columna ya existe
    const check = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
        AND column_name = 'google_ics_url';
    `);
    
    if (check.rows.length > 0) {
      console.log('ℹ️  La columna google_ics_url ya existe en la tabla users');
    } else {
      console.log('➕ Agregando columna google_ics_url...');
      await client.query(`
        ALTER TABLE users ADD COLUMN google_ics_url TEXT;
      `);
      console.log('✅ Columna google_ics_url agregada exitosamente');
    }
    
    // Verificar resultado
    const verify = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
        AND column_name = 'google_ics_url';
    `);
    
    console.log('\n🔍 Verificación:');
    console.log('   column_name:', verify.rows[0]?.column_name);
    console.log('   data_type:', verify.rows[0]?.data_type);
    
    console.log('\n✅ ¡COMPLETADO!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

addColumn();
