// server/scripts/reset-jesus-password.js
/**
 * Actualiza el password de jesusbloise@gmail.com a '123456'
 */

const db = require("../db/connection");
const bcrypt = require("bcryptjs");

const JESUS_EMAIL = "jesusbloise@gmail.com";
const NEW_PASSWORD = "123456";

console.log("🔐 Actualizando password de jesusbloise...\n");

// Buscar usuario
const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(JESUS_EMAIL);

if (!user) {
  console.log(`❌ Usuario ${JESUS_EMAIL} no encontrado`);
  process.exit(1);
}

console.log(`✅ Usuario encontrado: ${user.id}`);

// Generar nuevo hash
const newHash = bcrypt.hashSync(NEW_PASSWORD, 10);

// Actualizar en la DB
db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
  .run(newHash, Date.now(), user.id);

console.log(`✅ Password actualizado a: '${NEW_PASSWORD}'`);
console.log(`\n✅ Ahora puedes hacer login con:`);
console.log(`   Email: ${JESUS_EMAIL}`);
console.log(`   Password: ${NEW_PASSWORD}`);
