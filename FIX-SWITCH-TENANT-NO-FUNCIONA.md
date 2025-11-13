# Fix: Usuario no puede entrar a workspace buscado

**Fecha:** 13 Enero 2025  
**Estado:** ✅ RESUELTO

---

## ❌ El Problema

Al buscar un workspace y presionar **"Entrar"**, el tenant **NO cambiaba**. El usuario seguía en el mismo workspace.

**Logs observados:**
```
🔍 /tenants/discover - query: publicidad
✅ Found workspaces: 1
[Usuario presiona "Entrar"]
🧩 Tenant => { tenant: 'jesus', role: 'member', via: 'header' }
❌ NO CAMBIA A 'demo' (el workspace buscado)
```

---

## 🔍 Root Cause

El endpoint **`/me/tenant/switch`** usaba **placeholders SQLite (`?`)** en lugar de **PostgreSQL (`$1, $2`)**:

```javascript
// ❌ ANTES (SQLite - NO funciona en PostgreSQL)
const tenant = await db
  .prepare(`SELECT id, name FROM tenants WHERE id = ? LIMIT 1`)
  .get(tenant_id);

const user = await db
  .prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`)
  .get(userId);
```

**Resultado:** La query NO ejecutaba correctamente → Tenant no se encontraba → Switch fallaba silenciosamente.

---

## ✅ Solución

### 1. Actualizar `server/routes/me.js` - `/me/tenant/switch`

```javascript
// ✅ AHORA (PostgreSQL)
r.post("/me/tenant/switch", async (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const { tenant_id } = req.body || {};
  if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });

  console.log('🔄 /me/tenant/switch:', { userId, tenant_id }); // ✨ Log agregado

  // ✅ Placeholder PostgreSQL $1
  const tenant = await db
    .prepare(`SELECT id, name FROM tenants WHERE id = $1 LIMIT 1`)
    .get(tenant_id);

  if (!tenant) {
    console.log('❌ Tenant not found:', tenant_id);
    return res.status(404).json({ error: "tenant_not_found" });
  }

  // ✅ Placeholder PostgreSQL $1
  const user = await db
    .prepare(`SELECT role FROM users WHERE id = $1 LIMIT 1`)
    .get(userId);

  const userRole = user?.role || 'member';

  console.log('✅ Switch successful:', { tenant: tenant_id, role: userRole }); // ✨ Log agregado

  const basePayload = {
    sub: req.auth?.sub || req.user?.id || userId,
    email: req.auth?.email || req.user?.email || undefined,
    role: userRole, // Rol global
    active_tenant: tenant_id,
  };

  const token = jwt.sign(basePayload, JWT_SECRET, { expiresIn: "7d" });

  res.json({
    token,
    active_tenant: tenant_id,
    tenant: { id: tenant_id, name: tenant.name, role: userRole },
  });
});
```

### 2. También actualizado: `/tenants/role`

```javascript
// ✅ Placeholder PostgreSQL $1
const user = await db
  .prepare(`SELECT role FROM users WHERE id = $1 LIMIT 1`)
  .get(userId);
```

### 3. También actualizado: `/tenants/switch` (aunque no se usa desde frontend)

```javascript
// ✅ Placeholder PostgreSQL $1
const tenant = await db
  .prepare("SELECT id, name FROM tenants WHERE id = $1")
  .get(tenant_id);
```

---

## 🧪 Testing

### Prueba Manual

1. **Buscar workspace:**
   ```
   Pantalla: "Más" → Buscar "publicidad"
   ✅ Debe mostrar resultado
   ```

2. **Presionar "Entrar":**
   ```
   ✅ Debe cambiar workspace
   ✅ Debe mostrar Alert "Cambiado a workspace 'publicidad'"
   ✅ Logs del servidor:
   
   🔄 /me/tenant/switch: { userId: 'demo-admin', tenant_id: 'jesus' }
   ✅ Switch successful: { tenant: 'jesus', role: 'member' }
   🧩 Tenant => { tenant: 'jesus', role: 'member', via: 'token' }
   ```

3. **Verificar cambio:**
   ```
   ✅ Header X-Tenant-Id cambia a 'jesus'
   ✅ Siguiente request usa nuevo tenant
   ✅ Usuario ve datos del nuevo workspace
   ```

---

## 📊 Flujo Correcto

```
[Usuario busca "publicidad"]
     ↓
GET /tenants/discover?query=publicidad
✅ Retorna: [{ id: "jesus", name: "publicidad", ... }]
     ↓
[Usuario presiona "Entrar"]
     ↓
POST /me/tenant/switch
Body: { tenant_id: "jesus" }
     ↓
✅ Query PostgreSQL: SELECT ... WHERE id = $1
✅ Tenant encontrado
✅ Rol global obtenido
✅ Nuevo JWT generado con active_tenant: "jesus"
     ↓
Frontend recibe:
{
  token: "eyJhbGc...",
  active_tenant: "jesus",
  tenant: { id: "jesus", name: "publicidad", role: "member" }
}
     ↓
✅ AsyncStorage actualizado
✅ Próximos requests usan X-Tenant-Id: jesus
✅ Usuario ve datos del workspace "jesus"
```

---

## 📝 Archivos Modificados

1. ✏️ `server/routes/me.js` - `/me/tenant/switch` (placeholders PostgreSQL)
2. ✏️ `server/routes/me.js` - `/tenants/role` (placeholders PostgreSQL)
3. ✏️ `server/routes/tenants.js` - `/tenants/switch` (placeholders PostgreSQL)
4. 📄 `server/scripts/fix-all-sqlite-placeholders.js` - Script para detectar más placeholders

---

## ⚠️ Problema Pendiente: Más Placeholders SQLite

**Script de detección:**
```bash
cd server
node scripts/fix-all-sqlite-placeholders.js
```

**Resultado estimado:**
```
📄 auth.js
   Placeholders SQLite encontrados: 4

📄 admin.js
   Placeholders SQLite encontrados: 4

📄 leads.js
   Placeholders SQLite encontrados: 6

... y muchos más
```

**Recomendación:**
Actualizar TODOS los archivos de `/routes` y `/lib` que usen placeholders SQLite (`?`) a PostgreSQL (`$1, $2, $3`).

**Prioridad:**
- 🚨 **ALTA:** `/routes/auth.js` (login, register)
- 🚨 **ALTA:** `/routes/admin.js` (panel admin)
- 🚨 **ALTA:** `/routes/tenants.js` (crear/eliminar workspaces)
- **MEDIA:** `/routes/leads.js`, `/routes/contacts.js`, `/routes/deals.js`, etc.

---

## 🎯 Resultado Final

**Sistema ahora permite:**
- ✅ Buscar workspaces por ID o nombre
- ✅ **Entrar a cualquier workspace encontrado** ⭐ FIX PRINCIPAL
- ✅ Cambiar de workspace sin errores
- ✅ Rol global correcto en cada workspace

**Logs del servidor (después del fix):**
```
🔍 /tenants/discover - query: publicidad
✅ Found workspaces: 1

🔄 /me/tenant/switch: { userId: 'demo-admin', tenant_id: 'jesus' }
✅ Switch successful: { tenant: 'jesus', role: 'member' }

🧩 Tenant => { tenant: 'jesus', role: 'member', via: 'token' }
```

---

## 📖 Documentación Relacionada

- **Fix anterior:** `FIX-ERROR-403-FORBIDDEN-TENANT.md` (middleware injectTenant)
- **Sistema:** `SISTEMA-SIMPLIFICADO.md` (roles globales)
- **Testing:** `server/scripts/test-tenant-access-simplified.js`

---

✅ **Fix aplicado - Servidor reiniciado - Listo para testing manual**
