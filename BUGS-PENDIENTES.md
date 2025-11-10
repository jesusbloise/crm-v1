# 🐛 BUGS ENCONTRADOS Y PENDIENTES

**Fecha:** 10 de Noviembre, 2025  
**Estado:** 2 bugs críticos identificados durante testing  

---

## 🔴 BUG #1: Members pueden crear workspaces

### **Descripción:**
A pesar de tener el middleware `requireRoleInAny(['admin', 'owner'])` en POST /tenants, los usuarios con rol `'member'` pueden crear workspaces.

### **Evidencia:**
```
Test: 2. Member intenta crear workspace → debe fallar (403)
❌ ✗ Member pudo crear workspace (VULNERABILIDAD)
❌ Workspace creado: test_workspace_1762781576841
```

### **Código relevante:**
```javascript
// server/routes/tenants.js
r.post("/tenants", requireRoleInAny(["admin", "owner"]), (req, res) => {
  // ...
});
```

### **Posibles causas:**
1. El middleware `requireRoleInAny` no está funcionando correctamente
2. El usuario registrado en el test podría tener rol 'admin' en vez de 'member' en algún workspace
3. El middleware no está siendo ejecutado antes del handler

### **Para investigar:**
- Agregar `console.log` en `requireRoleInAny` para ver si se ejecuta
- Verificar que el usuario solo tiene rol 'member' en workspace 'demo'
- Verificar que no hay bypass de autenticación activo

---

## 🔴 BUG #2: created_by siempre es 'demo-admin'

### **Descripción:**
Cuando un usuario registrado crea un lead, el campo `created_by` se setea como `'demo-admin'` en vez del UUID del usuario real.

### **Evidencia:**
```
Test: 3. Member solo ve sus propios datos
❌ Lead lead_member_1762781576849 pertenece a demo-admin

Base de datos:
┌─────────┬─────────────────────────────┬─────────────────┬──────────────┬───────────┐
│ (index) │ id                          │ name            │ created_by   │ tenant_id │
├─────────┼─────────────────────────────┼─────────────────┼──────────────┼───────────┤
│ 0       │ 'lead_member_1762781576849' │ 'Lead de Member'│ 'demo-admin' │ 'demo'    │
└─────────┴─────────────────────────────┴─────────────────┴──────────────┴───────────┘

Pero el usuario registrado tiene ID:
'f9e7d3ef-5b4c-4a72-9f7a-...' (UUID)
```

### **Código relevante:**
```javascript
// server/routes/leads.js (línea ~90)
const userId = resolveUserId(req);
db.prepare(`INSERT INTO leads (..., created_by, ...) VALUES (..., ?, ...)`)
  .run(..., userId, ...);

// server/lib/authorize.js
function resolveUserId(req) {
  return req.user?.id || req.auth?.sub;
}

// server/lib/requireAuth.js
const uid = normalizeUserId(payload?.sub ?? payload?.id);
req.user = { id: uid, email, roles };
req.auth = { ...payload, sub: uid, ... };
```

### **Posibles causas:**
1. El JWT del usuario registrado tiene `sub: "demo-admin"` en vez del UUID
2. La función `normalizeUserId()` está convirtiendo UUIDs a "demo-admin" incorrectamente
3. El token que envía el test no es el que retornó /auth/register
4. Existe un usuario con ID "demo-admin" que interfiere con el sistema

### **Para investigar:**
- Decodificar el JWT retornado por /auth/register y verificar el `sub`
- Agregar logging en `normalizeUserId()` para ver qué está recibiendo y retornando
- Agregar logging en `resolveUserId()` para ver qué está retornando
- Verificar si existe usuario con id='demo-admin' en la base de datos
- Eliminar usuario 'demo-admin' si existe y no debería

---

## ⚠️ BUG #3: jesusbloise@gmail.com no puede hacer login

### **Descripción:**
El test intenta hacer login con jesusbloise@gmail.com pero falla con 401.

### **Evidencia:**
```
Test: 4. Admin/Owner ve todos los datos del workspace
⚠️  No se pudo hacer login como owner: 401

Audit logs:
login_failed - User: 02bfdb38 (jesusbloise@gmail.com)
```

### **Posibles causas:**
1. La contraseña en el test es incorrecta
2. El usuario jesusbloise no existe en la DB después del cleanup
3. El usuario está desactivado (active = 0)
4. El password_hash está corrupto

### **Para investigar:**
```sql
SELECT id, email, active, password_hash FROM users WHERE email = 'jesusbloise@gmail.com';
```

---

## 🔧 PLAN DE CORRECCIÓN

### **Paso 1: Verificar base de datos**
```bash
cd server
node -e "const db=require('./db/connection'); \
  console.log('Users:'); \
  console.table(db.prepare('SELECT id, email, active FROM users').all()); \
  console.log('\nMemberships:'); \
  console.table(db.prepare('SELECT user_id, tenant_id, role FROM memberships').all());"
```

### **Paso 2: Agregar logging temporal**
```javascript
// En server/lib/authorize.js - requireRoleInAny
function requireRoleInAny(allowedRoles = []) {
  return (req, res, next) => {
    const userId = resolveUserId(req);
    console.log('🔍 requireRoleInAny:', { userId, allowedRoles });
    
    const hasRole = db.prepare(...)...
    console.log('🔍 hasRole result:', hasRole);
    
    if (!hasRole) {
      console.log('❌ User does not have required role');
      return res.status(403).json({...});
    }
    
    console.log('✅ User has required role, allowing access');
    next();
  };
}
```

### **Paso 3: Agregar logging en resolveUserId**
```javascript
// En server/lib/authorize.js
function resolveUserId(req) {
  const id = req.user?.id || req.auth?.sub;
  console.log('🔍 resolveUserId:', { 
    'req.user.id': req.user?.id, 
    'req.auth.sub': req.auth?.sub,
    'resultado': id 
  });
  return id;
}
```

### **Paso 4: Agregar logging en normalizeUserId**
```javascript
// En server/lib/requireAuth.js
function normalizeUserId(v) {
  console.log('🔍 normalizeUserId input:', v, 'type:', typeof v);
  
  if (v == null) {
    console.log('  → null/undefined, usando fallback');
    return FALLBACK_USER_ID;
  }
  
  if (typeof v === "number" && Number.isFinite(v)) {
    console.log('  → number, usando fallback');
    return FALLBACK_USER_ID;
  }
  
  const s = String(v).trim();
  
  if (!s) {
    console.log('  → empty string, usando fallback');
    return FALLBACK_USER_ID;
  }
  
  if (/^[0-9]+(\.0+)?$/.test(s)) {
    console.log('  → numeric string, usando fallback');
    return FALLBACK_USER_ID;
  }
  
  console.log('  → valid string, usando tal cual:', s);
  return s;
}
```

### **Paso 5: Limpiar base de datos**
```bash
cd server
node -e "const db=require('./db/connection'); \
  db.prepare('DELETE FROM users WHERE id = ?').run('demo-admin'); \
  console.log('✅ Usuario demo-admin eliminado');"
```

### **Paso 6: Re-ejecutar tests**
```bash
node scripts/test-role-system.js 2>&1 | tee test-output.log
```

### **Paso 7: Analizar logs**
- Buscar líneas con 🔍 para ver el flujo de resolución de userId
- Verificar que normalizeUserId recibe UUIDs y los retorna tal cual
- Verificar que requireRoleInAny se ejecuta y valida correctamente

---

## 📝 NOTAS ADICIONALES

### **Estado actual del sistema:**
- ✅ Audit logging funcionando
- ✅ requireRole funcionando en endpoints admin
- ✅ Registro de usuarios como 'member' funcionando
- ❌ requireRoleInAny no bloquea members de crear workspaces
- ❌ created_by siempre es 'demo-admin' en vez del user_id real
- ❌ jesusbloise no puede hacer login

### **Teoría actual:**
El problema parece ser que existe un usuario con `id='demo-admin'` que:
1. Es usado como fallback en varios lugares
2. Interfiere con el sistema de roles
3. Hace que todos los created_by apunten a él

**Solución propuesta:**
1. Eliminar usuario 'demo-admin' de la base de datos
2. Asegurar que FALLBACK_USER_ID solo se usa cuando BYPASS está activo
3. Actualizar tests para usar usuario real del cleanup (jesusbloise)

### **Prioridad:**
🔴 **ALTA** - Estos bugs bloquean la seguridad del sistema. Members NO deben poder crear workspaces.

---

## 🎯 PRÓXIMOS PASOS

1. **Servidor corriendo con logging:** Iniciar servidor en modo dev con logs activos
2. **Ejecutar tests paso a paso:** Correr cada test individualmente y observar logs
3. **Verificar JWT:** Decodificar JWTs retornados para verificar claims
4. **Limpiar DB:** Eliminar usuario 'demo-admin' si no es necesario
5. **Actualizar password:** Resetear password de jesusbloise a conocido
6. **Re-test completo:** Ejecutar suite completa y validar 6/6 tests pasan

---

**Generado:** 10 de Noviembre, 2025  
**Estado:** Bugs documentados, solución en progreso  
**Siguiente:** Debugging con servidor activo y logging habilitado
