# 📦 Scripts de Sincronización de Base de Datos

Este directorio contiene scripts para gestionar la sincronización entre tu base de datos local y producción.

---

## 📋 Scripts Disponibles

### 1️⃣ `export-db-structure.js`
Exporta la estructura (y opcionalmente datos) de tu base de datos local a un archivo SQL.

**Uso:**
```bash
# Solo estructura
node scripts/export-db-structure.js

# Estructura + datos de tablas configuradas
node scripts/export-db-structure.js --with-data
```

**Salida:**
- Genera archivo en `server/exports/db-export-YYYY-MM-DD.sql`
- Incluye CREATE TABLE, índices, constraints
- Opcionalmente incluye INSERT statements para datos

**Para importar en producción:**
```bash
psql $DATABASE_URL_PRODUCTION < server/exports/db-export-YYYY-MM-DD.sql
```

---

### 2️⃣ `sync-db-to-production.js`
Sincroniza automáticamente la estructura y datos desde local hacia producción.

**Requisitos:**
- Variable `DATABASE_URL` configurada (DB local)
- Variable `DATABASE_URL_PRODUCTION` configurada (DB producción)

**Uso:**
```bash
# Preview de cambios (no hace cambios reales)
node scripts/sync-db-to-production.js --dry-run

# Sincronizar con confirmación interactiva
node scripts/sync-db-to-production.js

# Sincronizar sin confirmación (para CI/CD)
node scripts/sync-db-to-production.js --force
```

**Qué sincroniza:**

✅ **Estructura (todas las tablas):**
- Agrega columnas nuevas
- Detecta columnas eliminadas (requiere confirmación manual)
- Preserva datos existentes

✅ **Datos (solo tablas configuradas):**
- `tenants` - Espacios de trabajo
- `users` - Usuarios
- `memberships` - Relaciones usuario-tenant

❌ **NO sincroniza datos transaccionales:**
- `leads`, `contacts`, `accounts`, `deals`
- `activities`, `notes`, `events`
- `audit_logs`

---

## 🤖 GitHub Actions - Auto Sincronización

### Configuración en GitHub

1. **Agregar Secrets en tu repositorio:**

   Ve a: `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

   Agrega:
   - `DATABASE_URL` - URL de tu DB local o staging
   - `DATABASE_URL_PRODUCTION` - URL de tu DB en producción (Railway/Render/etc)

   Formato:
   ```
   postgresql://user:password@host:5432/database
   ```

2. **El workflow se ejecuta automáticamente:**
   - En cada `push` a `main` que modifique archivos en `server/db/`
   - También puede ejecutarse manualmente desde GitHub Actions

3. **Qué hace el workflow:**
   ```
   📥 Checkout del código
   🟢 Configura Node.js
   📦 Instala dependencias
   🔍 Verifica conexión a ambas DBs
   🔄 Ejecuta dry-run (preview)
   🚀 Sincroniza estructura a producción
   ✅ Notifica resultado
   ```

---

## 🔐 Configuración de Variables de Entorno

### Local (archivo `.env` en `server/`)

```bash
# Base de datos local (PostgreSQL)
DATABASE_URL=postgresql://localhost:5432/crm_v1

# Base de datos de producción (Railway/Render/etc)
DATABASE_URL_PRODUCTION=postgresql://user:pass@host.railway.app:5432/railway
```

### Producción (GitHub Secrets)

```
DATABASE_URL=postgresql://...tu-db-staging...
DATABASE_URL_PRODUCTION=postgresql://...tu-db-production...
```

---

## 📖 Flujo de Trabajo Recomendado

### Desarrollo Local → Producción

1. **Haces cambios en DB local:**
   ```bash
   # Ejemplo: agregar columna a tabla contacts
   ALTER TABLE contacts ADD COLUMN linkedin_url TEXT;
   ```

2. **Pruebas localmente:**
   ```bash
   cd server
   npm run dev
   # Probar que todo funciona
   ```

3. **Hacer commit y push:**
   ```bash
   git add server/db/
   git commit -m "feat: agregar columna linkedin_url a contacts"
   git push origin main
   ```

4. **GitHub Actions automáticamente:**
   - Detecta cambios en `server/db/`
   - Ejecuta el script de sincronización
   - Actualiza la DB de producción
   - Notifica resultado

5. **Verificar en producción:**
   ```bash
   # Conectarte a la DB de producción y verificar
   psql $DATABASE_URL_PRODUCTION -c "\d contacts"
   ```

---

## ⚠️ Advertencias Importantes

### ❗ Cuidado con columnas eliminadas
- Si eliminas una columna en local, el script la detecta pero pide confirmación
- En modo `--force` (CI/CD), las columnas eliminadas NO se borran automáticamente
- Debes eliminarlas manualmente en producción si es necesario

### ❗ Datos transaccionales NO se sincronizan
- Leads, contactos, deals, actividades, notas → NO se copian
- Solo se sincronizan usuarios, tenants y memberships
- Esto previene sobrescribir datos de producción

### ❗ Backups antes de sincronizar
- **SIEMPRE** haz backup de producción antes de sincronizar
- Railway/Render tienen backups automáticos, pero verifica

---

## 🔍 Debugging

### Ver logs de GitHub Actions
1. Ve a tu repositorio en GitHub
2. Click en `Actions`
3. Selecciona el workflow "🚀 Auto-Deploy DB Schema"
4. Click en el run más reciente
5. Expande cada paso para ver detalles

### Probar sincronización localmente
```bash
cd server

# Dry run para ver qué cambiaría
node scripts/sync-db-to-production.js --dry-run

# Si todo se ve bien, sincronizar
node scripts/sync-db-to-production.js
```

### Verificar estructura de tabla
```sql
-- Local
\d contacts

-- Producción
psql $DATABASE_URL_PRODUCTION -c "\d contacts"
```

---

## 📝 Package.json Scripts

Agrega estos scripts a `server/package.json`:

```json
{
  "scripts": {
    "db:export": "node scripts/export-db-structure.js",
    "db:export:data": "node scripts/export-db-structure.js --with-data",
    "db:sync:preview": "node scripts/sync-db-to-production.js --dry-run",
    "db:sync": "node scripts/sync-db-to-production.js",
    "db:sync:force": "node scripts/sync-db-to-production.js --force"
  }
}
```

Entonces puedes usar:
```bash
npm run db:export         # Exportar estructura
npm run db:sync:preview   # Preview de sincronización
npm run db:sync           # Sincronizar (con confirmación)
```

---

## 🎯 Casos de Uso

### Caso 1: Agregar nueva tabla
```bash
# 1. Crear migración en local
# Editar: server/db/migrate-pg.js

# 2. Ejecutar migración local
npm run dev  # Auto ejecuta migraciones

# 3. Commit y push
git add server/db/migrate-pg.js
git commit -m "feat: agregar tabla products"
git push

# 4. GitHub Actions sincroniza automáticamente ✅
```

### Caso 2: Modificar tabla existente
```bash
# 1. Agregar columna en local
psql $DATABASE_URL
ALTER TABLE contacts ADD COLUMN avatar_url TEXT;

# 2. Actualizar migrate-pg.js para incluir la columna

# 3. Push a GitHub
git push

# 4. Workflow sincroniza la nueva columna ✅
```

### Caso 3: Exportar snapshot completo
```bash
# Útil para backups o migrar a otra plataforma
npm run db:export:data

# Archivo generado en server/exports/
# Importar donde necesites:
psql $NEW_DB_URL < server/exports/db-export-2024-11-18.sql
```

---

## 🆘 Solución de Problemas

### Error: "DATABASE_URL_PRODUCTION not configured"
```bash
# Asegúrate de tener el secret configurado en GitHub
# O en tu .env local si ejecutas manualmente
```

### Error: "ALTER TABLE failed"
```bash
# Puede ser un conflict con constraint o tipo de dato
# Revisa logs para ver el SQL exacto que falló
# Ajusta manualmente en producción si es necesario
```

### Sincronización exitosa pero cambios no aparecen
```bash
# Verifica que estés conectado a la DB correcta
psql $DATABASE_URL_PRODUCTION -c "SELECT current_database();"

# Verifica que la tabla tenga los cambios
psql $DATABASE_URL_PRODUCTION -c "\d table_name"
```

---

## 📚 Referencias

- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
- [GitHub Actions Workflows](https://docs.github.com/en/actions)
- [Node.js pg Pool](https://node-postgres.com/features/pooling)

---

**Creado:** 2024-11-18  
**Última actualización:** 2024-11-18
