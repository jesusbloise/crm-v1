# 🚀 Estado del Proyecto CRM

**Última actualización:** 2024

## 📊 Resumen Ejecutivo

Este proyecto ha sido **completamente limpiado** y configurado con **PostgreSQL** como base de datos unificada para desarrollo y producción.

### ✅ Acciones Completadas

1. **Limpieza Masiva de Configuraciones Antiguas**
   - ❌ Eliminado: Todas las configuraciones de Vercel, Render, Railway
   - ❌ Eliminado: 8 documentos de deployment obsoletos
   - ❌ Eliminado: 12 scripts temporales y de migración
   - ❌ Eliminado: 4 archivos `.env` antiguos
   - ✅ Actualizado: `.gitignore` para ignorar `.env` y archivos de base de datos

2. **Migración a PostgreSQL**
   - ✅ Base de datos: **PostgreSQL** (local y producción)
   - ✅ Sistema unificado: mismo motor en todos los ambientes
   - ✅ Migraciones automáticas al iniciar el servidor
   - ✅ 12 tablas principales creadas
   - ✅ Multi-tenancy implementado
   - ✅ Timestamps con BIGINT (soporta Date.now())

3. **Commits Realizados**
   ```
   cb12e4b - docs: add clean project status documentation
   049d17b - clean: remove remaining .env files and analysis docs
   94c5681 - clean: remove all deployment configs, temp scripts, and PostgreSQL code
   ```

## 🏗️ Arquitectura Actual

### Stack Tecnológico

**Backend:**
- Node.js + Express
- PostgreSQL (pg@8.16.3)
- JWT para autenticación
- Multi-tenancy (workspaces)

**Frontend:**
- Expo (React Native)
- Web y Mobile
- TypeScript

**Base de Datos:**
- **Desarrollo:** PostgreSQL local (localhost:5432)
- **Producción:** PostgreSQL (via DATABASE_URL)

### Estructura de Base de Datos

**Tablas Principales:**
- `tenants` - Workspaces/Organizaciones
- `users` - Usuarios del sistema
- `memberships` - Relación usuario-workspace
- `leads` - Prospectos
- `contacts` - Contactos
- `accounts` - Cuentas/Empresas
- `deals` - Oportunidades de venta
- `activities` - Actividades (llamadas, emails, reuniones)
- `notes` - Notas adjuntas a cualquier entidad
- `events` - Eventos de calendario
- `audit_logs` - Logs de auditoría

**Índices Optimizados:**
- Índices por `tenant_id` en todas las tablas principales
- Índices compuestos para consultas frecuentes
- Índices en timestamps para ordenamiento

## 🔧 Configuración de Desarrollo

### Variables de Entorno Requeridas

**Archivo:** `server/.env`

```env
# Servidor
PORT=4000
JWT_SECRET=tu-secreto-jwt-seguro
DEFAULT_TENANT=demo

# PostgreSQL Local
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=tu_contraseña
PGDATABASE=crm_db
```

### Instalación de PostgreSQL

Ver guía completa en: **[POSTGRESQL-SETUP.md](./POSTGRESQL-SETUP.md)**

**Quick Start:**
1. Instalar PostgreSQL 15+ desde https://www.postgresql.org/download/
2. Crear base de datos: `psql -U postgres -c "CREATE DATABASE crm_db;"`
3. Configurar `.env` con credenciales
4. Iniciar servidor: `cd server && npm run dev`

## 🚀 Deployment en Producción

### Variable de Entorno

En producción, usa **una única variable**:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
```

### Proveedores Recomendados

**Base de Datos PostgreSQL:**
- **Render** (Recomendado): PostgreSQL nativo, free tier disponible
- **Railway**: PostgreSQL nativo, $5/mes
- **Neon**: Serverless PostgreSQL, free tier generoso
- **Heroku**: PostgreSQL addon, desde $5/mes

**Hosting del Servidor:**
- **Render**: Web Service, auto-deploy desde Git
- **Railway**: Auto-deploy, $5/mes
- **Fly.io**: Contenedores, free tier disponible

**Hosting del Frontend (Expo Web):**
- **Vercel**: Auto-deploy, free tier
- **Netlify**: Auto-deploy, free tier

## 📁 Archivos Importantes

### Configuración
- `server/.env` - Variables de entorno (NO comitear)
- `server/package.json` - Dependencias del backend
- `package.json` - Dependencias del frontend (Expo)

### Base de Datos
- `server/db/connection.js` - Conexión a PostgreSQL
- `server/db/migrate-pg.js` - Migraciones automáticas

### Servidor
- `server/index.js` - Punto de entrada del servidor
- `server/app.js` - Configuración de Express
- `server/routes/*` - Rutas de la API

### Frontend
- `app/_layout.tsx` - Layout principal de Expo
- `app/*/index.tsx` - Pantallas principales
- `src/api/*` - Clientes de API

## 🗑️ Archivos Eliminados

**Documentos Obsoletos:**
- CHECKLIST.md
- DEPLOYMENT.md
- DEPLOYMENT-STATUS.md
- SYNC-GUIDE.md
- GUIA-MOBILE-UPDATE.md
- CAMBIOS-REALIZADOS.md
- ANALISIS-COMPLETO-SISTEMA.md
- ANALISIS-FALLAS-ROLES.md

**Configuraciones Antiguas:**
- vercel.json
- .env.render
- .env.production
- .env.development
- app/.env

**Scripts Temporales (12 archivos):**
- resetPassword.js
- fixTimestampsPostgres.js
- seedProduction.js
- checkAdminAuth.js
- checkJesusRole.js
- checkTenants.js
- fixWorkspaceCreators.js
- seedDevAuth.js
- updateAdminRoles.js
- updateJesusRole.js
- backfillTenant.js
- fixWorkspaceData.js

**Rutas Eliminadas:**
- server/routes/seed.js
- server/routes/check.js

## 🔄 Próximos Pasos

### 1. Setup Local (AHORA)
```bash
# Instalar PostgreSQL (ver POSTGRESQL-SETUP.md)

# Crear base de datos
psql -U postgres -c "CREATE DATABASE crm_db;"

# Configurar .env
cd server
cp .env.example .env  # Editar con tus credenciales

# Instalar dependencias
npm install

# Iniciar servidor (migraciones automáticas)
npm run dev
```

### 2. Verificar Funcionamiento
```bash
# Servidor debería mostrar:
# 🐘 Ejecutando migraciones PostgreSQL...
# ✅ PostgreSQL conectado
# ✅ Migraciones completadas
# 🚀 API running on http://0.0.0.0:4000

# Probar API
curl http://localhost:4000/api/health
```

### 3. Deploy a Producción (DESPUÉS)
1. Crear base de datos PostgreSQL en proveedor elegido
2. Obtener `DATABASE_URL`
3. Configurar variables de entorno en plataforma de hosting
4. Deploy (automático desde Git)

## 📚 Documentación

- **[POSTGRESQL-SETUP.md](./POSTGRESQL-SETUP.md)** - Guía completa de PostgreSQL
- **[README.md](./README.md)** - Documentación general del proyecto

## ⚠️ Notas Importantes

1. **Base de Datos:** El proyecto ahora usa **PostgreSQL exclusivamente**. SQLite fue eliminado porque causaba problemas en producción.

2. **Multi-tenancy:** Todas las consultas deben filtrar por `tenant_id` (manejado automáticamente por middleware).

3. **Migraciones:** Las migraciones son **idempotentes** y se ejecutan automáticamente al iniciar el servidor.

4. **Seguridad:** 
   - NUNCA comitear `.env`
   - Cambiar `JWT_SECRET` en producción
   - Usar contraseñas fuertes

5. **Timestamps:** Se usan BIGINT para timestamps (Date.now()) porque superan el límite de INTEGER.

## 🆘 Solución de Problemas

### Error: "password authentication failed"
- Verificar credenciales en `.env`
- Resetear contraseña de PostgreSQL si es necesario

### Error: "database does not exist"
- Crear la base de datos: `CREATE DATABASE crm_db;`

### Error: "could not connect to server"
- PostgreSQL no está corriendo
- Windows: Services.msc → postgresql
- macOS: `brew services start postgresql@16`

Ver más soluciones en [POSTGRESQL-SETUP.md](./POSTGRESQL-SETUP.md)

## 📞 Contacto

Para dudas o problemas, revisar:
1. [POSTGRESQL-SETUP.md](./POSTGRESQL-SETUP.md) - Setup de base de datos
2. Logs del servidor - `npm run dev` muestra errores detallados
3. Git history - `git log --oneline` para ver cambios recientes

---

**Estado:** ✅ Proyecto limpio y listo para desarrollo local y deployment
**Última limpieza:** Commits 94c5681, 049d17b, cb12e4b
**Base de datos:** PostgreSQL (local y producción)
