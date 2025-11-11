# 🚀 DEPLOY TODO EN UNO EN RENDER (Frontend + Backend)

## 📋 Configuración en Render Dashboard

### 1. Build Command (reemplaza el actual)
```bash
npm install && npm run build:web && cd server && npm install
```

### 2. Start Command (mantén el actual)
```bash
node index.js
```

### 3. Root Directory
```
(dejar vacío o poner: .)
```

## 🔧 Variables de Entorno en Render

Asegúrate de tener estas variables configuradas:

### Backend (ya configuradas):
- `DATABASE_URL` - Tu PostgreSQL de Render
- `JWT_SECRET` - Tu secreto JWT
- `NODE_ENV` - production

### Frontend (agregar estas):
- `EXPO_PUBLIC_API_URL` = `https://crm-v1-iilx.onrender.com`
- `EXPO_PUBLIC_HTTP_TIMEOUT_MS` = `25000`
- `MULTI_TENANT_ENABLED` = `false`
- `DEFAULT_TENANT` = `demo`
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID` = `764177735712-3ik3he7p345ot6ro6ufitr4sls0cetl3.apps.googleusercontent.com`

## 📦 Qué hace el Build:

1. `npm install` - Instala dependencias del frontend
2. `npm run build:web` - Compila Expo para web → genera carpeta `dist/`
3. `cd server && npm install` - Instala dependencias del backend

## 🚀 Qué hace el Start:

1. `node index.js` - Levanta Express que:
   - Sirve la API en `/api`, `/auth`, `/me`, etc.
   - Sirve el frontend desde `dist/` para todas las demás rutas

## ✅ Resultado:

**Una sola URL para TODO:**
```
https://crm-v1-iilx.onrender.com
```

- `/` → Frontend (React/Expo)
- `/api/*` → Backend API
- `/auth/*` → Auth API
- `/me/*` → User API
- etc.

## 🔄 Para Redeploy:

1. Haz push a GitHub (main branch)
2. Render detecta y hace redeploy automático
3. Espera ~3-5 minutos (build de frontend + backend)
4. ✅ Listo!

---

## 🆚 Comparación:

### Antes (Vercel + Render):
- Frontend: `https://crm-v1-azure.vercel.app`
- Backend: `https://crm-v1-iilx.onrender.com`
- 2 servicios, 2 deploys, CORS, caché, etc.

### Ahora (Solo Render):
- Todo: `https://crm-v1-iilx.onrender.com`
- 1 servicio, 1 deploy, sin CORS, sin caché
- ✅ MÁS SIMPLE

