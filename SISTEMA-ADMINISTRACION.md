# Sistema de Administración - Roles Globales

## ✅ Implementación Completada

Se implementó un **sistema completo de administración** basado en roles globales, donde solo **owners y admins** pueden:
- Ver el panel de administración
- Cambiar roles de usuarios
- Crear workspaces

---

## 🎯 Funcionalidades Implementadas

### 1. Panel de Administración (`GET /admin/users`)
**Protección:** `requireRole(['admin', 'owner'])`

```javascript
// Lista TODOS los usuarios con su rol GLOBAL
GET /admin/users

Response:
{
  "users": [
    {
      "id": "...",
      "email": "jesusbloise@gmail.com",
      "name": "jesus",
      "role": "owner",        // ⭐ Rol GLOBAL
      "active": true,
      "workspaces_created": 2  // Cantidad de workspaces creados
    },
    ...
  ]
}
```

### 2. Cambiar Rol Global (`PUT /admin/users/:id/role`)
**Protección:** `requireRole(['admin', 'owner'])`

```javascript
PUT /admin/users/:userId/role
Body: { "role": "admin" | "member" | "owner" }

Reglas:
- ✅ Admin puede: member ⟷ admin
- ❌ Admin NO puede: promover a owner, modificar owners
- ✅ Owner puede: cambiar cualquier rol (incluido owner)
- ❌ Nadie puede: cambiar su propio rol
- ❌ Sistema protege: debe haber al menos 1 owner

Response:
{
  "success": true,
  "user": {
    "id": "...",
    "email": "usuario@example.com",
    "role": "admin"
  },
  "message": "Usuario usuario@example.com ahora es admin"
}
```

### 3. Endpoint de Rol Actual (`GET /tenants/role`)

```javascript
// Retorna el ROL GLOBAL del usuario
GET /tenants/role

Response:
{
  "tenant_id": "demo",
  "role": "member"  // ⭐ Rol GLOBAL (no depende del workspace)
}
```

### 4. Lista de Workspaces (`GET /me/tenants`)

```javascript
// Filtra workspaces según rol global
GET /me/tenants

Lógica:
- Admin/Owner: ven TODOS los workspaces
- Member: solo ven los que crearon

Response:
{
  "items": [
    {
      "id": "demo",
      "name": "Demo",
      "owner_name": "Demo Admin",
      "owner_email": "admin@demo.local",
      "is_active": true,
      "is_creator": false
    }
  ],
  "active_tenant": "demo",
  "user_role": "member"  // ⭐ Rol global incluido
}
```

### 5. Frontend - Ocultamiento de Botones

```tsx
// app/more/index.tsx

// Obtiene rol global
const [currentRole, setCurrentRole] = useState<"owner" | "admin" | "member" | null>(null);

const fetchCurrentRole = async () => {
  const res = await api.get<{ tenant_id: string | null; role: string | null }>(
    "/tenants/role"
  );
  setCurrentRole(res?.role || null);
};

// Helper para determinar acceso
const isAdminOrOwner = currentRole === "owner" || currentRole === "admin";

// Botón "Nuevo Workspace" - Solo admin/owner
{isAdminOrOwner && (
  <Pressable onPress={() => router.push("/more/workspaces-new")}>
    <Text>Nuevo workspace</Text>
  </Pressable>
)}

// Botón "Administrador" - Solo admin/owner
{isAdminOrOwner && (
  <Pressable onPress={() => router.push("/more/admin-users")}>
    <Text>Administrador</Text>
  </Pressable>
)}
```

---

## 🔐 Matriz de Permisos

| Acción | Owner 👑 | Admin 🔑 | Member 👤 |
|--------|---------|---------|-----------|
| **Panel de Administración** |
| Ver panel `/admin/users` | ✅ | ✅ | ❌ |
| Cambiar rol member→admin | ✅ | ✅ | ❌ |
| Cambiar rol admin→owner | ✅ | ❌ | ❌ |
| Cambiar rol owner→member | ✅ | ❌ | ❌ |
| Modificar otros owners | ✅ | ❌ | ❌ |
| Cambiar su propio rol | ❌ | ❌ | ❌ |
| **Workspaces** |
| Ver todos los workspaces | ✅ | ✅ | ❌ |
| Ver solo sus workspaces | ✅ | ✅ | ✅ |
| Crear workspaces | ✅ | ✅ | ❌ |
| Eliminar workspace propio | ✅ | ✅ | ✅ |
| Eliminar workspace ajeno | ✅ | ❌ | ❌ |
| **Datos (Leads, Contacts, etc)** |
| Ver todos los datos | ✅ | ✅ | ❌ |
| Ver solo sus datos | ✅ | ✅ | ✅ |
| Editar datos de otros | ✅ | ✅ | ❌ |
| Eliminar datos de otros | ✅ | ✅ | ❌ |
| **UI** |
| Ver botón "Nuevo Workspace" | ✅ | ✅ | ❌ |
| Ver botón "Administrador" | ✅ | ✅ | ❌ |

---

## 📊 Estado Actual del Sistema

### Usuarios:
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

### Rol Distribution:
- **1 Owner** - jesusbloise@gmail.com
- **0 Admins** - (ninguno todavía)
- **3 Members** - Todos los demás usuarios

---

## 🚀 Cómo Promover Usuarios a Admin

### Opción 1: SQL Directo
```sql
-- Promover usuario a admin
UPDATE users SET role = 'admin', updated_at = 1731441600000 
WHERE email = 'jesus@demo.com';
```

### Opción 2: API (desde el frontend o Postman)
```bash
# Login como jesusbloise (owner)
POST /auth/login
Body: { "email": "jesusbloise@gmail.com", "password": "..." }

# Obtener ID del usuario a promover
GET /admin/users

# Promover usuario a admin
PUT /admin/users/{userId}/role
Headers: { "Authorization": "Bearer {token}" }
Body: { "role": "admin" }
```

### Opción 3: Script Node.js
```javascript
// server/scripts/promote-user-to-admin.js
const db = require('../db/connection');

async function promoteToAdmin(email) {
  const user = await db.prepare(
    'SELECT id, email, role FROM users WHERE email = ?'
  ).get(email);
  
  if (!user) {
    console.log(`❌ Usuario ${email} no encontrado`);
    return;
  }
  
  if (user.role === 'owner') {
    console.log(`⚠️  ${email} ya es owner (no se puede degradar)`);
    return;
  }
  
  await db.prepare(
    'UPDATE users SET role = ?, updated_at = ? WHERE id = ?'
  ).run('admin', Date.now(), user.id);
  
  console.log(`✅ ${email} promovido a admin`);
}

// Ejemplo de uso
promoteToAdmin('jesus@demo.com');
```

---

## 📁 Archivos Modificados (7 total)

### Backend:
1. `server/routes/admin.js` ✏️
   - GET /admin/users → Muestra rol global
   - PUT /admin/users/:id/role → Cambia rol global (NUEVO)
   - POST /admin/users/:id/change-role → DEPRECADO

2. `server/routes/me.js` ✏️
   - GET /tenants/role → Retorna rol global (no memberships)
   - GET /me/tenants → Filtra por rol global
   - POST /me/tenant/switch → JWT con rol global

3. `server/lib/authorize.js` ✏️ (ya actualizado previamente)
   - Solo valida rol global (no tenant_id)

4. `server/routes/tenants.js` ✏️ (ya actualizado previamente)
   - POST /tenants → requireRole(['admin', 'owner'])

### Scripts:
5. `server/scripts/test-admin-system.js` ⭐ NUEVO
   - Testing completo del sistema de administración

### Frontend:
6. `app/more/index.tsx` ✏️
   - Oculta botones según `isAdminOrOwner`
   - Obtiene rol global de `/tenants/role`

### Documentación:
7. `SISTEMA-ADMINISTRACION.md` ⭐ NUEVO (este archivo)

---

## ✅ Testing Completo

**Script de validación:**
```bash
cd server
node scripts/test-admin-system.js
```

**Output esperado:**
```
✅ SISTEMA DE ADMINISTRACIÓN VALIDADO

📋 Funcionalidades:
  1. Panel de admin protegido (solo admin/owner)
  2. Cambio de rol global de usuarios
  3. Activar/desactivar usuarios
  4. Frontend oculta botones según rol
  5. Workspaces filtrados por rol global
```

---

## 🎯 Próximos Pasos (Opcional)

### 1. Actualizar UI del Frontend
Agregar selector de roles en el panel de administración:

```tsx
// app/more/admin-users.tsx

<Select
  value={user.role}
  onChange={(newRole) => handleChangeRole(user.id, newRole)}
  options={[
    { label: "👤 Member", value: "member" },
    { label: "🔑 Admin", value: "admin" },
    { label: "👑 Owner", value: "owner" }
  ]}
  disabled={!canChangeRole(user)}
/>
```

### 2. Agregar Badge de Rol
Mostrar el rol del usuario actual en el header:

```tsx
// app/components/RoleBadge.tsx

{currentRole === 'owner' && <Badge>👑 Owner</Badge>}
{currentRole === 'admin' && <Badge>🔑 Admin</Badge>}
{currentRole === 'member' && <Badge>👤 Member</Badge>}
```

### 3. Notificaciones de Cambio de Rol
Cuando un admin cambie tu rol, recibir notificación:

```javascript
// server/routes/admin.js (después de cambiar rol)

// Enviar notificación al usuario
await sendNotification(userId, {
  title: "Tu rol ha cambiado",
  body: `Ahora eres ${newRole} en el sistema`,
  data: { type: "role_changed", new_role: newRole }
});
```

---

## ⚠️ Notas Importantes

1. **Solo 1 owner global** - jesusbloise@gmail.com es el único owner (Dios del sistema)
2. **Protección de owner** - El sistema valida que siempre haya al menos 1 owner
3. **No cambiar propio rol** - Nadie puede cambiar su propio rol (seguridad)
4. **Frontend reactivo** - Los botones se ocultan automáticamente según el rol
5. **JWT incluye rol** - El token contiene el rol global para validaciones rápidas

---

## 📝 Logs de Auditoría

Todos los cambios de rol se registran en `audit_logs`:

```sql
SELECT 
  al.action,
  al.resource_type,
  al.resource_id,
  al.details,
  u.email as performed_by,
  al.created_at
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.action = 'change_role'
ORDER BY al.created_at DESC;
```

---

Última actualización: 2025-11-12  
Sistema funcionando ✅  
Testing completado ✅
