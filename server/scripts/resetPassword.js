#!/usr/bin/env node
/**
 * 🔑 Script para resetear contraseña de jesusbloise@gmail.com
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL no está configurada");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("railway.app") || DATABASE_URL.includes("render.com")
    ? { rejectUnauthorized: false }
    : false,
});

async function resetPassword() {
  const client = await pool.connect();
  
  try {
    const email = "jesusbloise@gmail.com";
    const newPassword = "jesus123";
    
    console.log(`\n🔑 Reseteando contraseña de ${email}...`);
    
    // Generar nuevo hash
    const hash = bcrypt.hashSync(newPassword, 10);
    console.log(`✅ Hash generado: ${hash.substring(0, 20)}...`);
    
    // Actualizar en la base de datos
    const result = await client.query(
      `UPDATE users SET password_hash = $1, updated_at = $2 WHERE email = $3`,
      [hash, Date.now(), email]
    );
    
    if (result.rowCount === 0) {
      console.error(`❌ Usuario ${email} no encontrado`);
      process.exit(1);
    }
    
    console.log(`✅ Contraseña actualizada exitosamente`);
    console.log(`\n📝 Credenciales:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${newPassword}`);
    console.log(`\n✅ Puedes hacer login ahora!\n`);
    
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetPassword();
