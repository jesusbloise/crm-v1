# 🐘 MIGRACIÓN A POSTGRESQL EN RAILWAY

## ❌ PROBLEMA IDENTIFICADO

La base de datos SQLite en Railway es **EFÍMERA** - se borra con cada deploy.

**Evidencia del Debug:**
- Base URL correcta: ✅ `https://crm-v1-production.up.railway.app`
- Token válido: ✅
- Usuario autenticado: ✅ `admin@demo.local`
- Workspaces devueltos: ❌ **SOLO 1** (Demo)

El seed se ejecutó correctamente pero los datos se perdieron en el siguiente deploy.

---

## ✅ SOLUCIÓN: PostgreSQL Persistente

Railway ofrece PostgreSQL **GRATIS** y **PERSISTENTE**. Ya actualicé todo el código para soportar ambas bases de datos:

**Cambios realizados:**
- ✅ `server/db/connection.js` - Adaptador universal SQLite/PostgreSQL
- ✅ `server/db/migrate-pg.js` - Migraciones para Postgres
- ✅ `server/scripts/seedProduction.js` - Seed universal
- ✅ `server/index.js` - Auto-detecta DB y ejecuta migraciones
- ✅ `package.json` - Agregado `pg` como dependencia

---

## 📋 PASOS PARA CONFIGURAR EN RAILWAY

### 1️⃣ Crear Servicio de PostgreSQL

1. Ve a tu proyecto en Railway: https://railway.app/project/crm-v1
2. Click en **"+ New"** → **"Database"** → **"Add PostgreSQL"**
3. Railway creará automáticamente la base de datos
4. Espera 30 segundos a que termine de provisionar

### 2️⃣ Conectar PostgreSQL al Servicio de API

1. Ve al servicio de tu **API** (crm-v1-production)
2. Click en **"Variables"**
3. Click en **"+ New Variable"** → **"Add Reference"**
4. Selecciona el servicio PostgreSQL que creaste
5. Variable: `DATABASE_URL`
6. Reference: `DATABASE_URL` (del servicio Postgres)
7. Click **"Add"**

### 3️⃣ Redeploy Automático

Railway hará redeploy automáticamente al detectar la nueva variable.

**Monitorea los logs:**
```
🐘 Detectado PostgreSQL, ejecutando migraciones...
🐘 Ejecutando migraciones de PostgreSQL...
✅ Migraciones completadas
🚀 API running on http://0.0.0.0:4000 (env: production)
```

### 4️⃣ Ejecutar Seed (UNA SOLA VEZ)

Opción A - **Vía endpoint temporal** (más fácil):
```bash
curl https://crm-v1-production.up.railway.app/seed/production
```

Opción B - **Vía Railway CLI**:
```bash
railway run node server/scripts/seedProduction.js
```

**Deberías ver:**
```
🌱 Iniciando seed de PostgreSQL (Railway)...
👤 Creando usuarios...
  ✅ Usuario: jesusbloise@gmail.com
  ✅ Usuario: luisa@gmail.com
  ✅ Usuario: carolina@gmail.com
📁 Creando workspaces...
  ✅ Workspace: Demo (demo)
  ✅ Workspace: publicidad (jesus)
  ✅ Workspace: edicion (luis)
🔗 Creando memberships...
  ✅ jesusbloise@gmail.com → demo (owner)
  ✅ jesusbloise@gmail.com → jesus (owner)
  ✅ jesusbloise@gmail.com → luis (owner)
  ✅ luisa@gmail.com → demo (member)
  ✅ luisa@gmail.com → luis (member)
  ✅ carolina@gmail.com → demo (member)
📊 Verificando datos...
Total usuarios: 3
Total workspaces: 3
Total memberships: 6
✅ Seed completado exitosamente!
```

### 5️⃣ Validar en Vercel

1. Abre https://crm-v1-azure.vercel.app en modo incógnito
2. Login: `jesusbloise@gmail.com` / `jesus123`
3. Ve a "Más"
4. Presiona **🔍 DEBUG API** (botón rojo)
5. Verifica que `/me/tenants` muestre **3 workspaces**

**Respuesta esperada:**
```json
{
  "items": [
    { "id": "demo", "name": "Demo", "role": "owner" },
    { "id": "jesus", "name": "publicidad", "role": "owner" },
    { "id": "luis", "name": "edicion", "role": "owner" }
  ]
}
```

---

## 🎯 VENTAJAS DE POSTGRESQL

✅ **Persistente** - Los datos NO se borran entre deploys
✅ **Gratis** - Railway incluye 500MB de Postgres gratis
✅ **Escalable** - Soporta millones de registros
✅ **Backups automáticos** - Railway hace snapshots diarios
✅ **Production-ready** - Estándar de industria

---

## 🔄 VOLVER A LOCAL (Desarrollo)

Todo sigue funcionando igual:

```bash
# Local usa SQLite automáticamente (sin DATABASE_URL)
cd server
npm run dev
```

El código detecta automáticamente qué base de datos usar.

---

## 🧹 LIMPIAR DESPUÉS

Una vez confirmado que funciona, eliminar:
- ✅ Endpoint temporal `/seed/production` en `server/routes/seed.js`
- ✅ Página de debug `app/debug-api.tsx`
- ✅ Botón DEBUG en `app/more/index.tsx`

---

## 📞 SOPORTE

Si algo falla, revisa los logs de Railway:
```bash
railway logs --service crm-v1-production
```

O mándame screenshot de:
1. Variables de entorno en Railway (Settings → Variables)
2. Logs del deploy
3. Respuesta del endpoint `/seed/production`
