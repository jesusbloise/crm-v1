#!/usr/bin/env node
/**
 * Test de eliminación de workspaces con diferentes roles
 * 
 * Valida que:
 * 1. Members NO pueden eliminar workspaces
 * 2. Admins SÍ pueden eliminar workspaces
 * 3. Owners SÍ pueden eliminar workspaces
 * 4. No se puede eliminar el workspace 'demo'
 */

const fetch = require("node-fetch");
const db = require("../db/connection");

const BASE_URL = "http://localhost:4000";

// Colores para terminal
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log("\n" + "━".repeat(60));
  log(title, "cyan");
  console.log("━".repeat(60) + "\n");
}

async function apiCall(url, options = {}) {
  const res = await fetch(BASE_URL + url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  return { status: res.status, data };
}

async function registerUser(email, password, name) {
  return apiCall("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
}

async function loginUser(email, password) {
  return apiCall("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

async function createWorkspace(token, tenantId, tenantName) {
  return apiCall("/tenants", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id: tenantId, name: tenantName }),
  });
}

async function deleteWorkspace(token, tenantId) {
  return apiCall(`/tenants/${tenantId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

async function setUserRole(userId, tenantId, role) {
  db.prepare(
    "UPDATE memberships SET role = ?, updated_at = ? WHERE user_id = ? AND tenant_id = ?"
  ).run(role, Date.now(), userId, tenantId);
}

function getUserId(email) {
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  return user?.id;
}

async function runTests() {
  log("═══════════════════════════════════════════════════════════", "bold");
  log("   🧪 TEST: ELIMINACIÓN DE WORKSPACES POR ROL", "bold");
  log("═══════════════════════════════════════════════════════════", "bold");

  const testResults = [];
  const timestamp = Date.now();

  try {
    // ========== TEST 1: Member NO puede eliminar workspace ==========
    section("TEST 1: Member intenta eliminar workspace → debe fallar (403)");

    const memberEmail = `test_member_${timestamp}@example.com`;
    const memberPassword = "123456";

    log("📝 Registrando usuario member...");
    const memberReg = await registerUser(memberEmail, memberPassword, "Test Member");
    
    if (memberReg.status !== 201) {
      log(`❌ Error registrando member: ${memberReg.status}`, "red");
      testResults.push({ test: "Member registration", passed: false });
      throw new Error("Failed to register member");
    }

    const memberLogin = await loginUser(memberEmail, memberPassword);
    const memberToken = memberLogin.data.token;
    const memberId = getUserId(memberEmail);

    log(`✅ Member registrado: ${memberEmail}`);
    log(`ℹ️  Member ID: ${memberId}`);

    // Crear workspace de prueba
    log("\n📝 Creando workspace de prueba como jesusbloise (owner)...");
    const jesusLogin = await loginUser("jesusbloise@gmail.com", "123456");
    const jesusToken = jesusLogin.data.token;
    const testWorkspaceId = `test_delete_${timestamp}`;
    
    const createRes = await createWorkspace(jesusToken, testWorkspaceId, "Test Delete Workspace");
    
    if (createRes.status !== 201) {
      log(`❌ Error creando workspace: ${createRes.status}`, "red");
      testResults.push({ test: "Create test workspace", passed: false });
      throw new Error("Failed to create test workspace");
    }

    log(`✅ Workspace creado: ${testWorkspaceId}`);

    // Agregar member al workspace
    log("\n📝 Agregando member al workspace...");
    const jesusId = getUserId("jesusbloise@gmail.com");
    db.prepare(
      "INSERT INTO memberships (user_id, tenant_id, role, created_at, updated_at) VALUES (?, ?, 'member', ?, ?)"
    ).run(memberId, testWorkspaceId, Date.now(), Date.now());

    log("✅ Member agregado al workspace con rol 'member'");

    // Intentar eliminar como member
    log("\n📝 Intentando eliminar workspace como member...");
    const memberDeleteRes = await deleteWorkspace(memberToken, testWorkspaceId);

    if (memberDeleteRes.status === 403) {
      log("✅ ✓ Member bloqueado correctamente (403)", "green");
      log(`ℹ️  Mensaje: ${memberDeleteRes.data.message || memberDeleteRes.data.error}`);
      testResults.push({ test: "Member cannot delete workspace", passed: true });
    } else {
      log(`❌ ✗ Member NO fue bloqueado (status: ${memberDeleteRes.status})`, "red");
      testResults.push({ test: "Member cannot delete workspace", passed: false });
    }

    // ========== TEST 2: Admin SÍ puede eliminar workspace ==========
    section("TEST 2: Admin elimina workspace → debe funcionar (200)");

    // Promover member a admin
    log("📝 Promoviendo user a admin...");
    setUserRole(memberId, testWorkspaceId, "admin");
    log("✅ User promovido a admin");

    // Intentar eliminar como admin
    log("\n📝 Intentando eliminar workspace como admin...");
    const adminDeleteRes = await deleteWorkspace(memberToken, testWorkspaceId);

    if (adminDeleteRes.status === 200) {
      log("✅ ✓ Admin puede eliminar workspace (200)", "green");
      log(`ℹ️  Mensaje: ${adminDeleteRes.data.message}`);
      log(`ℹ️  Workspace eliminado: ${adminDeleteRes.data.deleted_workspace?.name}`);
      testResults.push({ test: "Admin can delete workspace", passed: true });
    } else {
      log(`❌ ✗ Admin NO pudo eliminar (status: ${adminDeleteRes.status})`, "red");
      log(`ℹ️  Response: ${JSON.stringify(adminDeleteRes.data)}`);
      testResults.push({ test: "Admin can delete workspace", passed: false });
    }

    // ========== TEST 3: Owner SÍ puede eliminar workspace ==========
    section("TEST 3: Owner elimina workspace → debe funcionar (200)");

    // Crear otro workspace de prueba
    log("📝 Creando segundo workspace de prueba...");
    const testWorkspaceId2 = `test_delete_2_${timestamp}`;
    const createRes2 = await createWorkspace(jesusToken, testWorkspaceId2, "Test Delete Workspace 2");
    
    if (createRes2.status !== 201) {
      log(`❌ Error creando workspace 2: ${createRes2.status}`, "red");
      testResults.push({ test: "Create test workspace 2", passed: false });
      throw new Error("Failed to create test workspace 2");
    }

    log(`✅ Workspace 2 creado: ${testWorkspaceId2}`);

    // Eliminar como owner (jesus)
    log("\n📝 Intentando eliminar workspace como owner...");
    const ownerDeleteRes = await deleteWorkspace(jesusToken, testWorkspaceId2);

    if (ownerDeleteRes.status === 200) {
      log("✅ ✓ Owner puede eliminar workspace (200)", "green");
      log(`ℹ️  Mensaje: ${ownerDeleteRes.data.message}`);
      log(`ℹ️  Workspace eliminado: ${ownerDeleteRes.data.deleted_workspace?.name}`);
      testResults.push({ test: "Owner can delete workspace", passed: true });
    } else {
      log(`❌ ✗ Owner NO pudo eliminar (status: ${ownerDeleteRes.status})`, "red");
      log(`ℹ️  Response: ${JSON.stringify(ownerDeleteRes.data)}`);
      testResults.push({ test: "Owner can delete workspace", passed: false });
    }

    // ========== TEST 4: No se puede eliminar workspace 'demo' ==========
    section("TEST 4: Intentar eliminar workspace 'demo' → debe fallar (403)");

    log("📝 Intentando eliminar workspace 'demo' como owner...");
    const demoDeleteRes = await deleteWorkspace(jesusToken, "demo");

    if (demoDeleteRes.status === 403) {
      log("✅ ✓ Workspace 'demo' protegido correctamente (403)", "green");
      log(`ℹ️  Mensaje: ${demoDeleteRes.data.message || demoDeleteRes.data.error}`);
      testResults.push({ test: "Cannot delete demo workspace", passed: true });
    } else {
      log(`❌ ✗ Workspace 'demo' NO está protegido (status: ${demoDeleteRes.status})`, "red");
      testResults.push({ test: "Cannot delete demo workspace", passed: false });
    }

  } catch (error) {
    log(`\n❌ ERROR CRÍTICO: ${error.message}`, "red");
    console.error(error);
  }

  // ========== RESUMEN ==========
  section("📊 RESUMEN DE RESULTADOS");

  const passed = testResults.filter((r) => r.passed).length;
  const total = testResults.length;

  testResults.forEach((result) => {
    const icon = result.passed ? "✅" : "❌";
    const status = result.passed ? "[PASS]" : "[FAIL]";
    const color = result.passed ? "green" : "red";
    log(`${icon} ${result.test.padEnd(40)} ${status}`, color);
  });

  console.log(`\nTotal: ${total} tests`);
  console.log(`Exitosos: ${passed}`);
  console.log(`Fallidos: ${total - passed}\n`);

  if (passed === total) {
    log("🎉 ¡TODOS LOS TESTS PASARON!", "green");
    log("   El sistema de eliminación de workspaces funciona correctamente", "green");
  } else {
    log("⚠️  ALGUNOS TESTS FALLARON", "yellow");
    log(`   ${total - passed} de ${total} tests no pasaron`, "yellow");
  }

  console.log("\n" + "═".repeat(60) + "\n");
}

// Ejecutar tests
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
