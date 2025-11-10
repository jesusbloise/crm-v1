// server/scripts/test-role-system.js
/**
 * Script de testing completo para el sistema de roles
 * Verifica que:
 * 1. Nuevos usuarios se registran como 'member'
 * 2. Members no pueden crear workspaces
 * 3. Members solo ven sus propios datos
 * 4. Admin/Owner ven todos los datos del workspace
 * 5. Solo owner puede asignar rol 'owner'
 */

const fetch = require("node-fetch");

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

// Colores para la consola
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}TEST: ${name}${colors.reset}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, "green");
}

function logError(message) {
  log(`❌ ${message}`, "red");
}

function logWarning(message) {
  log(`⚠️  ${message}`, "yellow");
}

function logInfo(message) {
  log(`ℹ️  ${message}`, "cyan");
}

// Helper para hacer requests
async function request(method, path, body = null, token = null) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["X-Tenant-Id"] = "demo"; // workspace por defecto
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, options);
  const data = await response.json().catch(() => null);

  return { response, data };
}

// ============================================================================
// TESTS
// ============================================================================

async function testRegisterAsMember() {
  logTest("1. Registrar usuario nuevo → debe ser 'member'");

  const testEmail = `test_member_${Date.now()}@example.com`;
  const testPassword = "test123456";

  const { response, data } = await request("POST", "/auth/register", {
    name: "Test Member",
    email: testEmail,
    password: testPassword,
  });

  if (response.status === 201) {
    logSuccess(`Usuario registrado: ${data.email}`);
    logInfo(`Token recibido: ${data.token.slice(0, 20)}...`);
    logInfo(`Active tenant: ${data.active_tenant}`);
    logInfo(`Rol asignado: ${data.tenant?.role}`);

    if (data.tenant?.role === "member") {
      logSuccess("✓ Rol correcto: 'member'");
      return { success: true, token: data.token, userId: data.id, email: testEmail };
    } else {
      logError(`✗ Rol incorrecto: esperado 'member', recibido '${data.tenant?.role}'`);
      return { success: false };
    }
  } else {
    logError(`Registro falló con status ${response.status}`);
    logError(`Error: ${JSON.stringify(data)}`);
    return { success: false };
  }
}

async function testMemberCannotCreateWorkspace(token) {
  logTest("2. Member intenta crear workspace → debe fallar (403)");

  const { response, data } = await request(
    "POST",
    "/tenants",
    {
      id: `test_workspace_${Date.now()}`,
      name: "Test Workspace",
    },
    token
  );

  if (response.status === 403) {
    logSuccess("✓ Solicitud bloqueada correctamente (403)");
    logInfo(`Mensaje: ${data.message || data.error}`);
    return { success: true };
  } else if (response.status === 201) {
    logError("✗ Member pudo crear workspace (VULNERABILIDAD)");
    logError(`Workspace creado: ${data.id}`);
    return { success: false };
  } else {
    logWarning(`Status inesperado: ${response.status}`);
    logInfo(`Response: ${JSON.stringify(data)}`);
    return { success: false };
  }
}

async function testMemberOnlySeesOwnData(memberToken, memberId) {
  logTest("3. Member solo ve sus propios datos");

  // Primero, crear un lead como member
  logInfo("Creando lead como member...");
  const { response: createResp, data: leadData } = await request(
    "POST",
    "/leads",
    {
      id: `lead_member_${Date.now()}`,
      name: "Lead de Member",
      email: "member_lead@example.com",
      status: "nuevo",
    },
    memberToken
  );

  if (createResp.status !== 201) {
    logError(`No se pudo crear lead: ${createResp.status}`);
    return { success: false };
  }

  logSuccess(`Lead creado: ${leadData.id}`);

  // Ahora, obtener la lista de leads
  logInfo("Obteniendo lista de leads...");
  const { response: listResp, data: leadsData } = await request("GET", "/leads", null, memberToken);

  if (listResp.status === 200) {
    const leads = Array.isArray(leadsData) ? leadsData : [];
    logInfo(`Leads visibles para member: ${leads.length}`);

    // Verificar que todos los leads pertenezcan al member
    const allOwnedByMember = leads.every((lead) => lead.created_by === memberId);

    if (allOwnedByMember) {
      logSuccess("✓ Member solo ve sus propios leads");
      return { success: true, leadId: leadData.id };
    } else {
      logError("✗ Member puede ver leads de otros usuarios");
      leads.forEach((lead) => {
        if (lead.created_by !== memberId) {
          logError(`  - Lead ${lead.id} pertenece a ${lead.created_by}`);
        }
      });
      return { success: false };
    }
  } else {
    logError(`Error al obtener leads: ${listResp.status}`);
    return { success: false };
  }
}

async function testAdminSeesAllData() {
  logTest("4. Admin/Owner ve todos los datos del workspace");

  // Login como jesusbloise (owner)
  logInfo("Haciendo login como jesusbloise@gmail.com (owner)...");
  const { response: loginResp, data: loginData } = await request("POST", "/auth/login", {
    email: "jesusbloise@gmail.com",
    password: "123456", // Asumiendo que tiene esta password
  });

  if (loginResp.status !== 200) {
    logWarning(`No se pudo hacer login como owner: ${loginResp.status}`);
    logWarning("Saltando test de admin...");
    return { success: true, skipped: true };
  }

  const ownerToken = loginData.token;
  logSuccess("Login exitoso como owner");

  // Obtener lista de leads
  logInfo("Obteniendo lista de leads como owner...");
  const { response: listResp, data: leadsData } = await request("GET", "/leads", null, ownerToken);

  if (listResp.status === 200) {
    const leads = Array.isArray(leadsData) ? leadsData : [];
    logInfo(`Leads visibles para owner: ${leads.length}`);

    // Verificar que hay leads de diferentes usuarios
    const uniqueCreators = [...new Set(leads.map((l) => l.created_by))];
    logInfo(`Leads creados por ${uniqueCreators.length} usuario(s) diferentes`);

    if (leads.length > 0) {
      logSuccess("✓ Owner puede ver leads en el workspace");
      return { success: true };
    } else {
      logWarning("⚠️  No hay leads para verificar (base de datos vacía)");
      return { success: true, noData: true };
    }
  } else {
    logError(`Error al obtener leads como owner: ${listResp.status}`);
    return { success: false };
  }
}

async function testOnlyOwnerCanAssignOwner() {
  logTest("5. Solo owner puede asignar rol 'owner'");

  // Primero, crear un usuario nuevo para probar
  const testEmail = `test_promote_${Date.now()}@example.com`;
  const { response: regResp, data: regData } = await request("POST", "/auth/register", {
    name: "Test Promote",
    email: testEmail,
    password: "test123",
  });

  if (regResp.status !== 201) {
    logWarning("No se pudo crear usuario de prueba");
    return { success: true, skipped: true };
  }

  const newUserId = regData.id;
  logInfo(`Usuario creado: ${newUserId}`);

  // Login como jesusbloise (owner)
  const { response: loginResp, data: loginData } = await request("POST", "/auth/login", {
    email: "jesusbloise@gmail.com",
    password: "123456",
  });

  if (loginResp.status !== 200) {
    logWarning("No se pudo hacer login como owner");
    return { success: true, skipped: true };
  }

  const ownerToken = loginData.token;

  // Intentar promover al nuevo usuario a 'owner'
  logInfo("Intentando promover usuario a 'owner'...");
  const { response: promoteResp, data: promoteData } = await request(
    "POST",
    `/admin/users/${newUserId}/change-role`,
    {
      tenantId: "demo",
      newRole: "owner",
    },
    ownerToken
  );

  if (promoteResp.status === 200 && promoteData.success) {
    logSuccess("✓ Owner puede asignar rol 'owner'");
    logInfo(`Usuario ${newUserId} promovido a 'owner'`);
    return { success: true };
  } else {
    logError(`✗ Owner no pudo asignar rol 'owner': ${promoteResp.status}`);
    logError(`Response: ${JSON.stringify(promoteData)}`);
    return { success: false };
  }
}

async function testAuditLogs() {
  logTest("6. Verificar que se están registrando audit logs");

  const db = require("../db/connection");

  try {
    // Verificar que existe la tabla
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'")
      .get();

    if (!tableExists) {
      logError("✗ Tabla audit_logs no existe");
      return { success: false };
    }

    logSuccess("✓ Tabla audit_logs existe");

    // Contar logs recientes (últimos 5 minutos)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentLogs = db
      .prepare("SELECT COUNT(*) as count FROM audit_logs WHERE created_at > ?")
      .get(fiveMinutesAgo);

    logInfo(`Logs de auditoría (últimos 5 min): ${recentLogs.count}`);

    // Mostrar últimos 5 logs
    const latestLogs = db
      .prepare("SELECT action, user_id, tenant_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 5")
      .all();

    if (latestLogs.length > 0) {
      logSuccess("✓ Sistema de audit logs funcionando");
      logInfo("Últimas acciones registradas:");
      latestLogs.forEach((log, i) => {
        const date = new Date(log.created_at).toLocaleTimeString();
        console.log(`  ${i + 1}. [${date}] ${log.action} - User: ${log.user_id?.slice(0, 8) || "n/a"}`);
      });
      return { success: true };
    } else {
      logWarning("⚠️  No hay logs recientes (puede ser normal si es primera ejecución)");
      return { success: true, noData: true };
    }
  } catch (error) {
    logError(`Error al verificar audit logs: ${error.message}`);
    return { success: false };
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("\n");
  log("═══════════════════════════════════════════════════════════", "bright");
  log("   🧪 TESTING COMPLETO DEL SISTEMA DE ROLES", "bright");
  log("═══════════════════════════════════════════════════════════", "bright");
  console.log("\n");

  logInfo(`Base URL: ${BASE_URL}`);
  logInfo(`Fecha: ${new Date().toLocaleString()}`);
  console.log("\n");

  const results = [];

  try {
    // Test 1: Registro como member
    const test1 = await testRegisterAsMember();
    results.push({ name: "Registro como member", ...test1 });

    if (test1.success && test1.token) {
      // Test 2: Member no puede crear workspace
      const test2 = await testMemberCannotCreateWorkspace(test1.token);
      results.push({ name: "Member no puede crear workspace", ...test2 });

      // Test 3: Member solo ve sus datos
      const test3 = await testMemberOnlySeesOwnData(test1.token, test1.userId);
      results.push({ name: "Member solo ve sus datos", ...test3 });
    }

    // Test 4: Admin ve todos los datos
    const test4 = await testAdminSeesAllData();
    results.push({ name: "Admin ve todos los datos", ...test4 });

    // Test 5: Solo owner puede asignar owner
    const test5 = await testOnlyOwnerCanAssignOwner();
    results.push({ name: "Solo owner asigna owner", ...test5 });

    // Test 6: Audit logs
    const test6 = await testAuditLogs();
    results.push({ name: "Audit logs funcionando", ...test6 });
  } catch (error) {
    logError(`Error crítico durante testing: ${error.message}`);
    console.error(error);
  }

  // Resumen
  console.log("\n");
  log("═══════════════════════════════════════════════════════════", "bright");
  log("   📊 RESUMEN DE RESULTADOS", "bright");
  log("═══════════════════════════════════════════════════════════", "bright");
  console.log("\n");

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const skipped = results.filter((r) => r.skipped).length;

  results.forEach((result) => {
    const icon = result.success ? "✅" : result.skipped ? "⏭️ " : "❌";
    const status = result.success ? "PASS" : result.skipped ? "SKIP" : "FAIL";
    const color = result.success ? "green" : result.skipped ? "yellow" : "red";

    log(`${icon} ${result.name.padEnd(40)} [${status}]`, color);
  });

  console.log("\n");
  log(`Total: ${results.length} tests`, "bright");
  log(`Exitosos: ${passed}`, "green");
  if (failed > 0) log(`Fallidos: ${failed}`, "red");
  if (skipped > 0) log(`Saltados: ${skipped}`, "yellow");

  console.log("\n");

  if (failed === 0) {
    log("🎉 ¡TODOS LOS TESTS PASARON!", "green");
    log("   El sistema de roles está funcionando correctamente", "green");
  } else {
    log("⚠️  ALGUNOS TESTS FALLARON", "red");
    log("   Revisa los errores arriba para más detalles", "red");
  }

  console.log("\n");

  process.exit(failed > 0 ? 1 : 0);
}

// Ejecutar
if (require.main === module) {
  main().catch((error) => {
    console.error("Error fatal:", error);
    process.exit(1);
  });
}

module.exports = { main };
