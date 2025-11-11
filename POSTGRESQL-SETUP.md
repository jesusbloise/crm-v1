# 🐘 Configuración de PostgreSQL

Este proyecto ahora usa **PostgreSQL** tanto para desarrollo local como para producción.

## 📋 Requisitos Previos

### Windows
1. Descargar PostgreSQL desde https://www.postgresql.org/download/windows/
2. Instalar PostgreSQL 15 o superior (recomendado: PostgreSQL 16)
3. Durante la instalación:
   - Recordar la contraseña del usuario `postgres`
   - Puerto por defecto: `5432`
   - Incluir pgAdmin 4 (GUI opcional pero útil)

### macOS
```bash
brew install postgresql@16
brew services start postgresql@16
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

## 🔧 Configuración Inicial

### 1. Crear Base de Datos

**Opción A: Usando psql (CLI)**
```bash
# Windows (desde PowerShell o CMD)
psql -U postgres

# Dentro de psql:
CREATE DATABASE crm_db;
\q
```

**Opción B: Usando pgAdmin**
1. Abrir pgAdmin
2. Conectarse al servidor PostgreSQL
3. Click derecho en "Databases" → "Create" → "Database"
4. Nombre: `crm_db`
5. Save

### 2. Configurar Variables de Entorno

Edita el archivo `server/.env`:

```env
# PostgreSQL Local
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=tu_contraseña_aqui  # ⚠️ Cambiar por tu contraseña de PostgreSQL
PGDATABASE=crm_db

# Otras variables
PORT=4000
JWT_SECRET=tu-secreto-jwt-super-seguro
DEFAULT_TENANT=demo
```

### 3. Instalar Dependencias

```bash
cd server
npm install
```

### 4. Iniciar el Servidor

```bash
npm run dev
```

**Salida esperada:**
```
🐘 Ejecutando migraciones PostgreSQL...
✅ PostgreSQL conectado
✅ Migraciones completadas
🚀 API running on http://0.0.0.0:4000 (env: development)
```

## 🔍 Verificación

### Verificar que PostgreSQL está corriendo

**Windows:**
```powershell
Get-Service -Name postgresql*
```

**macOS/Linux:**
```bash
pg_isready
# Output esperado: /tmp:5432 - accepting connections
```

### Verificar la base de datos

```bash
psql -U postgres -d crm_db -c "\dt"
```

Deberías ver 12 tablas:
- activities
- accounts
- audit_logs
- contacts
- deals
- events
- leads
- memberships
- notes
- tenants
- users
- (posiblemente más según migraciones)

## 🚀 Producción

En producción, usa una **única variable de entorno** `DATABASE_URL`:

```env
DATABASE_URL=postgresql://usuario:contraseña@host:5432/nombre_base_datos
```

Ejemplos de proveedores:
- **Render:** postgresql://user:pass@dpg-abc123.oregon-postgres.render.com/crm_production
- **Railway:** postgresql://user:pass@containers-us-west-123.railway.app:5432/railway
- **Heroku:** postgresql://user:pass@ec2-123-456-789.compute-1.amazonaws.com:5432/d1234567890abc
- **Neon:** postgresql://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb

⚠️ **Importante:** Si `DATABASE_URL` está presente, las variables `PGHOST`, `PGUSER`, etc. se ignoran.

## 🔐 Seguridad

1. **NUNCA** comitear el archivo `.env` al repositorio
2. **CAMBIAR** el `JWT_SECRET` en producción
3. **USAR** contraseñas fuertes para PostgreSQL
4. **HABILITAR** SSL en producción (el código ya lo maneja automáticamente)

## 🆘 Solución de Problemas

### Error: "password authentication failed"
- Verificar contraseña en `.env` coincide con PostgreSQL
- En Windows, resetear contraseña: 
  ```cmd
  psql -U postgres
  ALTER USER postgres PASSWORD 'nueva_contraseña';
  ```

### Error: "database crm_db does not exist"
- Crear la base de datos (ver paso 1)
- Verificar nombre en `.env` es exacto

### Error: "could not connect to server"
- PostgreSQL no está corriendo
- Windows: Iniciar desde Services.msc → buscar "postgresql"
- macOS: `brew services start postgresql@16`
- Linux: `sudo systemctl start postgresql`

### Error: "role postgres does not exist"
- Crear usuario:
  ```bash
  createuser -s postgres
  ```

## 📚 Comandos Útiles

### Ver conexiones activas
```sql
SELECT * FROM pg_stat_activity WHERE datname = 'crm_db';
```

### Ver tamaño de la base de datos
```sql
SELECT pg_size_pretty(pg_database_size('crm_db'));
```

### Backup de la base de datos
```bash
pg_dump -U postgres crm_db > backup.sql
```

### Restaurar backup
```bash
psql -U postgres crm_db < backup.sql
```

## 🔄 Migraciones

Las migraciones se ejecutan **automáticamente** al iniciar el servidor.

El archivo `server/db/migrate-pg.js` contiene todas las migraciones.

Las migraciones son **idempotentes** (se pueden ejecutar múltiples veces sin problemas).

## 📞 Soporte

Si tienes problemas:
1. Verificar que PostgreSQL esté instalado y corriendo
2. Verificar que la base de datos `crm_db` exista
3. Verificar credenciales en `.env`
4. Revisar logs del servidor para errores específicos
