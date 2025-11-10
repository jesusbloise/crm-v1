#!/usr/bin/env node
/**
 * Debug: Verificar si el botón de eliminar se muestra correctamente
 * Simula la lógica del frontend para verificar qué workspaces muestran el botón
 */

const fetch = require("node-fetch");
const db = require("../db/connection");

const BASE_URL = "http://localhost:4000";

async function loginAndCheckWorkspaces() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("   🔍 DEBUG: Botón de Eliminar Workspaces");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    // 1. Login como jesusbloise (admin/owner)
    console.log("📝 1. Login como jesusbloise@gmail.com...");
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "jesusbloise@gmail.com",
        password: "123456",
      }),
    });

    const loginData = await loginRes.json();
    
    if (!loginData.token) {
      console.error("❌ Login fallido");
      return;
    }

    const token = loginData.token;
    console.log("✅ Login exitoso\n");

    // 2. Obtener lista de workspaces
    console.log("📝 2. Obteniendo lista de workspaces...");
    const tenantsRes = await fetch(`${BASE_URL}/me/tenants`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const tenantsData = await tenantsRes.json();
    console.log(`✅ Workspaces obtenidos: ${tenantsData.items?.length || 0}\n`);

    // 3. Analizar cada workspace
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("ANÁLISIS DE WORKSPACES");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    if (!tenantsData.items || tenantsData.items.length === 0) {
      console.log("⚠️  No se encontraron workspaces\n");
      return;
    }

    tenantsData.items.forEach((workspace, index) => {
      const canDelete = workspace.role === "admin" || workspace.role === "owner";
      const isDemoProtected = workspace.id === "demo";
      const showDeleteButton = canDelete && !isDemoProtected;

      console.log(`${index + 1}. ${workspace.name || workspace.id}`);
      console.log(`   ID: ${workspace.id}`);
      console.log(`   Rol: ${workspace.role || "❌ NO DEFINIDO"}`);
      console.log(`   Creado por: ${workspace.owner_name || workspace.owner_email || "Desconocido"}`);
      console.log(`   Es demo protegido: ${isDemoProtected ? "Sí" : "No"}`);
      console.log(`   Puede eliminar: ${canDelete ? "✅ Sí" : "❌ No"}`);
      console.log(`   Mostrar botón 🗑️: ${showDeleteButton ? "✅ SÍ" : "❌ NO"}`);
      
      if (!workspace.role) {
        console.log(`   ⚠️  PROBLEMA: El rol no está definido`);
      } else if (!canDelete) {
        console.log(`   ℹ️  Rol "${workspace.role}" no permite eliminar`);
      } else if (isDemoProtected) {
        console.log(`   🛡️  Workspace "demo" está protegido`);
      }
      
      console.log();
    });

    // 4. Verificar directamente en la base de datos
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("VERIFICACIÓN EN BASE DE DATOS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const jesusId = "02bfdb38-6083-4b6c-a009-b82005ff3e9a";
    const memberships = db.prepare(`
      SELECT 
        t.id as tenant_id,
        t.name as tenant_name,
        m.role
      FROM memberships m
      JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = ?
      ORDER BY t.name
    `).all(jesusId);

    console.log(`👤 Memberships de jesusbloise en DB: ${memberships.length}\n`);
    
    memberships.forEach((m, i) => {
      const canDelete = m.role === "admin" || m.role === "owner";
      const isDemoProtected = m.tenant_id === "demo";
      const showDeleteButton = canDelete && !isDemoProtected;

      console.log(`${i + 1}. ${m.tenant_name} (${m.tenant_id})`);
      console.log(`   Rol en DB: ${m.role}`);
      console.log(`   Puede eliminar: ${canDelete ? "✅ Sí" : "❌ No"}`);
      console.log(`   Mostrar botón: ${showDeleteButton ? "✅ SÍ" : "❌ NO"}`);
      console.log();
    });

    // 5. Resumen
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("RESUMEN");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const workspacesWithButton = tenantsData.items.filter(
      (w) => (w.role === "admin" || w.role === "owner") && w.id !== "demo"
    ).length;

    const workspacesWithoutRole = tenantsData.items.filter((w) => !w.role).length;

    console.log(`📦 Total workspaces: ${tenantsData.items.length}`);
    console.log(`✅ Con botón de eliminar: ${workspacesWithButton}`);
    console.log(`❌ Sin botón (demo o sin permisos): ${tenantsData.items.length - workspacesWithButton}`);
    console.log(`⚠️  Sin rol definido: ${workspacesWithoutRole}`);
    
    if (workspacesWithoutRole > 0) {
      console.log("\n⚠️  PROBLEMA DETECTADO:");
      console.log("   Algunos workspaces no tienen rol definido en la respuesta del API");
      console.log("   Esto impide que se muestre el botón de eliminar");
    } else if (workspacesWithButton === 0) {
      console.log("\n⚠️  PROBLEMA:");
      console.log("   Ningún workspace tiene botón de eliminar visible");
      console.log("   Verifica que el usuario sea admin/owner en al menos un workspace");
    } else {
      console.log("\n✅ TODO CORRECTO:");
      console.log("   Los botones de eliminar deberían mostrarse correctamente");
    }

    console.log("\n═══════════════════════════════════════════════════════════\n");

  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error);
  }
}

// Ejecutar
loginAndCheckWorkspaces();
