# 🚀 MIGRACIÓN A RENDER - GUÍA COMPLETA

## ✅ **POR QUÉ RENDER ES MEJOR**

- 🆓 **Gratis permanente** (750 horas/mes)
- 🐘 **PostgreSQL integrado** (más fácil de configurar)
- 📦 **Todo en un lugar** (no necesitas servicios separados)
- 🔒 **Datos persistentes** (nunca se borran)
- 🌐 **SSL automático** (HTTPS gratis)

---

## 📋 **PASOS PARA DEPLOAR EN RENDER**

### **1️⃣ Crear cuenta en Render**

1. Ve a: https://render.com
2. **Sign Up** con GitHub
3. Autoriza acceso a tu repositorio `crm-v1`

---

### **2️⃣ Crear Base de Datos PostgreSQL**

1. En dashboard de Render, click **"New +"**
2. Selecciona **"PostgreSQL"**
3. Configuración:
   - **Name:** `crm-database`
   - **Database:** `crm`
   - **User:** `crm_user`
   - **Region:** Elige el más cercano (US East, etc.)
   - **Plan:** **Free** (256MB RAM)
4. Click **"Create Database"**
5. **ESPERA 2-3 MINUTOS** a que termine de crear
6. **COPIA la "Internal Database URL"** (la necesitarás en el paso 3)

**Formato de la URL:**
```
postgresql://crm_user:PASSWORD@dpg-xxxxx-a/crm
```

---

### **3️⃣ Crear Web Service (Backend API)**

1. En dashboard, click **"New +"**
2. Selecciona **"Web Service"**
3. **Connect a repository:** Selecciona `jesusbloise/crm-v1`
4. Configuración básica:
   - **Name:** `crm-api`
   - **Region:** **Mismo que la base de datos**
   - **Branch:** `main`
   - **Root Directory:** `server` ← **IMPORTANTE**
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`

5. **Plan:** Selecciona **Free** (512MB RAM)

6. **Environment Variables** (agregar estas):

```bash
# Base de datos
DATABASE_URL=postgresql://crm_user:PASSWORD@dpg-xxxxx-a/crm
# ☝️ Usa la URL que copiaste en el paso 2

# Configuración general
NODE_ENV=production
PORT=8080

# Tenant
DEFAULT_TENANT=demo
MULTI_TENANT_ENABLED=false

# Auth
JWT_SECRET=tu-secret-super-seguro-aqui-cambialo
JWT_TTL=604800

# Invitaciones
INVITE_SECRET=otro-secret-diferente

# Google OAuth (si usas)
GOOGLE_CLIENT_ID=764177735712-3ik3he7p345ot6ro6ufitr4sls0cetl3.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-client-secret
GOOGLE_REDIRECT_URI=https://crm-api.onrender.com/integrations/google/callback

# Otros
ALLOW_SELF_JOIN=true
ALLOW_DEV_AUTH_BYPASS=false
AUTH_SKIP_MEMBERSHIP=false
```

7. Click **"Create Web Service"**

8. **ESPERA 5-10 MINUTOS** a que termine el primer deploy

---

### **4️⃣ Verificar que funcionó**

Una vez que el deploy termine (verás ✅ "Live"), prueba:

```bash
# Verificar salud del backend
curl https://crm-api.onrender.com/health
```

Debe devolver:
```json
{
  "status": "ok",
  "database": "PostgreSQL",
  "uptime": 123
}
```

---

### **5️⃣ Ejecutar Seed (Poblar base de datos)**

```bash
curl https://crm-api.onrender.com/seed/production
```

Debe devolver:
```json
{
  "success": true,
  "data": {
    "users": 4,
    "workspaces": 3,
    "memberships": 7
  }
}
```

---

### **6️⃣ Configurar Vercel para apuntar a Render**

1. Ve a Vercel → Tu proyecto → **Settings** → **Environment Variables**
2. Edita `EXPO_PUBLIC_API_URL`:
   - **Value:** `https://crm-api.onrender.com`
   - **Environments:** Production, Preview, Development
3. **Redeploy** en Vercel (Deployments → Redeploy)

---

### **7️⃣ Validar en Vercel**

1. Abre https://crm-v1-azure.vercel.app (modo incógnito)
2. Login: `jesusbloise@gmail.com` / `jesus123`
3. Ve a "Más"
4. **Deberías ver 3 workspaces:**
   - Demo
   - publicidad (jesus)
   - edicion (luis)

---

## 🎯 **VENTAJAS FINALES**

### **Mobile (Expo):**
- ✅ Funcionará idéntico
- ✅ Verá los mismos 3 workspaces
- ✅ Botones de eliminar funcionarán

### **Web (Vercel):**
- ✅ Funcionará idéntico
- ✅ Verá los mismos 3 workspaces
- ✅ Mismos datos que mobile

### **Backend (Render):**
- ✅ PostgreSQL persistente (datos nunca se borran)
- ✅ Gratis permanente (750 horas/mes)
- ✅ URL fija: `https://crm-api.onrender.com`

---

## 🧹 **LIMPIEZA DESPUÉS**

Una vez que funcione en Render:

1. **Eliminar Railway:**
   - Ve a Railway → Settings → Delete Project

2. **Eliminar archivos temporales del código:**
   ```bash
   git rm app/debug-api.tsx
   git rm server/routes/seed.js
   git rm server/routes/check.js
   # Editar app/more/index.tsx para quitar botón DEBUG
   git commit -m "chore: remove debug tools"
   git push origin main
   ```

---

## ⚠️ **IMPORTANTE: Render Free Plan**

- **Servidor duerme después de 15 minutos sin uso**
- Primera request después de dormir tarda **30-50 segundos** en responder
- Requests siguientes son normales

**Solución:** Usar un "ping service" gratuito para mantenerlo despierto:
- https://uptimerobot.com (gratis, 50 monitores)
- Configura ping cada 14 minutos a tu API

---

## 📞 **TROUBLESHOOTING**

### **Si el deploy falla en Render:**
1. Revisa logs: Dashboard → Service → Logs
2. Verifica que `Root Directory` sea `server`
3. Confirma que `DATABASE_URL` esté bien copiada

### **Si Vercel no conecta:**
1. Verifica que `EXPO_PUBLIC_API_URL` apunte a Render
2. Asegúrate de haber hecho redeploy en Vercel
3. Prueba en modo incógnito

### **Si mobile no conecta:**
1. Verifica `.env.production` local:
   ```
   EXPO_PUBLIC_API_URL=https://crm-api.onrender.com
   ```
2. Rebuild de la app mobile

---

## 🎉 **RESULTADO FINAL**

```
Mobile App → Render Backend → PostgreSQL ✅
                ↑
Web App (Vercel) ──────────────┘

Todos ven los mismos datos
Todos funcionan igual
Gratis permanente
```

---

**¿Listo para migrar a Render?** 🚀
