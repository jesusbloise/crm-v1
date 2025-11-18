# 🚀 Quickstart - Auto-Sincronización de DB

**5 minutos para configurar sincronización automática de tu base de datos.**

---

## ✅ Checklist Rápido

- [ ] PostgreSQL instalado y corriendo
- [ ] Variables de entorno configuradas
- [ ] GitHub Secrets configurados
- [ ] Scripts probados localmente
- [ ] Push a GitHub realizado

---

## 📝 Paso 1: Configurar Variables Locales (2 min)

Edita `server/.env`:

```bash
# Tu DB local
DATABASE_URL=postgresql://localhost:5432/crm_v1

# Tu DB de producción (Railway/Render/etc)
DATABASE_URL_PRODUCTION=postgresql://user:pass@prod-host:5432/database

# JWT Secret
JWT_SECRET=tu-secreto-jwt-super-seguro
```

---

## 🔐 Paso 2: Configurar GitHub Secrets (1 min)

1. Ve a tu repo en GitHub
2. `Settings` → `Secrets and variables` → `Actions` → `New repository secret`
3. Agrega:

   **Secret 1:**
   ```
   Name: DATABASE_URL
   Value: postgresql://localhost:5432/crm_v1
   ```

   **Secret 2:**
   ```
   Name: DATABASE_URL_PRODUCTION
   Value: postgresql://user:pass@prod-host:5432/database
   ```

---

## 🧪 Paso 3: Probar Setup (1 min)

```bash
cd server
npm run db:check
```

Deberías ver:
```
✅ DATABASE_URL              Configurada
✅ DATABASE_URL_PRODUCTION   Configurada
✅ DB Local                  Conectado a "crm_v1"
✅ DB Producción             Conectado a "railway"
✅ export-db-structure.js    Existe
✅ sync-db-to-production.js  Existe
✅ GitHub Workflow           Configurado

✅ TODO CONFIGURADO CORRECTAMENTE
```

---

## 🔍 Paso 4: Probar Sincronización (1 min)

```bash
# Ver qué cambiaría (sin hacer cambios)
npm run db:sync:preview
```

Si todo se ve bien:

```bash
# Sincronizar (pide confirmación)
npm run db:sync
```

---

## 🚀 Paso 5: Push y Auto-Deploy (30 seg)

```bash
git add .
git commit -m "feat: configurar auto-sync de DB"
git push origin main
```

Ve a `Actions` en GitHub → Verás el workflow ejecutándose ✅

---

## 📖 ¿Y ahora qué?

### Uso Diario

1. Modificas DB local (editar `server/db/migrate-pg.js`)
2. Haces push a GitHub
3. **Workflow sincroniza automáticamente** ✅

### Ver Documentación Completa

```bash
# Todas las opciones y ejemplos
cat DB-AUTO-SYNC.md

# Documentación de scripts
cat server/scripts/README-DB-SYNC.md
```

---

## 🆘 Problemas Comunes

### "DATABASE_URL_PRODUCTION not configured"
→ Agrega el secret en GitHub Settings

### "Connection refused"
→ Verifica que PostgreSQL esté corriendo localmente

### "Workflow no se ejecuta"
→ Verifica que tu push modificó archivos en `server/db/`

---

## ✨ Scripts Disponibles

```bash
npm run db:check          # Verificar configuración
npm run db:sync:preview   # Ver cambios sin aplicarlos
npm run db:sync           # Sincronizar (con confirmación)
npm run db:export         # Exportar estructura a SQL
npm run db:export:data    # Exportar estructura + datos
```

---

**¡Listo!** Ahora cada vez que hagas push, tu DB de producción se actualiza automáticamente. 🎉
