# Sistema Simplificado - Solo Roles Globales

## 📋 Resumen de Cambios

Se eliminó el sistema de roles por workspace (tabla `memberships`) y se implementó un sistema **simplificado con solo roles globales** en la tabla `users`.

---

## 🎯 Nuevo Sistema de Roles

### Roles Globales (tabla `users.role`)

```sql
ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'member';
-- Valores posibles: 'owner', 'admin', 'member'
```

**👑 Owner (Dios del sistema)**
- Solo 1 en todo el sistema: jesusbloise@gmail.com
- Puede crear workspaces
- Ve y edita todos los datos
- Puede eliminar cualquier workspace

**🔑 Admin**
- Pueden crear workspaces
- Ven y editan todos los datos
- Acceso al panel de administración

**👤 Member (default)**
- NO pueden crear workspaces
- Solo ven/editan sus propios datos
- Usuarios normales

---

## 🗑️ Eliminaciones

### Tabla `memberships` - OBSOLETA
- ✅ Ya NO se crea al registrar usuario
- ✅ Ya NO se valida al hacer login
- ✅ Ya NO se usa en autorización
- ⚠️ Se mantiene en DB por seguridad (no se DROP)
- 📝 Marcada como obsoleta en migración 006

### Endpoints Eliminados
- ❌ `POST /tenants/join` - Ya no hay memberships
- ❌ `GET /tenants/:id/members` - Ya no hay miembros por workspace
- ❌ `PATCH /tenants/:id/members/:user_id` - Ya no hay roles por workspace

---

## 🔄 Archivos Modificados

### 1. `server/db/migrations/005_add_user_global_role.sql`
```sql
-- Agregar columna role a users
ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'member';

-- Actualizar usuarios existentes
UPDATE users SET role = 'member' WHERE email != 'jesusbloise@gmail.com';
UPDATE users SET role = 'owner' WHERE email = 'jesusbloise@gmail.com';

-- Índice
CREATE INDEX idx_users_role ON users(role);
```

### 2. `server/db/migrations/006_remove_memberships_use_global_roles.sql`
```sql
-- Marcar tabla memberships como obsoleta
COMMENT ON TABLE memberships IS 'OBSOLETA: Sistema usa solo users.role';
```

### 3. `server/lib/authorize.js` - SIMPLIFICADO
**Cambios principales:**
- `getUserRole(userId)` - Ya no necesita `tenantId`
- `isAdmin(userId)` - Verifica rol global (owner o admin)
- `isOwner(userId)` - Nueva función para verificar owner global
- `getOwnershipFilter(req)` - Sin `tenantId`, valida solo rol global
- `requireRole(['admin', 'owner'])` - Valida rol global
- `requireRoleInAny()` - DEPRECADO (ahora es igual a requireRole)

### 3.1. `server/lib/injectTenant.js` - SIMPLIFICADO (Fix 13/Ene/2025)
**Cambios críticos:**
- ❌ **ELIMINADO:** Validación de tabla `memberships`
- ❌ **ELIMINADO:** `if (!membership) return 403 forbidden_tenant`
- ✅ **AGREGADO:** Consulta rol GLOBAL de tabla `users`
- ✅ **req.tenantRole** = rol global (no por tenant)
- ✅ Todos los usuarios autenticados pueden acceder a cualquier workspace

**Antes (con memberships):**
```javascript
// ❌ Bloqueaba con 403 si no había membership
const membership = await db.prepare(
  `SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ?`
).get(req.user.id, tenant.id);

if (!membership) {
  return res.status(403).json({ error: "forbidden_tenant" });
}
```

**Después (sin memberships):**
```javascript
// ✅ Solo valida rol GLOBAL
const user = await db.prepare(
  `SELECT role FROM users WHERE id = $1 LIMIT 1`
).get(req.user.id);

req.tenantRole = user?.role || 'member';
next(); // ✅ No bloquea
```

### 3.2. `server/lib/tenant.js` - SIMPLIFICADO (Fix 13/Ene/2025)
**Cambios:**
- ❌ **ELIMINADO:** Consulta fallback a `memberships`
- ✅ Usa directamente `req.tenantRole` (viene de injectTenant)
- ✅ Función `requireTenantRole(['admin'])` ahora valida rol GLOBAL

### 4. `server/routes/tenants.js` - REESCRITO
**Nuevas reglas:**
- `POST /tenants` - Solo admin/owner pueden crear (middleware `requireRole(['admin', 'owner'])`)
- `GET /tenants` - Admin/owner ven todos, members solo los que crearon
- `DELETE /tenants/:id` - Solo creador o owner global pueden eliminar
- `POST /tenants/switch` - Simplificado (sin validar memberships)
- Eliminados: `/join`, `/members`, `PATCH /members/:user_id`

### 5. `server/routes/auth.js` - SIMPLIFICADO
**Registro:**
```javascript
const globalRole = 'member'; // Todos inician como member
await db.prepare(
  `INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
).run(userId, userName, lowerEmail, passwordHash, globalRole, timestamp, timestamp);

// ❌ YA NO: INSERT INTO memberships
```

**Login:**
```javascript
const userRole = user.role || 'member'; // Rol global
const payload = {
  sub: user.id,
  email: user.email,
  active_tenant: activeTenant,
  role: userRole // Rol global en JWT
};
```

### 6. `server/routes/me.js`
```javascript
// GET /me/profile ahora incluye rol global
SELECT id, name, email, role, avatar_url, ...
FROM users WHERE id = ?
```

---

## 🧪 Scripts de Utilidad

### `server/scripts/apply-global-roles.js`
Aplica migración de roles globales y verifica estado de usuarios.

```bash
cd server
node scripts/apply-global-roles.js
```

### `server/scripts/test-simplified-system.js`
Valida que el sistema simplificado funciona correctamente.

```bash
cd server
node scripts/test-simplified-system.js
```

**Output esperado:**
```
✅ SISTEMA SIMPLIFICADO VALIDADO

📋 Reglas del sistema:
  1. Solo ROL GLOBAL (users.role): owner, admin, member
  2. NO hay roles por workspace (tabla memberships obsoleta)
  3. Solo admin/owner pueden crear workspaces
  4. Admin/owner ven todos los datos, members solo los suyos
  5. Solo 1 owner global (jesusbloise) - Dios del sistema
```

### `server/scripts/test-tenant-access-simplified.js` ⭐ NUEVO
Valida que el acceso a workspaces funciona sin memberships (Fix 13/Ene/2025).

```bash
cd server
node scripts/test-tenant-access-simplified.js
```

**Output esperado:**
```
🧪 TESTING: Acceso a Tenants sin Memberships
═══════════════════════════════════════════════════

👥 USUARIOS:
  👑 jesusbloise@gmail.com → rol global: OWNER
  🔑 jesus@demo.com → rol global: ADMIN
  👤 admin@demo.local → rol global: MEMBER

📁 WORKSPACES:
  • demo - "Demo"
  • jesus - "publicidad"

🧩 SIMULACIÓN: Middleware injectTenant
  👑 Owner  → ✅ Acceso a todos los workspaces
  🔑 Admin  → ✅ Acceso a todos los workspaces
  👤 Member → ✅ Acceso a todos los workspaces

✅ TESTING COMPLETADO
```

---

## 📊 Estado Actual del Sistema

### Usuarios (testing):
```
👑 jesusbloise@gmail.com → OWNER (Dios del sistema)
👤 admin@demo.local → MEMBER
👤 jesus@demo.com → MEMBER
👤 ramon@gmail.com → MEMBER
```

### Workspaces:
```
demo - "Demo" (creado por admin@demo.local)
jesus - "publicidad" (creado por jesus@demo.com)
```

### Memberships (obsoleto):
```
6 registros en tabla (obsoletos - ignorados por el sistema)
```

---

## 🔐 Flujo de Permisos

### Crear Workspace
1. Usuario hace `POST /tenants`
2. Middleware `requireRole(['admin', 'owner'])` valida rol global
3. Si es member → ❌ 403 Forbidden
4. Si es admin/owner → ✅ Crear workspace

### Ver Datos (Leads, Contacts, etc)
1. Usuario hace `GET /leads`
2. `getOwnershipFilter()` verifica rol global:
   - Admin/Owner → Sin filtro (ven todo)
   - Member → `WHERE created_by = userId` (solo sus datos)

### Editar/Eliminar Datos
1. Usuario hace `PUT /leads/:id` o `DELETE /leads/:id`
2. Middleware `canWrite()` o `canDelete()` valida:
   - Admin/Owner → ✅ Permitir
   - Member → Verificar `created_by === userId`

---

## 🚀 Próximos Pasos (Opcional)

### Promover Members a Admin
Actualmente solo jesusbloise es owner. Para que otros usuarios puedan crear workspaces:

```sql
-- Promover usuario a admin
UPDATE users SET role = 'admin' WHERE email = 'usuario@example.com';
```

O crear endpoint en `server/routes/admin.js`:
```javascript
PUT /admin/users/:id/role
Body: { role: 'admin' }
Middleware: requireRole(['owner']) // Solo owner puede promover
```

### Frontend
Actualizar UI para:
1. Mostrar rol global del usuario
2. Ocultar botón "Crear Workspace" si role === 'member'
3. Mostrar badge de rol (👑 Owner, 🔑 Admin, 👤 Member)

---

## ⚠️ Notas Importantes

1. **Tabla memberships NO se eliminó** - Se mantiene por seguridad pero está obsoleta
2. **Solo 1 owner** - jesusbloise@gmail.com es el único owner global (Dios del sistema)
3. **Nuevos usuarios** - Todos inician como 'member' (no pueden crear workspaces)
4. **Backward compatibility** - Funciones helper antiguas retornan `null` pero no rompen el sistema

---

## ✅ Validación

El sistema fue probado y validado con:
- ✅ 4 usuarios con roles globales correctos
- ✅ 2 workspaces existentes
- ✅ Permisos funcionando correctamente
- ✅ Login/Registro sin memberships
- ✅ CRUD validando solo rol global

**Script de validación:**
```bash
cd server
node scripts/test-simplified-system.js
```

---

## 🐛 Troubleshooting

### Error 403 forbidden_tenant al buscar/entrar a workspace
**Problema:** Al buscar workspace y presionar "Entrar" aparece error `403 (Forbidden)`.

**Causa:** Middleware `injectTenant.js` validaba tabla `memberships` obsoleta.

**Solución aplicada (13/Ene/2025):**
- Actualizado `server/lib/injectTenant.js` para NO validar memberships
- Actualizado `server/lib/tenant.js` para NO consultar memberships
- Ahora usa solo rol GLOBAL de tabla `users`

**Ver documentación completa:** `FIX-ERROR-403-FORBIDDEN-TENANT.md`

---

Última actualización: 2025-01-13
Sistema funcionando ✅
