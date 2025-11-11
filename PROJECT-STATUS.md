# 🧹 PROYECTO LIMPIO - ESTADO ACTUAL

**Fecha de limpieza:** 11 de Noviembre, 2025  
**Commits de limpieza:**
- `94c5681` - Eliminación de configs de deployment y código PostgreSQL
- `049d17b` - Eliminación de archivos .env restantes y docs de análisis

---

## ✅ LO QUE FUNCIONA EN LOCAL

### Backend (server/)
- ✅ **SQLite puro** - Sin dependencias de PostgreSQL, Railway, Render, o Vercel
- ✅ **Servidor corriendo en puerto 4000**
- ✅ **Migraciones automáticas** al iniciar el servidor
- ✅ **Multi-tenancy completo** - Workspaces con memberships y roles
- ✅ **Autenticación:**
  - Usuario demo: `admin@demo.local` / `demo` (sin DB)
  - Registro de usuarios reales con bcrypt
  - JWT tokens con roles (user, admin, owner)
- ✅ **API REST completa:**
  - `/auth/*` - Login, registro, me
  - `/leads/*` - CRUD de leads
  - `/contacts/*` - CRUD de contactos
  - `/accounts/*` - CRUD de cuentas
  - `/deals/*` - CRUD de deals/oportunidades
  - `/activities/*` - Tareas y actividades
  - `/notes/*` - Notas
  - `/me/tenants` - Lista de workspaces del usuario
  - `/tenants/*` - CRUD de workspaces (solo admins/owners)

### Frontend (app/)
- ✅ **Expo para móvil** (Android/iOS)
- ✅ **Web via Expo Web**
- ✅ **Auto-login en desarrollo** (`EXPO_PUBLIC_AUTO_LOGIN=1`)
- ✅ **Configuración por plataforma:**
  - Web: `http://localhost:4000`
  - Android Emulator: `http://10.0.2.2:4000`
  - Android/iOS físico: `http://TU_IP_LOCAL:4000`

### Configuración
- ✅ **2 archivos .env únicamente:**
  - `.env` (raíz) - Para Expo y frontend
  - `server/.env` - Para backend y API
- ✅ **.gitignore actualizado** - Ignora todos los .env, .db, y node_modules

---

## 🗑️ LO QUE SE ELIMINÓ

### Archivos de configuración de plataformas:
- ❌ `vercel.json` - Config de Vercel
- ❌ `.env.render` - Variables de Render
- ❌ `.env.production` - Variables de producción
- ❌ `.env.development` - Variables de desarrollo duplicadas
- ❌ `eas.json` - Build config de Expo (opcional, se puede regenerar)

### Documentos y reportes temporales:
- ❌ `CHECKLIST.md`
- ❌ `DEPLOYMENT.md`
- ❌ `DEPLOYMENT-STATUS.md`
- ❌ `SYNC-GUIDE.md`
- ❌ `GUIA-MOBILE-UPDATE.md`
- ❌ `CAMBIOS-REALIZADOS.md`
- ❌ `ANALISIS-COMPLETO-SISTEMA.md`
- ❌ `ANALISIS-FALLAS-ROLES.md`

### Scripts temporales de fixes:
- ❌ `server/scripts/resetPassword.js` - Reset de contraseña para Render
- ❌ `server/scripts/fixTimestampsPostgres.js` - Fix de timestamps para PostgreSQL
- ❌ `server/scripts/seedProduction.js` - Seed específico para producción
- ❌ `server/scripts/checkAdminAuth.js` - Verificación de admin
- ❌ `server/scripts/checkJesusRole.js` - Verificación de roles
- ❌ `server/scripts/checkTenants.js` - Verificación de tenants
- ❌ `server/scripts/fixWorkspaceCreators.js` - Fix de creators
- ❌ `server/scripts/seedDevAuth.js` - Seed de autenticación
- ❌ `server/scripts/updateAdminRoles.js` - Update de roles
- ❌ `server/scripts/updateJesusRole.js` - Update de role específico
- ❌ `server/scripts/backfillTenant.js` - Backfill de tenant

### Archivos de backend:
- ❌ `server/db/migrate-pg.js` - Migraciones de PostgreSQL
- ❌ `server/routes/seed.js` - Endpoints temporales de seed
- ❌ `server/routes/check.js` - Endpoints temporales de verificación

### Código limpiado:
- ❌ **server/db/connection.js** - Eliminada toda la lógica de PostgreSQL y adaptadores
- ❌ **server/index.js** - Eliminadas referencias a PostgreSQL y Railway
- ❌ **server/app.js** - Eliminadas rutas temporales y código comentado de frontend serving

### Base de datos removida de Git:
- ❌ `server/crm.db` - Base de datos SQLite (ahora en .gitignore)
- ❌ `server/crm.db-shm` - SQLite shared memory
- ❌ `server/crm.db-wal` - SQLite write-ahead log

---

## 📁 ESTRUCTURA ACTUAL DEL PROYECTO

```
crm-v1/
├── .env                          # ✅ Variables de Expo/Frontend
├── .gitignore                    # ✅ Actualizado con .env y .db
├── package.json                  # ✅ Dependencias de Expo
├── app.config.ts                 # ✅ Config de Expo
├── tsconfig.json                 # ✅ TypeScript config
│
├── app/                          # ✅ Frontend Expo
│   ├── _layout.tsx               # Layout principal
│   ├── index.tsx                 # Pantalla home
│   ├── auth/                     # Login y registro
│   ├── leads/                    # CRUD de leads
│   ├── contacts/                 # CRUD de contactos
│   ├── accounts/                 # CRUD de cuentas
│   ├── deals/                    # CRUD de deals
│   ├── tasks/                    # CRUD de actividades
│   └── more/                     # Configuración y workspaces
│
├── src/                          # ✅ Código compartido frontend
│   ├── api/                      # Clientes HTTP
│   ├── components/               # Componentes React
│   ├── config/                   # Config y baseUrl
│   └── ui/                       # Componentes de UI
│
└── server/                       # ✅ Backend Node.js + Express
    ├── .env                      # ✅ Variables de backend
    ├── package.json              # ✅ Dependencias del server
    ├── index.js                  # ✅ Entry point (ejecuta migraciones)
    ├── app.js                    # ✅ Express app (rutas)
    │
    ├── db/                       # Base de datos
    │   ├── connection.js         # ✅ LIMPIO - Solo SQLite
    │   ├── migrate.js            # ✅ Migraciones SQLite
    │   └── seed.js               # Seed básico de desarrollo
    │
    ├── lib/                      # Utilidades
    │   ├── jwt.js                # Firma y verificación JWT
    │   ├── requireAuth.js        # Middleware de autenticación
    │   ├── injectTenant.js       # Middleware de multi-tenancy
    │   └── ...
    │
    └── routes/                   # ✅ Rutas API
        ├── auth.js               # ✅ LIMPIO - Login y registro
        ├── health.js             # Health check
        ├── leads.js              # CRUD de leads
        ├── contacts.js           # CRUD de contactos
        ├── accounts.js           # CRUD de cuentas
        ├── deals.js              # CRUD de deals
        ├── activities.js         # CRUD de actividades
        ├── notes.js              # CRUD de notas
        ├── me.js                 # Info del usuario actual
        └── tenants.js            # CRUD de workspaces
```

---

## 🚀 CÓMO USAR EL PROYECTO

### 1. Desarrollo Local

**Backend:**
```bash
cd server
npm install
npm run dev
```
El servidor arrancará en `http://localhost:4000`

**Frontend (Expo):**
```bash
npm install
npx expo start
```

**Usuario demo (sin DB):**
- Email: `admin@demo.local`
- Password: `demo`

### 2. Crear Usuario Real

**Desde la app móvil:**
1. Ir a pantalla de registro
2. Llenar formulario
3. El usuario se crea como `member` en workspace `demo`

**Desde terminal:**
```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Tu Nombre","email":"tu@email.com","password":"tupassword"}'
```

### 3. Variables de Entorno

**`.env` (raíz del proyecto):**
```bash
# URL del backend para Expo
EXPO_PUBLIC_API_URL=http://192.168.TU.IP:4000

# Auto-login en desarrollo (opcional)
EXPO_PUBLIC_AUTO_LOGIN=1

# Google OAuth (opcional)
EXPO_PUBLIC_GOOGLE_CLIENT_ID=tu-client-id
```

**`server/.env`:**
```bash
# Puerto del servidor
PORT=4000

# JWT Secret (cambiar en producción)
JWT_SECRET=pon-un-secreto-bien-largo

# Tenant por defecto
DEFAULT_TENANT=demo

# Flags opcionales
AUTH_SKIP_MEMBERSHIP=1
ALLOW_SELF_JOIN=1

# Google OAuth (opcional)
GOOGLE_CLIENT_ID=tu-client-id
GOOGLE_REDIRECT_URI=https://auth.expo.io/@tu-usuario/crm-v1
```

---

## 📝 NOTAS IMPORTANTES

1. **Base de datos local:** `server/crm.db` se crea automáticamente al iniciar el servidor por primera vez
2. **Migraciones:** Se ejecutan automáticamente en `server/index.js` antes de levantar el servidor
3. **Multi-tenancy:** Sistema completo de workspaces, pero con lógica simplificada para un solo workspace por defecto
4. **Roles:** 
   - `member` - Puede ver y crear registros
   - `admin` - Puede editar y eliminar
   - `owner` - Puede gestionar usuarios y workspace
5. **Sin dependencias de cloud:** Todo el código está limpio de referencias a Vercel, Render, Railway, PostgreSQL

---

## 🎯 PRÓXIMOS PASOS PARA DEPLOYMENT

Cuando decidas hacer deploy, considera:

1. **Opción A: Render (Recomendada para gratis)**
   - Backend + PostgreSQL incluido
   - Configurar `DATABASE_URL` en variables de entorno
   - Agregar lógica de PostgreSQL solo si es necesario

2. **Opción B: Railway**
   - Backend + PostgreSQL
   - Similar a Render

3. **Opción C: Vercel Serverless Functions**
   - Requiere adaptar Express a funciones serverless
   - Necesita base de datos externa (PlanetScale, Supabase, etc.)

4. **Frontend:**
   - Expo Web en Vercel/Netlify
   - O build de producción en cualquier hosting estático

**IMPORTANTE:** Antes de hacer deploy, asegúrate de:
- Cambiar `JWT_SECRET` a un valor seguro
- Configurar `EXPO_PUBLIC_API_URL` a tu URL de producción
- Revisar que `.env` no esté en Git (ya está en .gitignore)

---

## 🧪 TESTING LOCAL

Para verificar que todo funciona:

1. **Health check:**
```bash
curl http://localhost:4000/health
# Respuesta: {"ok":true}
```

2. **Login demo:**
```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.local","password":"demo"}'
# Respuesta: {"token":"...", "active_tenant":"demo"}
```

3. **Listar workspaces:**
```bash
curl http://localhost:4000/me/tenants \
  -H "Authorization: Bearer TU_TOKEN"
```

---

**Estado:** ✅ Proyecto limpio y listo para desarrollo local o nuevo deployment desde cero
