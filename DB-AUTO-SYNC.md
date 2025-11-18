# 🔄 Sistema de Sincronización Automática de Base de Datos

## 📖 Resumen

Este sistema te permite sincronizar automáticamente la estructura de tu base de datos desde local/staging hacia producción en cada push a GitHub.

---

## 🎯 ¿Qué problema resuelve?

Antes tenías que:
1. ✏️ Hacer cambios en la DB local
2. 📝 Documentar los cambios
3. 🔌 Conectarte manualmente a la DB de producción
4. ⌨️ Ejecutar ALTER TABLE manualmente
5. 🤞 Esperar que no haya errores

Ahora:
1. ✏️ Haces cambios en DB local
2. 🚀 Push a GitHub
3. ✅ **Todo se sincroniza automáticamente**

---

## 🛠️ Componentes del Sistema

### 1. **export-db-structure.js**
Script que exporta la estructura de tu DB a un archivo SQL.

```bash
npm run db:export              # Solo estructura
npm run db:export:data         # Estructura + datos
```

**Genera:**
```
server/exports/db-export-2024-11-18T15-30-00.sql
```

---

### 2. **sync-db-to-production.js**
Script inteligente que compara tu DB local vs producción y sincroniza cambios.

```bash
npm run db:sync:preview        # Ver qué cambiaría (dry-run)
npm run db:sync                # Sincronizar (con confirmación)
npm run db:sync:force          # Sincronizar sin preguntar (CI/CD)
```

**Qué hace:**
- ✅ Detecta columnas nuevas → las agrega automáticamente
- ⚠️ Detecta columnas eliminadas → pide confirmación
- 📊 Sincroniza datos de tablas configuradas (users, tenants, memberships)
- 🔒 NO toca datos transaccionales (leads, contacts, deals, etc.)

---

### 3. **GitHub Action Workflow**
Workflow que se ejecuta automáticamente en cada push.

**Archivo:** `.github/workflows/sync-db.yml`

**Se activa cuando:**
- Haces push a `main`
- Modificas archivos en `server/db/`
- Lo ejecutas manualmente desde GitHub Actions

**Proceso:**
```
📥 Checkout código
🟢 Instala Node.js
📦 Instala dependencias
🔍 Verifica conexión a ambas DBs
🔄 Ejecuta dry-run (preview)
🚀 Sincroniza a producción
✅ Notifica resultado
```

---

## 🚀 Configuración Inicial

### Paso 1: Configurar Variables de Entorno Localmente

Edita `server/.env`:

```bash
# Tu DB local
DATABASE_URL=postgresql://localhost:5432/crm_v1

# Tu DB de producción (Railway/Render/Supabase/etc)
DATABASE_URL_PRODUCTION=postgresql://user:pass@prod-host.railway.app:5432/railway
```

### Paso 2: Configurar Secrets en GitHub

1. Ve a tu repositorio en GitHub
2. Click en `Settings` → `Secrets and variables` → `Actions`
3. Click en `New repository secret`
4. Agrega estos 2 secrets:

   **Secret 1:**
   - Name: `DATABASE_URL`
   - Value: `postgresql://...tu-db-local-o-staging...`

   **Secret 2:**
   - Name: `DATABASE_URL_PRODUCTION`
   - Value: `postgresql://...tu-db-produccion...`

### Paso 3: Prueba Local (Opcional)

Antes de hacer push, prueba localmente:

```bash
cd server

# Ver qué cambiaría sin hacerlo
npm run db:sync:preview

# Si todo se ve bien, sincronizar
npm run db:sync
```

### Paso 4: Push y Verifica

```bash
git add .
git commit -m "feat: configurar auto-sync de DB"
git push origin main
```

Ve a `Actions` en GitHub y verás el workflow ejecutándose.

---

## 📋 Ejemplos de Uso

### Ejemplo 1: Agregar Nueva Columna

**1. Modifica la migración en local:**

`server/db/migrate-pg.js`:
```javascript
await client.query(`
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    linkedin_url TEXT,  // ← NUEVA COLUMNA
    ...
  );
`);
```

**2. Ejecuta migraciones localmente:**
```bash
npm run dev  # Auto ejecuta migraciones
```

**3. Prueba que funciona:**
```bash
psql $DATABASE_URL -c "\d contacts"
```

**4. Commit y push:**
```bash
git add server/db/migrate-pg.js
git commit -m "feat: agregar columna linkedin_url a contacts"
git push origin main
```

**5. GitHub Actions automáticamente:**
- ✅ Detecta el cambio
- ✅ Agrega la columna en producción
- ✅ Notifica el resultado

---

### Ejemplo 2: Crear Nueva Tabla

**1. Edita migrate-pg.js:**
```javascript
await client.query(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price BIGINT,
    tenant_id TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
`);
```

**2. Push:**
```bash
git push
```

**3. Workflow crea la tabla automáticamente en producción** ✅

---

### Ejemplo 3: Exportar Snapshot Completo

Si necesitas hacer un backup o migrar todo:

```bash
npm run db:export:data
```

Esto genera:
```
server/exports/db-export-2024-11-18T15-30-00.sql
```

Importar en otra DB:
```bash
psql postgresql://new-db-url < server/exports/db-export-2024-11-18T15-30-00.sql
```

---

## ⚠️ Cosas Importantes

### ✅ Lo que SÍ se sincroniza automáticamente:

- ✅ Estructura de tablas (CREATE TABLE)
- ✅ Columnas nuevas (ALTER TABLE ADD COLUMN)
- ✅ Índices (CREATE INDEX)
- ✅ Datos de tablas configuradas:
  - `tenants` (espacios de trabajo)
  - `users` (usuarios)
  - `memberships` (relaciones usuario-tenant)

### ❌ Lo que NO se sincroniza automáticamente:

- ❌ Datos transaccionales:
  - `leads`, `contacts`, `accounts`, `deals`
  - `activities`, `notes`, `events`
  - `audit_logs`
- ❌ Columnas eliminadas (requiere confirmación manual o `--force`)
- ❌ Cambios de tipo de dato (requiere migración manual)

### 🔒 Seguridad

- ✅ Nunca sobrescribe datos de producción
- ✅ Solo agrega/modifica estructura
- ✅ Usa UPSERT para datos (INSERT ... ON CONFLICT DO UPDATE)
- ✅ GitHub Actions solo tiene acceso a secrets encriptados

---

## 🐛 Troubleshooting

### Error: "DATABASE_URL_PRODUCTION not configured"

**Solución:**
- Asegúrate de tener el secret `DATABASE_URL_PRODUCTION` en GitHub
- O en tu `.env` local si ejecutas manualmente

### Error: "ALTER TABLE failed"

**Posibles causas:**
- Constraint conflict (ej: NOT NULL sin DEFAULT)
- Tipo de dato incompatible
- Columna ya existe

**Solución:**
```bash
# Ejecuta dry-run para ver el SQL exacto
npm run db:sync:preview

# Revisa los logs en GitHub Actions
# Ajusta manualmente en producción si es necesario
```

### Cambios no aparecen en producción

**Verificar:**
```bash
# Verifica que estés conectado a la DB correcta
psql $DATABASE_URL_PRODUCTION -c "SELECT current_database();"

# Verifica columnas de la tabla
psql $DATABASE_URL_PRODUCTION -c "\d contacts"
```

### Workflow no se ejecuta

**Verificar:**
1. ¿El push fue a `main`?
2. ¿Modificaste archivos en `server/db/`?
3. ¿Los secrets están configurados en GitHub?
4. Ve a `Actions` → Selecciona el workflow → Ve logs

---

## 📊 Monitoreo

### Ver Logs del Workflow

1. Ve a tu repositorio en GitHub
2. Click en `Actions`
3. Selecciona "🚀 Auto-Deploy DB Schema on Push"
4. Click en el run más reciente
5. Expande cada paso para ver detalles

### Verificar Sincronización

```bash
# Comparar estructura local vs producción
psql $DATABASE_URL -c "\d contacts"
psql $DATABASE_URL_PRODUCTION -c "\d contacts"

# Ver últimas migraciones aplicadas
psql $DATABASE_URL_PRODUCTION -c "SELECT * FROM migrations_log ORDER BY applied_at DESC LIMIT 5;"
```

---

## 🔄 Flujo Completo (Diagrama)

```
┌─────────────────┐
│  Desarrollo     │
│  Local          │
└────────┬────────┘
         │
         │ 1. Modificas DB
         │ (migrate-pg.js)
         │
         ▼
┌─────────────────┐
│  Git Commit     │
│  & Push         │
└────────┬────────┘
         │
         │ 2. Push a GitHub
         │
         ▼
┌─────────────────────────────┐
│  GitHub Actions              │
│  ┌─────────────────────────┐│
│  │ 1. Checkout código      ││
│  │ 2. Instalar deps        ││
│  │ 3. Dry-run preview      ││
│  │ 4. Sincronizar          ││
│  └─────────────────────────┘│
└────────┬────────────────────┘
         │
         │ 3. Ejecuta sync script
         │
         ▼
┌─────────────────┐
│  DB Producción  │
│  (Railway/etc)  │
│                 │
│  ✅ Estructura  │
│     actualizada │
└─────────────────┘
```

---

## 📚 Scripts Disponibles

```bash
# Exportar estructura
npm run db:export

# Exportar estructura + datos
npm run db:export:data

# Preview de sincronización (no hace cambios)
npm run db:sync:preview

# Sincronizar (pide confirmación)
npm run db:sync

# Sincronizar sin confirmación (para CI/CD)
npm run db:sync:force
```

---

## 🎓 Tips Pro

### Tip 1: Prueba siempre en staging primero
```bash
# Configura una DB de staging
DATABASE_URL_STAGING=postgresql://...

# Prueba ahí antes de producción
npm run db:sync
```

### Tip 2: Backups automáticos
Railway/Render tienen backups automáticos, pero puedes hacer manualmente:
```bash
npm run db:export:data
```

### Tip 3: Migraciones complejas
Para cambios complejos (cambiar tipo de dato, renombrar columnas), crea un archivo SQL en `server/db/migrations/`:
```sql
-- 001_add_linkedin_url.sql
ALTER TABLE contacts ADD COLUMN linkedin_url TEXT;
```

El script `runSQLMigrations()` lo ejecutará automáticamente.

### Tip 4: Rollback
Si algo sale mal:
```bash
# 1. Restaura backup en Railway/Render
# 2. O ejecuta el último export:
psql $DATABASE_URL_PRODUCTION < server/exports/db-export-[timestamp].sql
```

---

## 🤝 Contribuir

Si encuentras bugs o tienes mejoras:
1. Abre un issue
2. Crea un PR con tus cambios
3. Actualiza esta documentación

---

## 📝 Changelog

- **2024-11-18**: Creación inicial del sistema de auto-sync
  - Script de exportación
  - Script de sincronización
  - GitHub Action workflow
  - Documentación completa

---

**Última actualización:** 2024-11-18  
**Autor:** Sistema CRM v1  
**Licencia:** ISC
