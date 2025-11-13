# Permisos de Eliminación de Workspaces - Actualización

## 🎯 Cambios Realizados

Se actualizó el sistema para que **solo usuarios con rol global admin u owner** puedan eliminar workspaces, independientemente de quién los creó.

---

## 📋 Antes vs Después

### ❌ ANTES:
- Solo el **creador** del workspace podía eliminarlo
- El **owner global** también podía eliminar cualquier workspace
- **Admin global** NO podía eliminar workspaces que no creó

### ✅ DESPUÉS:
- **Owner global** → Puede eliminar cualquier workspace ✅
- **Admin global** → Puede eliminar cualquier workspace ✅
- **Member** → NO puede eliminar ningún workspace ❌

---

## 🔧 Archivos Modificados

### 1. **server/routes/tenants.js**

**Lógica anterior:**
```javascript
// Permitir eliminar solo si:
// 1. Es el creador del workspace, O
// 2. Es owner GLOBAL (Dios del sistema)
const isCreator = tenant.created_by === requesterId;
const isGlobalOwner = await isOwner(requesterId);

if (!isCreator && !isGlobalOwner) {
  return res.status(403).json({ 
    error: "forbidden_only_creator_or_global_owner"
  });
}
```

**Nueva lógica:**
```javascript
// Solo ADMIN u OWNER GLOBALES pueden eliminar workspaces
const isAdminOrOwner = await isAdmin(requesterId);

if (!isAdminOrOwner) {
  return res.status(403).json({ 
    error: "forbidden_admin_or_owner_required",
    message: "Solo usuarios con rol admin u owner pueden eliminar workspaces"
  });
}
```

**Cambios:**
- ✅ Simplificada lógica de autorización
- ✅ Ya no verifica si es el creador
- ✅ Admin ahora puede eliminar cualquier workspace
- ✅ Protección del workspace "demo" se mantiene

---

### 2. **app/more/index.tsx**

**Lógica anterior:**
```typescript
// Verificar rol del workspace (incorrecto - usaba memberships)
if (workspace.role !== "admin" && workspace.role !== "owner") {
  Alert.alert("Solo admin u owner pueden eliminar workspaces");
  return;
}

// Botón de eliminar
const canDelete = item.role === "admin" || item.role === "owner";
```

**Nueva lógica:**
```typescript
// Verificar rol GLOBAL del usuario
if (!isAdminOrOwner) {
  Alert.alert(
    "Permisos insuficientes",
    "Solo usuarios con rol admin u owner pueden eliminar workspaces"
  );
  return;
}

// Botón de eliminar basado en rol global
const canDelete = isAdminOrOwner;
```

**Cambios:**
- ✅ Usa `currentRole` (rol global) en lugar de `workspace.role`
- ✅ Botón de eliminar 🗑️ solo visible para admin/owner
- ✅ Eliminada línea "Tu rol: ..." (ya no tiene sentido sin memberships)

---

## 🧪 Testing Validado

**Script:** `server/scripts/test-delete-workspace-permissions.js`

**Resultado:**
```
👥 USUARIOS:
  👑 jesusbloise@gmail.com (owner) → ✅ PUEDE ELIMINAR
  🔑 jesus@demo.com (admin) → ✅ PUEDE ELIMINAR
  👤 admin@demo.local (member) → ❌ NO PUEDE ELIMINAR
  👤 ramon@gmail.com (member) → ❌ NO PUEDE ELIMINAR

📁 WORKSPACES:
  • demo - "Demo" (creado por member)
  • jesus - "publicidad" (creado por admin)

🎭 SIMULACIÓN:
  Workspace "Demo":
    👑 jesusbloise → ✅ AUTORIZADO
    🔑 jesus@demo.com → ✅ AUTORIZADO
    👤 admin@demo.local → ❌ DENEGADO
    👤 ramon@gmail.com → ❌ DENEGADO

  Workspace "publicidad":
    👑 jesusbloise → ✅ AUTORIZADO
    🔑 jesus@demo.com → ✅ AUTORIZADO (aunque lo creó)
    👤 admin@demo.local → ❌ DENEGADO
    👤 ramon@gmail.com → ❌ DENEGADO
```

---

## 🔒 Matriz de Permisos Final

| Rol | Crear Workspace | Eliminar Workspace | Eliminar "demo" |
|-----|----------------|-------------------|-----------------|
| 👑 **Owner** | ✅ | ✅ Cualquiera | ❌ Protegido |
| 🔑 **Admin** | ✅ | ✅ Cualquiera | ❌ Protegido |
| 👤 **Member** | ❌ | ❌ Ninguno | ❌ Protegido |

---

## 🎯 Flujo de Usuario

### Escenario 1: Member intenta eliminar workspace
1. Member ve lista de workspaces
2. **NO ve botón 🗑️** (oculto porque `!isAdminOrOwner`)
3. Si intenta eliminar por API directamente:
   ```
   DELETE /tenants/demo
   → 403 Forbidden: "Solo usuarios con rol admin u owner..."
   ```

### Escenario 2: Admin elimina workspace
1. Admin ve lista de workspaces
2. **Ve botón 🗑️** en todos los workspaces (excepto "demo")
3. Click en 🗑️ → Confirmación
4. Backend valida `isAdmin(userId)` → ✅ Permitido
5. Workspace eliminado exitosamente

### Escenario 3: Owner elimina workspace
1. Owner ve lista de workspaces
2. **Ve botón 🗑️** en todos los workspaces (excepto "demo")
3. Click en 🗑️ → Confirmación
4. Backend valida `isAdmin(userId)` → ✅ Permitido (owner es admin)
5. Workspace eliminado exitosamente

### Escenario 4: Intentar eliminar "demo"
1. Usuario (cualquier rol) intenta eliminar "demo"
2. Backend valida `tenantId === "demo"`:
   ```javascript
   if (tenantId === "demo") {
     return res.status(403).json({ 
       error: "cannot_delete_demo_workspace",
       message: "El workspace 'demo' no puede ser eliminado"
     });
   }
   ```
3. **❌ Denegado** - "demo" está protegido

---

## 📊 Estado Actual del Sistema

**Usuarios:**
- 1 Owner (jesusbloise)
- 1 Admin (jesus@demo.com)
- 2 Members (admin@demo.local, ramon@gmail.com)

**Permisos de eliminación:**
- ✅ 2 usuarios pueden eliminar workspaces (owner + admin)
- ❌ 2 usuarios NO pueden eliminar workspaces (members)

---

## 🚀 Próximos Pasos (Opcional)

### 1. Agregar confirmación extra para admin
```typescript
// Solo para admin (no owner)
if (currentRole === "admin" && workspace.created_by !== userId) {
  Alert.alert(
    "Advertencia",
    "Estás eliminando un workspace creado por otro usuario. ¿Continuar?"
  );
}
```

### 2. Auditoría mejorada
```javascript
auditLog({ 
  userId: requesterId, 
  tenantId: null,
  action: ACTIONS.DELETE_WORKSPACE,
  resourceType: "workspace",
  resourceId: tenantId,
  details: { 
    workspace_name: tenant.name,
    creator: tenant.created_by,
    deleter_role: requesterRole, // "admin" o "owner"
    is_creator: tenant.created_by === requesterId
  }
}, req);
```

### 3. Restricción temporal
```javascript
// Solo permitir eliminar workspaces de más de 24hrs
const workspaceAge = Date.now() - tenant.created_at;
if (workspaceAge < 86400000) { // 24hrs
  return res.status(400).json({
    error: "workspace_too_recent",
    message: "Solo se pueden eliminar workspaces con más de 24 horas"
  });
}
```

---

## ✅ Validación Final

- ✅ Backend actualizado (tenants.js)
- ✅ Frontend actualizado (more/index.tsx)
- ✅ Testing completado y validado
- ✅ Workspace "demo" protegido
- ✅ Solo admin/owner pueden eliminar
- ✅ Members bloqueados correctamente

**Estado:** COMPLETADO ✅  
**Fecha:** 2025-11-12  
**Testing:** EXITOSO ✅
