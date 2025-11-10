// server/scripts/cleanup-database.js
/**
 * Script de limpieza de base de datos
 * - Elimina todos los usuarios excepto jesusbloise@gmail.com
 * - Asegura que jesusbloise sea 'owner' en todos los workspaces
 * - Elimina workspaces huérfanos
 * - Elimina datos CRM huérfanos
 */

const db = require("../db/connection");

console.log("🧹 INICIANDO LIMPIEZA DE BASE DE DATOS...\n");

// 1️⃣ Encontrar jesusbloise
const jesus = db
  .prepare("SELECT id, email, name FROM users WHERE email = ?")
  .get("jesusbloise@gmail.com");

if (!jesus) {
  console.error("❌ ERROR: Usuario jesusbloise@gmail.com no encontrado");
  console.error("   Ejecuta primero el seed o crea el usuario manualmente");
  process.exit(1);
}

console.log("✅ Usuario encontrado:");
console.log(`   ID: ${jesus.id}`);
console.log(`   Email: ${jesus.email}`);
console.log(`   Nombre: ${jesus.name}\n`);

// 2️⃣ Obtener lista de todos los usuarios (excepto jesusbloise)
const otherUsers = db
  .prepare("SELECT id, email, name FROM users WHERE id != ?")
  .all(jesus.id);

console.log(`📋 Usuarios a eliminar: ${otherUsers.length}`);
otherUsers.forEach((u) => {
  console.log(`   - ${u.email} (${u.name})`);
});
console.log("");

// 3️⃣ Obtener todos los workspaces
const allWorkspaces = db
  .prepare("SELECT id, name, created_by FROM tenants")
  .all();

console.log(`📦 Workspaces existentes: ${allWorkspaces.length}`);
allWorkspaces.forEach((w) => {
  console.log(`   - ${w.id} (${w.name}) - creado por: ${w.created_by}`);
});
console.log("");

// 4️⃣ EJECUTAR LIMPIEZA EN TRANSACCIÓN
const cleanup = db.transaction(() => {
  console.log("🔄 Ejecutando limpieza...\n");

  // A) Eliminar membresías de otros usuarios
  const deletedMemberships = db
    .prepare("DELETE FROM memberships WHERE user_id != ?")
    .run(jesus.id);
  console.log(
    `✅ Membresías eliminadas: ${deletedMemberships.changes}`
  );

  // B) Asegurar que jesusbloise sea 'owner' en todos los workspaces
  let updatedWorkspaces = 0;
  let createdMemberships = 0;

  allWorkspaces.forEach((workspace) => {
    // Actualizar created_by del workspace a jesusbloise
    db.prepare("UPDATE tenants SET created_by = ? WHERE id = ?").run(
      jesus.id,
      workspace.id
    );
    updatedWorkspaces++;

    // Asegurar que jesusbloise tenga membresía como 'owner'
    const existing = db
      .prepare(
        "SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ?"
      )
      .get(jesus.id, workspace.id);

    if (!existing) {
      db.prepare(
        `INSERT INTO memberships (user_id, tenant_id, role, created_at, updated_at)
         VALUES (?, ?, 'owner', ?, ?)`
      ).run(jesus.id, workspace.id, Date.now(), Date.now());
      createdMemberships++;
    } else {
      // Actualizar a 'owner' si no lo es
      db.prepare(
        "UPDATE memberships SET role = 'owner', updated_at = ? WHERE user_id = ? AND tenant_id = ?"
      ).run(Date.now(), jesus.id, workspace.id);
    }
  });

  console.log(
    `✅ Workspaces actualizados: ${updatedWorkspaces}`
  );
  console.log(
    `✅ Membresías de jesusbloise creadas/actualizadas: ${createdMemberships}`
  );

  // C) Eliminar datos CRM de otros usuarios
  const tables = ["leads", "contacts", "accounts", "deals", "notes", "activities"];
  let totalDeleted = 0;

  tables.forEach((table) => {
    try {
      const result = db
        .prepare(`DELETE FROM ${table} WHERE created_by != ?`)
        .run(jesus.id);
      console.log(
        `✅ ${table}: ${result.changes} registros eliminados`
      );
      totalDeleted += result.changes;
    } catch (e) {
      console.log(`⚠️  ${table}: tabla no existe o error - ${e.message}`);
    }
  });

  console.log(`✅ Total registros CRM eliminados: ${totalDeleted}`);

  // D) Eliminar otros usuarios
  const deletedUsers = db
    .prepare("DELETE FROM users WHERE id != ?")
    .run(jesus.id);
  console.log(`✅ Usuarios eliminados: ${deletedUsers.changes}`);
});

// EJECUTAR
try {
  cleanup();
  console.log("\n🎉 LIMPIEZA COMPLETADA EXITOSAMENTE\n");
} catch (error) {
  console.error("\n❌ ERROR EN LIMPIEZA:", error);
  process.exit(1);
}

// 5️⃣ VERIFICACIÓN FINAL
console.log("📊 ESTADO FINAL DE LA BASE DE DATOS:\n");

const finalUsers = db
  .prepare("SELECT id, email, name FROM users")
  .all();
console.log(`👥 Usuarios restantes: ${finalUsers.length}`);
finalUsers.forEach((u) => {
  console.log(`   ✓ ${u.email} (${u.name})`);
});

const finalWorkspaces = db
  .prepare("SELECT id, name, created_by FROM tenants")
  .all();
console.log(`\n📦 Workspaces: ${finalWorkspaces.length}`);
finalWorkspaces.forEach((w) => {
  console.log(`   ✓ ${w.id} (${w.name})`);
});

const finalMemberships = db
  .prepare(
    `SELECT m.role, t.name as workspace, u.email
     FROM memberships m
     JOIN tenants t ON t.id = m.tenant_id
     JOIN users u ON u.id = m.user_id
     ORDER BY t.name`
  )
  .all();
console.log(`\n🔑 Membresías: ${finalMemberships.length}`);
finalMemberships.forEach((m) => {
  console.log(`   ✓ ${m.email} es ${m.role} en ${m.workspace}`);
});

console.log("\n✅ Base de datos lista para el nuevo sistema de roles\n");
