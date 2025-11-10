# Especificación del Sistema CRM Multi-Tenant

## 1. Modelo de Datos

### 1.1 Tablas Principales

**users**
- `id`: Identificador único del usuario
- `email`: Email único
- `name`: Nombre completo
- `password_hash`: Contraseña encriptada
- `active`: Estado (1=activo, 0=inactivo)

**tenants** (Workspaces)
- `id`: Identificador único del workspace
- `name`: Nombre del workspace
- `created_by`: ID del usuario creador

**memberships**
- `user_id`: ID del usuario
- `tenant_id`: ID del workspace
- `role`: Rol del usuario (`owner`, `admin`, `member`)

Clave primaria: `(user_id, tenant_id)`

---

## 2. Sistema de Roles

### 2.1 Owner

**Usuario designado:** `jesusbloise@gmail.com`

**Permisos:**
- Crear y eliminar workspaces
- Asignar y modificar roles de cualquier usuario
- Activar y desactivar usuarios
- Ver toda la información en todos los workspaces
- Acceso al panel de administración

**Regla de visibilidad:**
```sql
SELECT * FROM entidades WHERE workspace_id = :current_workspace
```

### 2.2 Admin

**Permisos:**
- Crear workspaces
- Asignar roles (excepto modificar al owner)
- Activar y desactivar usuarios
- Ver toda la información de todos los usuarios en sus workspaces
- Acceso al panel de administración

**Restricciones:**
- No puede eliminar al owner
- No puede modificar el rol del owner

**Regla de visibilidad:**
```sql
SELECT * FROM entidades WHERE workspace_id = :current_workspace
```

### 2.3 Member (Miembro)

**Rol por defecto** al registrarse.

**Permisos:**
- Trabajar en workspaces a los que tiene acceso
- Crear cuentas, contactos, oportunidades y registros CRM
- Ver y editar únicamente su propia información

**Restricciones:**
- NO puede crear workspaces
- NO puede ver el panel de administración
- NO puede modificar roles
- NO puede ver información creada por otros usuarios

**Regla de visibilidad:**
```sql
SELECT * FROM entidades 
WHERE workspace_id = :current_workspace 
  AND created_by = :current_user_id
```

---

## 3. Reglas de Visibilidad de Datos

### 3.1 Para Member
Un miembro **solo ve los registros que él mismo creó**, aunque otros usuarios trabajen en el mismo workspace.

**Implementación:**
```javascript
if (userRole === 'member') {
  query += ' AND created_by = ?';
  params.push(userId);
}
```

### 3.2 Para Admin y Owner
Pueden ver **todos los registros** del workspace, sin importar quién los creó.

**Implementación:**
```javascript
if (userRole === 'admin' || userRole === 'owner') {
  // Sin filtro adicional por created_by
  // Solo filtrar por workspace_id
}
```

---

## 4. Gestión de Workspaces

### 4.1 Creación de Workspaces

**Política oficial:**
- ✅ Solo **Owner** y **Admin** pueden crear workspaces
- ❌ Los **miembros** deben solicitar la creación a un admin u owner

**Implementación:**
```javascript
// En POST /tenants
const userRole = await getUserRole(userId, anyTenantId);
if (userRole === 'member') {
  return res.status(403).json({ 
    error: 'forbidden_members_cannot_create_workspaces' 
  });
}
```

### 4.2 Acceso a Workspaces

**Selector de workspace:**
- Visible para todos los roles
- Muestra solo los workspaces donde el usuario tiene membresía
- Permite cambio de contexto entre workspaces

---

## 5. Interfaz de Usuario

### 5.1 Botón de Administrador

**Ubicación:** `app/more/index.tsx`

**Regla de visibilidad:**
```typescript
if (user.role === 'owner' || user.role === 'admin') {
  // Mostrar botón "👥 Administrador"
} else {
  // Ocultar botón
}
```

**Implementación:**
- Verifica el rol del usuario en el workspace activo
- Se actualiza automáticamente al cambiar de workspace
- Lee el campo `role` de la tabla `memberships`

### 5.2 Panel de Administración

**Acceso:** Solo usuarios con rol `owner` o `admin`

**Funcionalidades:**
1. Ver todos los usuarios del sistema
2. Activar/desactivar usuarios
3. Cambiar roles por workspace
4. Ver membresías de cada usuario

---

## 6. Autenticación y Seguridad

### 6.1 Middleware requireAuth

En cada request:
1. Verificar token JWT válido
2. Extraer `user_id` del token
3. Verificar que `users.active = 1`
4. Si inactivo → rechazar con HTTP 403
5. Si activo → permitir request

### 6.2 Header X-Tenant-Id

Requerido en todos los requests:
```
X-Tenant-Id: <workspace_id>
```

Define el contexto del workspace para todas las operaciones.

---

## 7. Entidades del CRM

Las siguientes entidades aplican las reglas de visibilidad según el rol:

- **Leads** (Prospectos)
- **Accounts** (Cuentas)
- **Contacts** (Contactos)
- **Deals** (Oportunidades)
- **Activities** (Actividades)
- **Notes** (Notas)

**Todas tienen:**
- `workspace_id`: Workspace al que pertenecen
- `created_by`: Usuario que las creó
- Timestamps: `created_at`, `updated_at`

---

## 8. Resumen del Modelo

### Filosofía del Sistema

**Workspaces compartidos, datos segregados por rol:**

- Los **miembros** trabajan en workspaces creados por admin/owner
- Cada **miembro** ve únicamente su propia información
- **Admin** y **Owner** ven toda la información y gestionan el sistema
- La colaboración ocurre a nivel de workspace, pero la visibilidad se controla por rol

### Casos de Uso

**Empresa con vendedores:**
- Owner crea workspace "Ventas"
- Asigna 5 vendedores como members
- Cada vendedor ve solo sus clientes y oportunidades
- Owner y admins ven todo para reportería y supervisión

**Equipos múltiples:**
- Owner crea: "Ventas", "Marketing", "Soporte"
- Usuarios pueden tener diferentes roles en diferentes workspaces
- Cambio de workspace = cambio de contexto y permisos

---

## 9. Archivos de Implementación

### Backend
- `server/lib/getUserRole.js` - Helper para obtener rol del usuario
- `server/routes/leads.js` - Filtros de visibilidad para leads
- `server/routes/accounts.js` - Filtros de visibilidad para accounts
- `server/routes/contacts.js` - Filtros de visibilidad para contacts
- `server/routes/deals.js` - Filtros de visibilidad para deals
- `server/routes/tenants.js` - Restricción de creación de workspaces
- `server/routes/admin.js` - Panel de administración

### Frontend
- `app/more/index.tsx` - Selector de workspace y botón administrador
- `app/more/admin-users.tsx` - Panel de administración

---

**Versión:** 1.0  
**Fecha:** Noviembre 2025  
**Estado:** Especificación Final Oficial
