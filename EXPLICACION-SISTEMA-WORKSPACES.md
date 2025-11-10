# 📚 Explicación del Sistema de Workspaces, Usuarios y Administración

## 🎯 Resumen Ejecutivo

Tu CRM tiene un sistema **multi-tenant** (multi-inquilino) donde:
- Múltiples **usuarios** pueden existir en el sistema
- Cada usuario puede pertenecer a múltiples **workspaces** (espacios de trabajo)
- En cada workspace, el usuario tiene un **rol específico** (owner, admin, member)
- Solo usuarios **admin** u **owner** pueden ver y usar el panel de administración

---

## 🗄️ Estructura de la Base de Datos

### 1. Tabla `users` (Usuarios)
Almacena la información de cada persona registrada:

```
┌─────────────────────────┬──────────────────────────┬────────────────┐
│ Campo                   │ Descripción              │ Ejemplo        │
├─────────────────────────┼──────────────────────────┼────────────────┤
│ id                      │ Identificador único      │ demo-admin     │
│ email                   │ Correo del usuario       │ jesus@gmail.com│
│ name                    │ Nombre completo          │ Jesús          │
│ password_hash           │ Contraseña encriptada    │ [hash bcrypt]  │
│ active / is_active      │ Usuario activo (1 o 0)   │ 1              │
│ created_at              │ Fecha de creación        │ 1730987654000  │
└─────────────────────────┴──────────────────────────┴────────────────┘
```

**Importante:** Tienes DOS columnas para activo: `active` y `is_active` (por compatibilidad). Ambas se usan igual.

---

### 2. Tabla `tenants` (Workspaces)
Almacena los espacios de trabajo:

```
┌─────────────────────────┬──────────────────────────┬────────────────┐
│ Campo                   │ Descripción              │ Ejemplo        │
├─────────────────────────┼──────────────────────────┼────────────────┤
│ id                      │ ID del workspace         │ demo           │
│ name                    │ Nombre del workspace     │ Demo           │
│ created_by              │ Usuario creador          │ demo-admin     │
│ created_at              │ Fecha de creación        │ 1730987654000  │
└─────────────────────────┴──────────────────────────┴────────────────┘
```

---

### 3. Tabla `memberships` (Membresías) ⭐ **MÁS IMPORTANTE**
Esta es la tabla **CLAVE** que conecta usuarios con workspaces y define sus roles:

```
┌─────────────────────────┬──────────────────────────┬────────────────┐
│ Campo                   │ Descripción              │ Ejemplo        │
├─────────────────────────┼──────────────────────────┼────────────────┤
│ user_id                 │ ID del usuario           │ demo-admin     │
│ tenant_id               │ ID del workspace         │ demo           │
│ role                    │ Rol del usuario          │ admin          │
│ created_at              │ Cuándo se unió           │ 1730987654000  │
└─────────────────────────┴──────────────────────────┴────────────────┘
```

**Ejemplo de datos reales:**
```
usuario: jesusbloise@gmail.com
   ├─ workspace: demo         → rol: admin
   ├─ workspace: demo-2       → rol: admin
   ├─ workspace: jesus        → rol: admin
   └─ workspace: luis         → rol: admin

usuario: carolina@gmail.com
   └─ workspace: demo         → rol: member

usuario: test.user123@example.com
   └─ workspace: t_a638edc0   → rol: member
```

---

## 🔐 Tipos de Roles

### 1. **owner** (Propietario)
- Tiene control total del workspace
- Puede cambiar roles de otros usuarios
- Puede activar/desactivar usuarios
- Puede ver el panel de administración ✅

### 2. **admin** (Administrador)
- Puede gestionar el workspace
- Puede activar/desactivar usuarios
- Puede ver el panel de administración ✅
- No puede cambiar roles (solo jesusbloise@gmail.com puede)

### 3. **member** (Miembro)
- Acceso básico al workspace
- NO puede gestionar usuarios
- NO ve el panel de administración ❌

---

## 🔄 Flujo de Autenticación y Workspaces

### 1. **Login** (`/auth/login`)
```
Usuario envía: { email, password }
                    ↓
Backend valida credenciales
                    ↓
Backend busca workspaces del usuario en `memberships`
                    ↓
Backend genera JWT con:
   - sub: ID del usuario
   - email: email del usuario
   - active_tenant: workspace activo (el primero o el que pidió)
   - roles: { admin: true } (según el rol en ese workspace)
                    ↓
Cliente guarda:
   - Token en AsyncStorage (clave: "auth.token")
   - Tenant activo en AsyncStorage (clave: "auth.tenant")
```

### 2. **Cambio de Workspace** (`/me/tenant/switch`)
```
Usuario selecciona otro workspace
                    ↓
Frontend envía: POST /me/tenant/switch { tenant_id: "demo-2" }
                    ↓
Backend verifica que el usuario sea miembro (tabla memberships)
                    ↓
Backend genera NUEVO JWT con:
   - active_tenant: "demo-2"
   - roles: { admin: true } (según rol en demo-2)
                    ↓
Cliente actualiza:
   - Token nuevo en AsyncStorage
   - Tenant activo en AsyncStorage
                    ↓
Frontend recarga datos con nuevo tenant
```

---

## 🎛️ Cómo Funciona el Botón de Administrador

### Ubicación: `app/more/index.tsx`

**Flujo actual (implementación más reciente):**

```typescript
1. Usuario abre la pantalla "Más" (More)
                    ↓
2. Frontend carga lista de workspaces: GET /me/tenants
   Respuesta:
   {
     items: [
       { id: "demo", name: "Demo", role: "admin", is_active: true },
       { id: "demo-2", name: "demo2", role: "member", is_active: false }
     ],
     active_tenant: "demo"
   }
                    ↓
3. useEffect verifica el rol del workspace activo:
   
   const activeTenant = tenants.find(t => t.id === tenant);
   const role = (activeTenant.role || "").toLowerCase();
   const isAdminOrOwner = role === "admin" || role === "owner";
                    ↓
4. Actualiza estado: setCanAccessAdminPanel(isAdminOrOwner)
                    ↓
5. Renderiza condicionalmente:
   
   {canAccessAdminPanel && (
     <Pressable>
       👥 Administrador
     </Pressable>
   )}
```

**¿Por qué funciona?**
- Usa datos que **YA ESTÁN CARGADOS** (array `tenants`)
- No hace llamadas adicionales al servidor
- El rol viene directamente de la tabla `memberships`
- Se actualiza automáticamente cuando cambia el workspace

---

## 👥 Panel de Administración

### Ubicación: `app/more/admin-users.tsx`

**¿Qué puede hacer un admin?**

### 1. **Ver todos los usuarios** (`GET /admin/users`)
```javascript
Respuesta:
{
  users: [
    {
      id: "demo-admin",
      email: "admin@demo.local",
      name: "Demo Admin",
      active: true,
      workspaces: [
        { tenant_id: "demo", tenant_name: "Demo", role: "owner" },
        { tenant_id: "demo-2", tenant_name: "demo2", role: "admin" }
      ]
    }
  ]
}
```

### 2. **Activar/Desactivar usuarios** (`POST /admin/users/:userId/toggle-active`)
```
Usuario admin presiona "Desactivar"
                    ↓
Frontend muestra modal de confirmación
                    ↓
Usuario confirma
                    ↓
Backend actualiza: UPDATE users SET active = 0 WHERE id = ?
                    ↓
requireAuth middleware bloquea login de usuarios inactivos
                    ↓
Usuario desactivado NO puede iniciar sesión
```

### 3. **Cambiar roles** (`POST /admin/users/:userId/change-role`)
```
Usuario admin presiona "🔄" junto a un rol
                    ↓
Frontend muestra: "¿Cambiar de Admin a Miembro?"
                    ↓
Usuario confirma
                    ↓
Backend actualiza: 
  UPDATE memberships 
  SET role = 'member' 
  WHERE user_id = ? AND tenant_id = ?
                    ↓
Usuario afectado tiene nuevo rol la próxima vez que cambie workspace
```

**⚠️ RESTRICCIÓN IMPORTANTE:**
Solo el usuario `jesusbloise@gmail.com` puede cambiar roles. Esto está hardcodeado en:
- `server/routes/tenants.js` línea ~195

---

## 🔒 Sistema de Seguridad

### 1. **Middleware `requireAuth`** (`server/lib/requireAuth.js`)
Se ejecuta en CADA request:

```javascript
1. Lee el header: Authorization: Bearer <token>
                    ↓
2. Verifica el JWT con la clave secreta
                    ↓
3. Extrae el user_id del token
                    ↓
4. Verifica en la base de datos:
   SELECT active FROM users WHERE id = ?
                    ↓
5. Si active === 0 → rechaza con error 403
                    ↓
6. Si active === 1 → permite el request
```

### 2. **Header `X-Tenant-Id`**
En cada request, el frontend envía:

```
Headers:
  Authorization: Bearer eyJhbGc...
  X-Tenant-Id: demo
```

Esto le dice al backend:
- "Estoy actuando en el workspace 'demo'"
- Todas las consultas se filtran por este tenant
- Los permisos se verifican para este workspace específico

---

## 🐛 Problemas Comunes y Soluciones

### Problema 1: "El botón aparece para todos los usuarios"
**Causa:** El rol no se está verificando correctamente

**Verificación:**
```javascript
// En app/more/index.tsx, revisar console.logs:
console.log("🔍 Verificando rol del workspace activo:");
console.log("  - Tenant activo:", tenant);          // ¿Es el correcto?
console.log("  - Rol:", role);                      // ¿Dice "admin" o "member"?
console.log("  - Es admin/owner:", isAdminOrOwner); // ¿Es true cuando debería ser false?
```

**Solución actual:**
```javascript
// Verificar directamente del array tenants
const activeTenant = tenants.find(t => t.id === tenant);
const role = (activeTenant.role || "").toLowerCase();
const isAdminOrOwner = role === "admin" || role === "owner";
setCanAccessAdminPanel(isAdminOrOwner);
```

---

### Problema 2: "El rol no cambia al cambiar de workspace"
**Causa:** El estado no se actualiza

**Solución:**
```javascript
useEffect(() => {
  // Se ejecuta cada vez que cambian tenant o tenants
  const activeTenant = tenants.find(t => t.id === tenant);
  if (activeTenant) {
    const role = (activeTenant.role || "").toLowerCase();
    setCanAccessAdminPanel(role === "admin" || role === "owner");
  }
}, [tenant, tenants]); // ⭐ Importante: ambas dependencias
```

---

### Problema 3: "No puedo cambiar roles"
**Causa:** Solo jesusbloise@gmail.com puede cambiar roles

**Verificación en base de datos:**
```sql
-- Ver tu usuario actual
SELECT id, email FROM users WHERE email = 'tu-email@gmail.com';

-- Verificar si eres jesusbloise
SELECT email FROM users WHERE email = 'jesusbloise@gmail.com';
```

**Solución temporal (para desarrollo):**
Editar `server/routes/tenants.js` línea ~195:
```javascript
// ANTES (solo jesusbloise)
if (!requester || requester.email !== "jesusbloise@gmail.com")
  return res.status(403).json({ error: "forbidden" });

// DESPUÉS (cualquier admin)
const requesterMembership = db.prepare(
  "SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1"
).get(requesterId, tenantId);

if (!requesterMembership || !["admin", "owner"].includes(requesterMembership.role))
  return res.status(403).json({ error: "forbidden_requires_admin" });
```

---

## 📊 Diagrama de Flujo Visual

```
┌─────────────────────────────────────────────────────────────┐
│                    USUARIO HACE LOGIN                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │   Backend valida usuario    │
        │   y carga sus workspaces    │
        └─────────────┬───────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  ¿Tiene memberships?        │
        └─────────────┬───────────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▼
       SÍ                      NO
          │                       │
          │                       └─► Sin workspaces
          ▼                           (crear uno nuevo)
┌─────────────────────┐
│  Carga lista de     │
│  workspaces con     │
│  sus roles          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend: Pantalla "Más" (More)                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Workspace 1: Demo (admin) ✅                        │   │
│  │  Workspace 2: Demo2 (member)                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  useEffect verifica:                                        │
│  - Workspace activo: "demo"                                 │
│  - Rol en ese workspace: "admin"                            │
│  - ¿Es admin/owner?: SÍ ✅                                  │
│                                                              │
│  Resultado:                                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  [👥 Administrador]  ← BOTÓN VISIBLE                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
           │
           │ Usuario presiona el botón
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Panel de Administración                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  👤 Usuario 1 - admin@demo.local                     │   │
│  │     [🚫 Desactivar] [🔄 Cambiar rol]                 │   │
│  │                                                       │   │
│  │  👤 Usuario 2 - carolina@gmail.com                   │   │
│  │     [✅ Activar] [🔄 Cambiar rol]                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧪 Cómo Probar el Sistema

### Test 1: Verificar roles en base de datos
```bash
node -e "const db=require('./server/db/connection');console.table(db.prepare('SELECT u.email, m.tenant_id, t.name as workspace, m.role FROM memberships m JOIN users u ON u.id = m.user_id JOIN tenants t ON t.id = m.tenant_id ORDER BY u.email').all())"
```

### Test 2: Login como admin
```javascript
// En la app:
1. Login con: jesusbloise@gmail.com
2. Ir a "Más"
3. Ver workspaces disponibles
4. ✅ Debería ver botón "Administrador"
```

### Test 3: Login como member
```javascript
// En la app:
1. Login con: carolina@gmail.com
2. Ir a "Más"
3. Ver workspaces disponibles
4. ❌ NO debería ver botón "Administrador"
```

### Test 4: Cambiar de workspace
```javascript
1. Login como jesusbloise@gmail.com
2. Workspace actual: "demo" (admin) → ✅ ve botón
3. Cambiar a workspace: "demo-2" (admin) → ✅ sigue viendo botón
4. Si tuviera un workspace con role="member" → ❌ botón desaparece
```

---

## 📝 Resumen de Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `server/db/connection.js` | Conexión a SQLite |
| `server/routes/auth.js` | Login, register, JWT |
| `server/routes/me.js` | Perfil, workspaces, tenant switch |
| `server/routes/tenants.js` | CRUD de workspaces, cambio de roles |
| `server/routes/admin.js` | Panel admin (toggle active, etc) |
| `server/lib/requireAuth.js` | Middleware de autenticación |
| `app/more/index.tsx` | Pantalla "Más" con selector de workspace |
| `app/more/admin-users.tsx` | Panel de administración |
| `src/api/auth.ts` | Funciones helper del frontend |

---

## 🎯 Tu Implementación Actual

**Estado:** ✅ **Funcionando correctamente** (última implementación)

**Cómo funciona:**
1. Frontend carga workspaces con `fetchTenants()`
2. Encuentra el workspace activo en el array
3. Lee el campo `role` directamente
4. Verifica si es "admin" o "owner"
5. Muestra/oculta el botón según el resultado

**Ventajas:**
- ✅ Simple y directo
- ✅ No hace llamadas extra al servidor
- ✅ Se actualiza automáticamente al cambiar workspace
- ✅ Usa datos que ya están cargados

**Código clave:**
```typescript
useEffect(() => {
  const activeTenant = tenants.find(t => t.id === tenant);
  if (activeTenant) {
    const role = (activeTenant.role || "").toLowerCase();
    const isAdminOrOwner = role === "admin" || role === "owner";
    setCanAccessAdminPanel(isAdminOrOwner);
  }
}, [tenant, tenants]);
```

---

## 🚀 Próximos Pasos Sugeridos

1. **Probar con diferentes usuarios y roles**
   - Crear usuario con role="member"
   - Verificar que NO vea el botón
   - Cambiar su rol a "admin"
   - Verificar que SÍ vea el botón

2. **Mejorar permisos de cambio de roles**
   - Actualmente solo jesusbloise puede cambiar roles
   - Considerar permitir que cualquier "owner" pueda hacerlo

3. **Agregar auditoría**
   - Log de quién cambió qué rol
   - Log de quién activó/desactivó usuarios

4. **Mejorar UI**
   - Indicador visual del workspace activo
   - Badges de rol más prominentes

---

¿Necesitas que te explique alguna parte con más detalle? 🤓
