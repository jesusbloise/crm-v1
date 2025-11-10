// server/scripts/debug-bugs.js
/**
 * Script de debugging para los 2 bugs identificados:
 * 1. Members pueden crear workspaces
 * 2. created_by siempre es 'demo-admin'
 */

const fetch = require("node-fetch");
const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

// Colores
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

// Helper para hacer requests
async function request(method, path, body = null, token = null) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["X-Tenant-Id"] = "demo";
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

// ==============================================================================
// BUG #1: Member puede crear workspace
// ==============================================================================
async function debugBug1() {
  console.log("\n");
  log("═══════════════════════════════════════════════════════════", "bright");
  log("🐛 BUG #1: Member puede crear workspace", "bright");
  log("═══════════════════════════════════════════════════════════", "bright");
  console.log("\n");

  // Paso 1: Registrar usuario nuevo
  log("📝 Paso 1: Registrando usuario nuevo...", "cyan");
  const testEmail = `debug_member_${Date.now()}@example.com`;
  const { response: regResp, data: regData } = await request("POST", "/auth/register", {
    name: "Debug Member",
    email: testEmail,
    password: "test123",
  });

  if (regResp.status !== 201) {
    log(`❌ Registro falló: ${regResp.status}`, "red");
    return;
  }

  log(`✅ Usuario registrado: ${regData.email}`, "green");
  log(`   ID: ${regData.id}`, "cyan");
  log(`   Rol: ${regData.tenant?.role}`, "cyan");
  log(`   Token (primeros 30 chars): ${regData.token.slice(0, 30)}...`, "cyan");

  const memberToken = regData.token;
  const memberId = regData.id;

  // Paso 2: Verificar que es member
  log("\n📝 Paso 2: Verificando rol del usuario...", "cyan");
  const { response: roleResp, data: roleData } = await request("GET", "/tenants/role", null, memberToken);

  log(`   Rol actual: ${roleData.role}`, roleData.role === "member" ? "green" : "red");
  log(`   Tenant: ${roleData.tenant_id}`, "cyan");

  // Paso 3: Intentar crear workspace
  log("\n📝 Paso 3: Intentando crear workspace como member...", "cyan");
  log("⚠️  ESPERADO: 403 Forbidden", "yellow");
  log("⚠️  OBSERVAR LOGS DEL SERVIDOR →", "yellow");
  
  const workspaceId = `debug_workspace_${Date.now()}`;
  const { response: createResp, data: createData } = await request(
    "POST",
    "/tenants",
    {
      id: workspaceId,
      name: "Debug Workspace",
    },
    memberToken
  );

  console.log("\n");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "cyan");
  log("📊 RESULTADO:", "bright");
  log(`   Status: ${createResp.status}`, createResp.status === 403 ? "green" : "red");
  log(`   Response: ${JSON.stringify(createData, null, 2)}`, "cyan");
  
  if (createResp.status === 403) {
    log("\n✅ BUG #1 CORREGIDO: Member no puede crear workspace", "green");
  } else if (createResp.status === 201) {
    log("\n❌ BUG #1 PERSISTE: Member pudo crear workspace", "red");
    log(`   Workspace creado: ${createData.id}`, "red");
  } else {
    log(`\n⚠️  Status inesperado: ${createResp.status}`, "yellow");
  }
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "cyan");

  return { memberId, memberToken };
}

// ==============================================================================
// BUG #2: created_by siempre 'demo-admin'
// ==============================================================================
async function debugBug2(memberId, memberToken) {
  console.log("\n");
  log("═══════════════════════════════════════════════════════════", "bright");
  log("🐛 BUG #2: created_by siempre 'demo-admin'", "bright");
  log("═══════════════════════════════════════════════════════════", "bright");
  console.log("\n");

  log(`📝 Usuario member ID: ${memberId}`, "cyan");
  log(`📝 Token: ${memberToken.slice(0, 30)}...`, "cyan");

  // Decodificar JWT para ver el sub
  log("\n📝 Decodificando JWT...", "cyan");
  const [, payloadB64] = memberToken.split('.');
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
  log(`   sub: ${payload.sub}`, payload.sub === memberId ? "green" : "red");
  log(`   email: ${payload.email}`, "cyan");
  log(`   active_tenant: ${payload.active_tenant}`, "cyan");

  // Crear lead
  log("\n📝 Creando lead como member...", "cyan");
  log("⚠️  OBSERVAR LOGS DEL SERVIDOR →", "yellow");

  const leadId = `debug_lead_${Date.now()}`;
  const { response: createResp, data: leadData } = await request(
    "POST",
    "/leads",
    {
      id: leadId,
      name: "Debug Lead",
      email: "debug@example.com",
      status: "nuevo",
    },
    memberToken
  );

  if (createResp.status !== 201) {
    log(`❌ No se pudo crear lead: ${createResp.status}`, "red");
    log(`   Error: ${JSON.stringify(leadData)}`, "red");
    return;
  }

  log(`✅ Lead creado: ${leadData.id}`, "green");

  // Verificar created_by en la DB
  log("\n📝 Verificando created_by en la base de datos...", "cyan");
  const db = require("../db/connection");
  const dbLead = db.prepare("SELECT id, name, created_by, tenant_id FROM leads WHERE id = ?").get(leadId);

  console.log("\n");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "cyan");
  log("📊 RESULTADO:", "bright");
  log(`   Lead ID: ${dbLead.id}`, "cyan");
  log(`   Created by: ${dbLead.created_by}`, "cyan");
  log(`   Expected: ${memberId}`, "cyan");
  
  if (dbLead.created_by === memberId) {
    log("\n✅ BUG #2 CORREGIDO: created_by es el ID correcto", "green");
  } else if (dbLead.created_by === 'demo-admin') {
    log("\n❌ BUG #2 PERSISTE: created_by es 'demo-admin'", "red");
  } else {
    log(`\n⚠️  created_by tiene valor inesperado: ${dbLead.created_by}`, "yellow");
  }
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "cyan");
}

// ==============================================================================
// MAIN
// ==============================================================================
async function main() {
  console.log("\n");
  log("🚀 Iniciando debugging de bugs...", "bright");
  log(`   Base URL: ${BASE_URL}`, "cyan");
  log(`   Fecha: ${new Date().toLocaleString()}`, "cyan");

  try {
    // Bug #1
    const { memberId, memberToken } = await debugBug1();

    // Bug #2
    if (memberId && memberToken) {
      await debugBug2(memberId, memberToken);
    }

    console.log("\n");
    log("═══════════════════════════════════════════════════════════", "bright");
    log("✅ Debugging completado", "bright");
    log("   Revisa los logs del servidor arriba para análisis detallado", "cyan");
    log("═══════════════════════════════════════════════════════════", "bright");
    console.log("\n");

  } catch (error) {
    log(`\n❌ Error durante debugging: ${error.message}`, "red");
    console.error(error);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
