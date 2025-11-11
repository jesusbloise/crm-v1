# 🔧 VERIFICACIÓN POST-DEPLOY

## ✅ **Código subido exitosamente**

Commits recientes:
- `e519309` - Fix de app.js (eliminadas migraciones duplicadas)
- `66575c5` - Sistema completo de PostgreSQL

## 📋 **CHECKLIST PARA RAILWAY**

### 1️⃣ **Esperar el Redeploy (2-3 minutos)**

Railway detectará el push y hará redeploy automático.

### 2️⃣ **Revisar Logs de Railway**

Busca estos mensajes en los logs:

✅ **CORRECTO:**
```
🐘 Detectado PostgreSQL, ejecutando migraciones...
🐘 Ejecutando migraciones de PostgreSQL...
✅ Migraciones completadas
🚀 API running on http://0.0.0.0:4000 (env: production)
```

❌ **INCORRECTO (si ves esto, avísame):**
```
❌ Error en migraciones: ...
```

### 3️⃣ **Ejecutar Seed**

Una vez que los logs muestren que el servidor está corriendo:

```bash
curl https://crm-v1-production.up.railway.app/seed/production
```

**Respuesta esperada:**
```json
{
  "success": true,
  "data": {
    "users": 3,
    "workspaces": 3,
    "memberships": 6
  }
}
```

### 4️⃣ **Validar en Vercel**

1. Abre https://crm-v1-azure.vercel.app (modo incógnito)
2. Login: `jesusbloise@gmail.com` / `jesus123`
3. Ve a "Más"
4. Presiona **🔍 DEBUG API**
5. Busca la sección **📊 /me/tenants Response**

**Deberías ver:**
```json
{
  "status": 200,
  "data": {
    "items": [
      { "id": "demo", "name": "Demo", "role": "owner" },
      { "id": "jesus", "name": "publicidad", "role": "owner" },
      { "id": "luis", "name": "edicion", "role": "owner" }
    ],
    "active_tenant": "demo"
  }
}
```

### 5️⃣ **Probar Eliminar Workspace**

1. Sal del debug
2. En la pantalla "Más", busca el workspace "luis" (edicion)
3. Presiona el botón **❌ rojo**
4. Confirma la eliminación
5. El workspace debería desaparecer INMEDIATAMENTE

---

## 🚨 **SI ALGO FALLA**

**Opción A - Ver logs en Railway:**
```bash
railway logs --service crm-v1-production
```

**Opción B - Verifica variables de entorno:**
1. Railway → Tu proyecto → API service
2. Settings → Variables
3. Confirma que existe: `DATABASE_URL` (debe apuntar al Postgres)

**Opción C - Si el seed falla:**
Mándame screenshot de:
- El error del `curl`
- Los logs de Railway
- Las variables de entorno (oculta la contraseña del DATABASE_URL)

---

## 🎉 **CUANDO FUNCIONE**

Una vez que veas los 3 workspaces y puedas eliminarlos:

1. **Eliminar archivos de debug:**
   - `app/debug-api.tsx`
   - Botón DEBUG en `app/more/index.tsx`
   - `server/routes/seed.js`

2. **Commit de limpieza:**
```bash
git rm app/debug-api.tsx server/routes/seed.js
# Editar app/more/index.tsx para quitar el botón
git add app/more/index.tsx
git commit -m "chore: remove debug tools and temporary seed endpoint"
git push origin main
```

---

**¿Listo para verificar los logs de Railway?** 🚀
