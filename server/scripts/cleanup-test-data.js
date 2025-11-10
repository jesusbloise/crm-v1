#!/usr/bin/env node
/**
 * Script para limpiar usuarios y workspaces de prueba
 * Elimina todos los usuarios y workspaces creados por los scripts de testing
 */

const db = require("../db/connection");

console.log("═══════════════════════════════════════════════════════════");
console.log("   🧹 LIMPIEZA DE DATOS DE PRUEBA");
console.log("═══════════════════════════════════════════════════════════\n");

try {
  // ========== CONTAR ANTES DE ELIMINAR ==========
  const usersBefore = db.prepare("SELECT COUNT(*) as count FROM users").get();
  const tenantsBefore = db.prepare("SELECT COUNT(*) as count FROM tenants").get();
  
  console.log("📊 Estado actual:");
  console.log(`   Usuarios: ${usersBefore.count}`);
  console.log(`   Workspaces: ${tenantsBefore.count}\n`);

  // ========== IDENTIFICAR DATOS DE PRUEBA ==========
  
  // Usuarios de prueba (emails que contienen "test_" o "debug_")
  const testUsers = db.prepare(`
    SELECT id, email, name 
    FROM users 
    WHERE email LIKE '%test_%' 
       OR email LIKE '%debug_%'
    ORDER BY email
  `).all();

  console.log(`🎯 Usuarios de prueba encontrados: ${testUsers.length}\n`);
  
  if (testUsers.length > 0) {
    console.log("Usuarios a eliminar:");
    testUsers.forEach((user, i) => {
      console.log(`   ${i + 1}. ${user.email} (${user.name})`);
    });
    console.log();
  }

  // Workspaces de prueba
  const testWorkspaces = db.prepare(`
    SELECT id, name 
    FROM tenants 
    WHERE id LIKE 'test_%' 
       OR name LIKE 'Test %'
    ORDER BY created_at DESC
  `).all();

  console.log(`🎯 Workspaces de prueba encontrados: ${testWorkspaces.length}\n`);
  
  if (testWorkspaces.length > 0) {
    console.log("Workspaces a eliminar:");
    testWorkspaces.forEach((ws, i) => {
      console.log(`   ${i + 1}. ${ws.name} (${ws.id})`);
    });
    console.log();
  }

  if (testUsers.length === 0 && testWorkspaces.length === 0) {
    console.log("✅ No hay datos de prueba para eliminar\n");
    console.log("═══════════════════════════════════════════════════════════\n");
    process.exit(0);
  }

  // ========== CONFIRMAR ELIMINACIÓN ==========
  console.log("⚠️  CONFIRMACIÓN REQUERIDA");
  console.log("   Esta acción eliminará todos los datos listados arriba.");
  console.log("   Los usuarios reales (jesusbloise, admin@demo.local, etc.) NO serán afectados.\n");

  // En scripts automatizados, asumir confirmación
  // Para uso manual, podrías agregar un prompt aquí
  console.log("🔄 Procediendo con la eliminación...\n");

  // ========== ELIMINAR EN TRANSACCIÓN ==========
  const txn = db.transaction(() => {
    let deletedUsers = 0;
    let deletedWorkspaces = 0;
    let deletedMemberships = 0;
    let deletedLeads = 0;
    let deletedNotes = 0;
    let deletedActivities = 0;

    // 1. Eliminar workspaces de prueba (esto eliminará cascada de memberships)
    if (testWorkspaces.length > 0) {
      for (const ws of testWorkspaces) {
        // Eliminar memberships
        const memb = db.prepare("DELETE FROM memberships WHERE tenant_id = ?").run(ws.id);
        deletedMemberships += memb.changes;

        // Eliminar leads
        const leads = db.prepare("DELETE FROM leads WHERE tenant_id = ?").run(ws.id);
        deletedLeads += leads.changes;

        // Eliminar notes
        const notes = db.prepare("DELETE FROM notes WHERE tenant_id = ?").run(ws.id);
        deletedNotes += notes.changes;

        // Eliminar activities
        const activities = db.prepare("DELETE FROM activities WHERE tenant_id = ?").run(ws.id);
        deletedActivities += activities.changes;

        // Eliminar contacts
        db.prepare("DELETE FROM contacts WHERE tenant_id = ?").run(ws.id);

        // Eliminar accounts
        db.prepare("DELETE FROM accounts WHERE tenant_id = ?").run(ws.id);

        // Eliminar deals
        db.prepare("DELETE FROM deals WHERE tenant_id = ?").run(ws.id);

        // Eliminar events
        db.prepare("DELETE FROM events WHERE tenant_id = ?").run(ws.id);

        // Eliminar audit logs
        db.prepare("DELETE FROM audit_logs WHERE tenant_id = ?").run(ws.id);

        // Eliminar el workspace
        db.prepare("DELETE FROM tenants WHERE id = ?").run(ws.id);
        deletedWorkspaces++;
      }
    }

    // 2. Eliminar memberships de usuarios de prueba (que no se eliminaron antes)
    if (testUsers.length > 0) {
      for (const user of testUsers) {
        const memb = db.prepare("DELETE FROM memberships WHERE user_id = ?").run(user.id);
        deletedMemberships += memb.changes;
      }
    }

    // 3. Eliminar usuarios de prueba
    if (testUsers.length > 0) {
      for (const user of testUsers) {
        // Eliminar leads creados por este usuario
        const leads = db.prepare("DELETE FROM leads WHERE created_by = ?").run(user.id);
        deletedLeads += leads.changes;

        // Eliminar notes creadas por este usuario
        const notes = db.prepare("DELETE FROM notes WHERE created_by = ?").run(user.id);
        deletedNotes += notes.changes;

        // Eliminar activities creadas por este usuario
        const activities = db.prepare("DELETE FROM activities WHERE created_by = ?").run(user.id);
        deletedActivities += activities.changes;

        // Eliminar el usuario
        db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
        deletedUsers++;
      }
    }

    return {
      deletedUsers,
      deletedWorkspaces,
      deletedMemberships,
      deletedLeads,
      deletedNotes,
      deletedActivities
    };
  });

  const results = txn();

  // ========== RESUMEN ==========
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ LIMPIEZA COMPLETADA");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  console.log("Eliminados:");
  console.log(`   👤 Usuarios: ${results.deletedUsers}`);
  console.log(`   📦 Workspaces: ${results.deletedWorkspaces}`);
  console.log(`   🔗 Memberships: ${results.deletedMemberships}`);
  console.log(`   📝 Leads: ${results.deletedLeads}`);
  console.log(`   📄 Notes: ${results.deletedNotes}`);
  console.log(`   📊 Activities: ${results.deletedActivities}\n`);

  // Contar después
  const usersAfter = db.prepare("SELECT COUNT(*) as count FROM users").get();
  const tenantsAfter = db.prepare("SELECT COUNT(*) as count FROM tenants").get();

  console.log("📊 Estado final:");
  console.log(`   Usuarios: ${usersAfter.count} (antes: ${usersBefore.count})`);
  console.log(`   Workspaces: ${tenantsAfter.count} (antes: ${tenantsBefore.count})\n`);

  // Listar usuarios restantes
  const remainingUsers = db.prepare(`
    SELECT email, name 
    FROM users 
    ORDER BY email
  `).all();

  console.log("👥 Usuarios restantes:");
  remainingUsers.forEach((user, i) => {
    console.log(`   ${i + 1}. ${user.email} (${user.name})`);
  });
  console.log();

  console.log("═══════════════════════════════════════════════════════════\n");

} catch (error) {
  console.error("\n❌ ERROR:", error.message);
  console.error(error);
  process.exit(1);
}
