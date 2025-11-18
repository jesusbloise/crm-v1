# 📦 Sistema de Auto-Sincronización de Base de Datos - Resumen

## ✅ ¿Qué se creó?

### 🔧 Scripts de Node.js

1. **`server/scripts/export-db-structure.js`**
   - Exporta estructura de DB a archivo SQL
   - Opcional: incluir datos de tablas configuradas
   - Genera archivo en `server/exports/`

2. **`server/scripts/sync-db-to-production.js`**
   - Compara DB local vs producción
   - Sincroniza cambios automáticamente
   - Modos: dry-run, interactivo, force

3. **`server/scripts/check-sync-setup.js`**
   - Verifica configuración completa
   - Prueba conexiones a ambas DBs
   - Valida archivos necesarios

### 🤖 GitHub Actions

**`.github/workflows/sync-db.yml`**
- Se ejecuta en cada push a `main`
- Detecta cambios en `server/db/`
- Sincroniza automáticamente a producción
- Notifica resultado

### 📚 Documentación

1. **`DB-AUTO-SYNC.md`** - Documentación completa del sistema
2. **`QUICKSTART-DB-SYNC.md`** - Guía rápida de 5 minutos
3. **`server/scripts/README-DB-SYNC.md`** - Documentación técnica de scripts

### ⚙️ Configuración

1. **`server/.env.example`** - Actualizado con nuevas variables
2. **`server/package.json`** - Agregados 6 nuevos scripts npm

---

## 🚀 Cómo Usar

### Setup Inicial (Una sola vez)

```bash
# 1. Configurar variables locales
nano server/.env
# Agregar DATABASE_URL y DATABASE_URL_PRODUCTION

# 2. Configurar GitHub Secrets
# GitHub → Settings → Secrets → Actions
# Agregar DATABASE_URL y DATABASE_URL_PRODUCTION

# 3. Verificar setup
cd server
npm run db:check

# 4. Probar sincronización
npm run db:sync:preview
npm run db:sync
```

### Uso Diario

```bash
# 1. Modificas DB local
# Editar: server/db/migrate-pg.js

# 2. Commit y push
git add server/db/
git commit -m "feat: agregar nueva columna"
git push origin main

# 3. GitHub Actions sincroniza automáticamente ✅
```

---

## 📋 Scripts NPM Disponibles

```bash
npm run db:check          # Verificar configuración
npm run db:export         # Exportar estructura
npm run db:export:data    # Exportar estructura + datos
npm run db:sync:preview   # Preview de sincronización
npm run db:sync           # Sincronizar con confirmación
npm run db:sync:force     # Sincronizar sin confirmación (CI/CD)
```

---

## 🔐 Variables de Entorno Necesarias

### Local (`server/.env`)
```bash
DATABASE_URL=postgresql://localhost:5432/crm_v1
DATABASE_URL_PRODUCTION=postgresql://user:pass@prod-host:5432/db
JWT_SECRET=tu-secreto-jwt
```

### GitHub Secrets
```
DATABASE_URL=postgresql://...
DATABASE_URL_PRODUCTION=postgresql://...
```

---

## 🎯 Qué Sincroniza

### ✅ Estructura (Todas las tablas)
- CREATE TABLE
- ALTER TABLE ADD COLUMN
- CREATE INDEX
- Constraints

### ✅ Datos (Tablas configuradas)
- `tenants` (espacios de trabajo)
- `users` (usuarios)
- `memberships` (relaciones)

### ❌ NO Sincroniza
- Datos transaccionales (leads, contacts, deals, activities, notes)
- Columnas eliminadas (requiere confirmación manual)
- Cambios de tipo de dato (requiere migración manual)

---

## 📖 Documentación

- **Quickstart:** `QUICKSTART-DB-SYNC.md` (5 minutos)
- **Documentación completa:** `DB-AUTO-SYNC.md` (ejemplos, troubleshooting)
- **Documentación técnica:** `server/scripts/README-DB-SYNC.md`

---

## 🔄 Flujo de Trabajo

```
Local DB Changes
    ↓
Git Commit
    ↓
Git Push to main
    ↓
GitHub Actions Triggered
    ↓
Sync Script Runs
    ↓
Production DB Updated ✅
```

---

## ⚠️ Advertencias

1. **Backups:** Siempre ten backups antes de sincronizar
2. **Testing:** Prueba en staging antes de producción
3. **Datos:** Los datos transaccionales NO se sincronizan
4. **Columnas eliminadas:** Requieren confirmación manual
5. **GitHub Secrets:** Asegúrate de configurarlos correctamente

---

## 🐛 Troubleshooting

### Workflow no se ejecuta
- ¿El push fue a `main`?
- ¿Modificaste archivos en `server/db/`?
- ¿Los secrets están en GitHub?

### Error de conexión
```bash
npm run db:check  # Verificar configuración
```

### Cambios no aparecen
```bash
# Comparar estructura
psql $DATABASE_URL -c "\d table_name"
psql $DATABASE_URL_PRODUCTION -c "\d table_name"
```

---

## 🎉 Beneficios

✅ **Automatización total** - Push y olvídate  
✅ **Sin errores manuales** - Scripts verifican todo  
✅ **Historial completo** - Git + GitHub Actions logs  
✅ **Rollback fácil** - Git revert + backups  
✅ **Testing seguro** - Dry-run antes de aplicar  

---

## 📝 Próximos Pasos

1. **Leer quickstart:** `QUICKSTART-DB-SYNC.md`
2. **Configurar variables:** Local + GitHub
3. **Probar localmente:** `npm run db:check`
4. **Hacer primer push:** Ver workflow en acción
5. **Celebrar:** 🎉 Todo automático ahora

---

**Creado:** 2024-11-18  
**Versión:** 1.0.0  
**Última actualización:** 2024-11-18
