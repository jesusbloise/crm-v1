# 🔍 ANÁLISIS COMPLETO DE FALLAS - SISTEMA DE ROLES

**Fecha:** 10 de Noviembre, 2025  
**Estado:** ❌ SISTEMA NO FUNCIONA CORRECTAMENTE

---

## 📋 RESUMEN EJECUTIVO

He revisado exhaustivamente todo el sistema de roles y workspaces. El problema es **CRÍTICO** y afecta múltiples capas de la aplicación. Carolina (member) puede ver el panel de administración porque el sistema tiene **inconsistencias graves** entre el frontend y backend.

---

## 🔴 PROBLEMAS CRÍTICOS ENCONTRADOS

### 1. **INCONSISTENCIA EN LA LÓGICA DE VERIFICACIÓN DE ROL (Frontend)**

**Archivo:** `app/more/index.tsx` (líneas 96-147)

**Problema:**
```typescript
const [currentRole, setCurrentRole] = useState<"owner" | "admin" | "member" | null>(null);

const fetchCurrentRole = useCallback(async () => {
  try {
    const url = `/tenants/role?_=${Date.now()}`;
    const res = await api.get<{ tenant_id: string | null; role: string | null }>(url);
    const r = (res?.role || "").toLowerCase() as "owner" | "admin" | "member" | "";
    setCurrentRole(r || null);
    console.log("🔑 Rol actualizado:", r);
  } catch (err) {
    console.warn("No se pudo obtener rol actual:", err);
  }
}, []);

const computeAdminFromTenants = useCallback(
  (list: TenantItem[], activeId: string | null | undefined) => {
    if (!Array.isArray(list) || !list.length) return false;
    const active = list.find((t) => t.id === activeId);
    const role = (active?.role || "").toLowerCase();
    return role === "admin" || role === "owner";
  },
  []
);

const isAdminOrOwner = useMemo(() => {
  if (currentRole === "owner" || currentRole === "admin") return true;
  if (currentRole === "member") return false;
  return computeAdminFromTenants(tenants, tenant);
}, [currentRole, tenants, tenant, computeAdminFromTenants]);
```

**❌ FALLA:** El problema está en el `useMemo` con **3 fuentes de verdad diferentes**:
1. `currentRole` (del endpoint `/tenants/role`)
2. `tenants` array (del endpoint `/me/tenants`)
3. `computeAdminFromTenants` como fallback

Si `currentRole` está en `null` (por cualquier error temporal o carga lenta), el sistema cae al **fallback** y puede usar datos incorrectos o desactualizados del array `tenants`.

**🔧 IMPACTO:** Carolina puede ver el botón de admin si hay un timing issue donde `currentRole` aún no se ha cargado.

---

### 2. **MÚLTIPLES ENDPOINTS DEVUELVEN ROL (Backend)**

**Problema:** Hay **3 endpoints diferentes** que devuelven el rol del usuario:

1. **`GET /me/tenants`** (server/routes/me.js)
   ```javascript
   // Devuelve array con roles por workspace
   { items: [{ id, name, role, owner_name, owner_email, is_active }], active_tenant }
   ```

2. **`GET /tenants/role`** (server/routes/tenants.js y server/routes/me.js - DUPLICADO!)
   ```javascript
   // Devuelve el rol actual
   { tenant_id: string|null, role: string|null }
   ```

3. **`GET /me/can-access-admin`** (server/routes/me.js)
   ```javascript
   // Verifica si tiene rol admin/owner en CUALQUIER workspace
   { canAccess: true/false }
   ```

**❌ FALLA:** El endpoint `/tenants/role` está **DUPLICADO** en dos archivos diferentes:
- `server/routes/me.js` (línea 108)
- `server/routes/tenants.js` (línea 326)

**🔧 IMPACTO:** Puede haber conflictos de rutas y comportamiento inconsistente dependiendo del orden de carga de los routers.

---

### 3. **HEADER X-Tenant-Id NO SE SINCRONIZA CORRECTAMENTE**

**Archivo:** `app/more/index.tsx` (líneas 148-155)

**Problema:**
```typescript
const updateTenantHeader = (tenantId: string) => {
  try {
    api.defaults.headers.common["X-Tenant-Id"] = tenantId;
  } catch (e) {
    console.warn("No se pudo actualizar header X-Tenant-Id", e);
  }
};
```

**❌ FALLA:** Aunque se actualiza el header en `api.defaults`, el frontend también usa `authHeaders()` desde `src/api/auth.ts` que lee de `AsyncStorage`. Si el storage no está sincronizado con el header HTTP, puede haber **desincronización**.

**Ejemplo del problema:**
1. Usuario cambia de workspace "demo" → "jesus"
2. Se actualiza `api.defaults.headers.common["X-Tenant-Id"] = "jesus"`
3. Pero `AsyncStorage` todavía tiene "demo"
4. El próximo request usa el header de AsyncStorage (incorrecto)

**🔧 IMPACTO:** El backend puede evaluar el rol en un workspace diferente al que el usuario cree que está activo.

---

### 4. **FALTA DE VALIDACIÓN EN EL BACKEND PARA PANEL ADMIN**

**Archivo:** `server/routes/admin.js`

**Problema:**
```javascript
router.get("/admin/users", (req, res) => {
  try {
    // Verificar que el usuario esté autenticado
    if (!req.user?.id) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // ❌ NO VALIDA ROL - Solo verifica autenticación!
    // Debería verificar isAdminOrOwner ANTES de devolver datos

    const users = db.prepare(`SELECT * FROM users...`).all();
    res.json({ users: usersWithWorkspaces });
  }
  ...
}
```

**❌ FALLA CRÍTICA:** El endpoint `/admin/users` **NO VALIDA** que el usuario sea admin/owner. Solo verifica que esté autenticado. ¡Cualquier usuario logueado puede acceder!

**🔧 IMPACTO:** **VULNERABILIDAD DE SEGURIDAD** - Miembros pueden ver todos los usuarios del sistema si llaman directamente al endpoint.

---

### 5. **admin-users.tsx TIENE SU PROPIA VERIFICACIÓN DE ROL**

**Archivo:** `app/more/admin-users.tsx` (líneas 34-58)

**Problema:**
```typescript
const refreshRole = useCallback(async () => {
  setCheckingRole(true);
  setRoleError(null);
  try {
    const res = await api.get<{ tenant_id: string | null; role: string | null }>(
      "/tenants/role?_=" + Date.now()
    );
    const r = (res?.role || "").toLowerCase() as RoleNow;
    if (r === "owner" || r === "admin" || r === "member") {
      setRoleNow(r);
    } else {
      setRoleNow(null);
    }
  } catch (e: any) {
    setRoleError(e?.message || "No se pudo verificar tu rol actual.");
    setRoleNow(null);
  } finally {
    setCheckingRole(false);
  }
}, []);

const hasAccess = useMemo(() => roleNow === "owner" || roleNow === "admin", [roleNow]);
```

**❌ FALLA:** Esta pantalla hace **SU PROPIA verificación** de rol, independiente de la pantalla "Más". Esto causa:
1. **Duplicación de lógica** - Dos lugares diferentes verifican lo mismo
2. **Inconsistencia** - Si una pantalla muestra el botón pero esta pantalla bloquea, mala UX
3. **Puede fallar diferente** - Si hay un error en una verificación pero no en la otra

**🔧 IMPACTO:** El usuario ve el botón "Administrador" pero al entrar se le bloquea (confuso).

---

### 6. **AUTHORIZE.JS NO SE USA CONSISTENTEMENTE**

**Archivo:** `server/lib/authorize.js`

**Problema:**
```javascript
// Funciones bien implementadas pero NO SE USAN en todos los endpoints
function getUserRole(userId, tenantId) { ... }
function isAdmin(userId, tenantId) { ... }
function isMember(userId, tenantId) { ... }
```

**Archivos que NO usan authorize.js:**
- ❌ `server/routes/me.js` - Usa su propia lógica inline
- ❌ `server/routes/tenants.js` - Usa funciones locales `getRequesterRole()` y `isAdminOrOwner()`
- ❌ `server/routes/admin.js` - Usa función local `isAdminOrOwner()`

**❌ FALLA:** Hay **3 implementaciones diferentes** de la misma lógica:
1. `server/lib/authorize.js` → `isAdmin(userId, tenantId)`
2. `server/routes/tenants.js` → `isAdminOrOwner(req, tenantId)`
3. `server/routes/admin.js` → `isAdminOrOwner(userId)`

**🔧 IMPACTO:** Mantenimiento difícil, bugs diferentes en cada archivo, comportamiento inconsistente.

---

### 7. **TIMING ISSUE EN LA CARGA DE DATOS**

**Archivo:** `app/more/index.tsx`

**Problema:** La secuencia de carga es:

1. `useFocusEffect` llama `refreshTenantsAndRole()`
2. `refreshTenantsAndRole()` hace:
   - `getActiveTenant()` desde AsyncStorage
   - `fetchTenants()` desde API `/me/tenants`
   - `fetchCurrentRole()` desde API `/tenants/role`

3. `useEffect` con `AppState` también llama `refreshTenantsAndRole()`

**❌ FALLA:** Hay **condiciones de carrera (race conditions)**:
- Si `fetchTenants()` termina antes que `fetchCurrentRole()`
- O si el usuario navega rápido entre pantallas
- El `useMemo` de `isAdminOrOwner` se calcula con datos incompletos

**🔧 IMPACTO:** Durante 1-2 segundos, el rol puede ser incorrecto hasta que todos los endpoints respondan.

---

### 8. **CACHE DE CONSULTAS SQL SIN INVALIDACIÓN**

**Problema:** Las consultas SQL no invalidan cache cuando cambian datos:

```javascript
// server/routes/me.js - GET /tenants/role
const row = db
  .prepare(`SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1`)
  .get(userId, tenantId);

return res.json({ tenant_id: tenantId, role: row?.role || null });
```

**❌ FALLA:** Si un admin cambia el rol de Carolina de "admin" → "member", el frontend puede tener el dato viejo en memoria hasta que:
1. Carolina recargue manualmente la app
2. O navegue fuera y vuelva a la pantalla

El backend devuelve la respuesta correcta pero **no hay mecanismo de invalidación** en el frontend.

**🔧 IMPACTO:** Cambios de rol no se reflejan inmediatamente, Carolina puede seguir viendo botones de admin.

---

### 9. **NO HAY LOGS DE AUDITORÍA**

**Problema:** Ningún endpoint registra:
- ❌ Quién accedió al panel de admin
- ❌ Qué usuario hizo qué acción
- ❌ Intentos de acceso no autorizado

**🔧 IMPACTO:** Imposible debuggear o auditar problemas de seguridad.

---

### 10. **CONFUSIÓN: `/me/can-access-admin` vs ROL ACTUAL**

**Archivo:** `server/routes/me.js` (línea 220)

**Problema:**
```javascript
r.get("/me/can-access-admin", (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  try {
    // Buscar si tiene rol admin u owner en CUALQUIER workspace
    const membership = db
      .prepare(
        `SELECT role 
         FROM memberships 
         WHERE user_id = ? AND (role = 'admin' OR role = 'owner')
         LIMIT 1`
      )
      .get(userId);

    const canAccess = !!membership;
    return res.json({ canAccess });
  }
  ...
}
```

**❌ FALLA CONCEPTUAL:** Este endpoint pregunta "¿Eres admin en ALGÚN workspace?" pero el botón de admin debería mostrarse basado en "¿Eres admin en el workspace ACTUAL?".

**Ejemplo del problema:**
1. Carolina es "member" en workspace "demo" ✅
2. Carolina es "admin" en workspace "otro" ✅
3. Está activo: "demo"
4. `/me/can-access-admin` devuelve `true` (porque es admin en "otro")
5. El frontend muestra el botón ❌ INCORRECTO

**🔧 IMPACTO:** El botón se muestra incorrectamente si el usuario es admin en otro workspace pero no en el actual.

---

## 📊 RESUMEN DE CAUSA RAÍZ

| # | Problema | Severidad | Ubicación |
|---|----------|-----------|-----------|
| 1 | Lógica de verificación con 3 fuentes de verdad | 🔴 CRÍTICO | `app/more/index.tsx` |
| 2 | Endpoint `/tenants/role` duplicado | 🟠 ALTO | `server/routes/me.js` y `tenants.js` |
| 3 | Header X-Tenant-Id desincronizado | 🟠 ALTO | `app/more/index.tsx` + `src/api/auth.ts` |
| 4 | Backend `/admin/users` sin validación de rol | 🔴 CRÍTICO | `server/routes/admin.js` |
| 5 | Verificación de rol duplicada | 🟡 MEDIO | `app/more/admin-users.tsx` |
| 6 | authorize.js no se usa consistentemente | 🟠 ALTO | Múltiples archivos |
| 7 | Race conditions en carga de datos | 🟠 ALTO | `app/more/index.tsx` |
| 8 | Sin invalidación de cache | 🟡 MEDIO | Frontend global |
| 9 | Sin logs de auditoría | 🟡 MEDIO | Backend global |
| 10 | `/me/can-access-admin` lógica incorrecta | 🔴 CRÍTICO | `server/routes/me.js` |

---

## 🎯 POR QÉ CAROLINA VE EL BOTÓN DE ADMIN

**Causa más probable (combinación de problemas):**

1. **Problema #10:** Si Carolina tiene rol "admin" en CUALQUIER workspace (aunque no sea el activo), `/me/can-access-admin` devuelve `true`

2. **Problema #1:** Si hay un delay en cargar `currentRole`, el `useMemo` cae al fallback `computeAdminFromTenants()` que puede usar datos stale

3. **Problema #7:** Race condition donde el frontend renderiza antes de que `fetchCurrentRole()` termine

4. **Problema #3:** Header X-Tenant-Id puede tener workspace incorrecto por desincronización

---

## 🏗️ ARQUITECTURA ACTUAL (PROBLEMÁTICA)

```
Frontend (app/more/index.tsx)
    ├─ Estado: currentRole (de /tenants/role)
    ├─ Estado: tenants (de /me/tenants)
    ├─ Lógica: isAdminOrOwner (useMemo con 3 fuentes)
    └─ Renderiza botón si: isAdminOrOwner === true
           ↓
    [TIMING ISSUE - puede ser null o stale]
           ↓
    Cae a fallback: computeAdminFromTenants(tenants, tenant)
           ↓
    [PUEDE USAR DATOS INCORRECTOS]
           ↓
    Muestra botón ❌
```

---

## ✅ RECOMENDACIONES PARA REESTRUCTURACIÓN

### Opción 1: **Una sola fuente de verdad** (RECOMENDADO)

1. **Eliminar** `/me/can-access-admin` (confuso)
2. **Consolidar** `/tenants/role` en un solo lugar
3. **Frontend:** Solo usar `currentRole` del endpoint
4. **Eliminar** fallback a `computeAdminFromTenants`

### Opción 2: **Validación de 2 capas**

1. **Frontend:** Muestra/oculta UI basado en rol
2. **Backend:** SIEMPRE valida rol en cada endpoint
3. **Usar middleware** `requireRole(['admin', 'owner'])` en rutas protegidas

### Opción 3: **Sistema de permisos granular**

1. En lugar de roles, usar **permisos explícitos**
2. Tabla `permissions` con: `user_id, tenant_id, permission`
3. Permisos: `"admin:users:view"`, `"admin:users:edit"`, etc.

---

## 🔧 PRIORIDAD DE FIXES

### 🚨 URGENTE (Seguridad)
1. Agregar validación de rol en `/admin/users` endpoint
2. Agregar validación en `/admin/users/:id/toggle-active`
3. Agregar validación en `/admin/users/:id/change-role`

### 🔴 CRÍTICO (Funcionalidad)
4. Eliminar endpoint duplicado `/tenants/role`
5. Eliminar `/me/can-access-admin` o cambiar su lógica
6. Unificar lógica de `isAdminOrOwner` en un solo lugar (authorize.js)

### 🟠 IMPORTANTE (UX)
7. Sincronizar correctamente header X-Tenant-Id con AsyncStorage
8. Eliminar fallback en `isAdminOrOwner` useMemo
9. Agregar loading state mientras se verifica rol

### 🟡 MEJORAS (Mantenimiento)
10. Agregar logs de auditoría
11. Usar authorize.js consistentemente en todos los routers
12. Agregar invalidación de cache cuando cambia rol

---

## 📁 ARCHIVOS QUE NECESITAN REFACTORIZACIÓN

### Backend
- ✅ `server/routes/admin.js` - Agregar validación
- ✅ `server/routes/me.js` - Eliminar duplicados
- ✅ `server/routes/tenants.js` - Consolidar lógica
- ✅ `server/lib/authorize.js` - Usar en todos lados

### Frontend
- ✅ `app/more/index.tsx` - Simplificar lógica de rol
- ✅ `app/more/admin-users.tsx` - Remover verificación duplicada
- ✅ `src/api/auth.ts` - Sincronizar headers correctamente
- ✅ `src/api/http.ts` - Agregar interceptor para sync

---

## 🎬 SIGUIENTE PASO

Dime qué enfoque prefieres:

**A) FIX RÁPIDO:** Solo arreglar los bugs críticos de seguridad (1-3)

**B) REFACTOR PARCIAL:** Arreglar seguridad + unificar lógica de roles (1-9)

**C) REFACTOR COMPLETO:** Rediseñar todo el sistema de permisos desde cero

**D) CUSTOM:** Explícame tu visión y te propongo una arquitectura

---

**Esperando tu decisión para proceder... 🚀**
