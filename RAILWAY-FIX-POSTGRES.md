# 🐘 CREAR Y CONECTAR POSTGRESQL EN RAILWAY

## ❌ **Problema Actual**
```
Error: getaddrinfo ENOTFOUND postgres.railway.internal
```

Esto significa que Railway está intentando conectarse a PostgreSQL pero **no existe** o **no está conectado**.

---

## ✅ **SOLUCIÓN PASO A PASO**

### **OPCIÓN A: Si NO has creado PostgreSQL aún**

#### 1. Crear el servicio de PostgreSQL

1. Ve a Railway: https://railway.app
2. Abre tu proyecto (crm-v1)
3. Click en **"+ New"**
4. Selecciona **"Database"**
5. Click en **"Add PostgreSQL"**
6. Espera 30 segundos a que se provisione

#### 2. Conectar PostgreSQL a tu API

Ahora necesitas **conectar** el Postgres al servicio de tu API:

1. Ve al servicio de tu **API** (crm-v1-production)
2. Click en la pestaña **"Variables"**
3. Busca si ya existe `DATABASE_URL` (probablemente esté mal configurada)
4. **Si existe:** Click en los 3 puntos (...) → **"Remove"**
5. Click en **"+ New Variable"**
6. Click en **"Add Reference"** (NO "Add Variable")
7. En el modal:
   - **Variable Name:** `DATABASE_URL`
   - **Service:** Selecciona el servicio PostgreSQL que acabas de crear
   - **Variable to Reference:** `DATABASE_URL` (del Postgres)
8. Click **"Add"**

Railway hará redeploy automáticamente.

---

### **OPCIÓN B: Si YA creaste PostgreSQL pero no está conectado**

#### 1. Verificar servicios

1. En tu proyecto de Railway deberías ver:
   - 📦 Servicio 1: `crm-v1-production` (API)
   - 🐘 Servicio 2: `Postgres` (DB)

#### 2. Conectar la variable

1. Click en tu servicio de **API** (crm-v1-production)
2. Ve a **"Variables"**
3. Busca `DATABASE_URL`
4. **Si NO existe:**
   - Click **"+ New Variable"** → **"Add Reference"**
   - Selecciona el Postgres
   - Variable: `DATABASE_URL` → `DATABASE_URL`
5. **Si existe pero tiene formato interno (`postgres.railway.internal`):**
   - Bórrala y créala nuevamente como "Reference" (no como texto)

---

### **OPCIÓN C: Si ya está todo conectado pero sigue fallando**

#### 1. Obtén la URL pública del Postgres

1. Click en el servicio **PostgreSQL**
2. Ve a **"Variables"**
3. Copia el valor de `DATABASE_URL` (debe empezar con `postgresql://...railway.app`)

#### 2. Úsala directamente en la API

1. Ve al servicio de **API**
2. **"Variables"**
3. Edita `DATABASE_URL` y pega la URL completa

**Formato correcto:**
```
postgresql://postgres:PASSWORD@autorack.proxy.rlwy.net:12345/railway
```

❌ **Formato INCORRECTO (no funciona):**
```
postgresql://postgres:PASSWORD@postgres.railway.internal:5432/railway
```

---

## 🧪 **VERIFICAR QUE FUNCIONE**

Después de conectar, espera 2 minutos y revisa los logs de Railway:

✅ **Debe decir:**
```
🐘 Detectado PostgreSQL, ejecutando migraciones...
🐘 Ejecutando migraciones de PostgreSQL...
✅ Migraciones completadas
🚀 API running on http://0.0.0.0:4000 (env: production)
```

❌ **NO debe decir:**
```
Error: getaddrinfo ENOTFOUND postgres.railway.internal
```

---

## 📸 **SI NECESITAS AYUDA**

Mándame screenshot de:
1. La vista general de tu proyecto (donde se ven todos los servicios)
2. Las variables de entorno del servicio de la API
3. Las variables de entorno del servicio de Postgres

---

## 🎯 **RESUMEN RÁPIDO**

1. **Crear PostgreSQL:** Railway → + New → Database → PostgreSQL
2. **Conectar a API:** API service → Variables → + New Variable → Add Reference → DATABASE_URL
3. **Esperar redeploy** (2-3 minutos)
4. **Verificar logs:** Debe decir "✅ Migraciones completadas"
5. **Ejecutar seed:** `curl https://crm-v1-production.up.railway.app/seed/production`

