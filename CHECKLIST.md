# ✅ Checklist: Sincronización Web ↔ Móvil

## 📋 Pasos para Asegurar Sincronización

### 1️⃣ Verificar Configuración del Backend

- [ ] Backend en Railway está activo
- [ ] URL del backend: `https://crm-v1-production.up.railway.app`
- [ ] Endpoint `/health` responde correctamente

**Probar:**
```bash
curl https://crm-v1-production.up.railway.app/health
```

### 2️⃣ Configurar Variables de Entorno

#### Web (Vercel)
- [ ] `EXPO_PUBLIC_API_URL` = `https://crm-v1-production.up.railway.app`
- [ ] Redeploy después de cambiar variables

#### Móvil (Expo/APK)
- [ ] Archivo `.env` tiene la URL correcta:
  ```bash
  EXPO_PUBLIC_API_URL=https://crm-v1-production.up.railway.app
  ```

### 3️⃣ Actualizar APK con Nueva Configuración

#### Opción A: OTA Update (Recomendado - Sin rebuild)
```bash
# 1. Verifica que .env tenga la URL correcta
cat .env | grep EXPO_PUBLIC_API_URL

# 2. Publica update
eas update --branch production --message "Sync: conecta a Railway"

# 3. Los usuarios recibirán la update al abrir la app
```

#### Opción B: Rebuild APK (Si cambias algo nativo)
```bash
# 1. Verifica .env
cat .env | grep EXPO_PUBLIC_API_URL

# 2. Build nuevo APK
eas build --platform android --profile production

# 3. Distribuye el nuevo APK
```

### 4️⃣ Probar Sincronización

#### Test 1: Web → Móvil
- [ ] Abre la web en Vercel
- [ ] Crea un contacto: "Test Sync 1"
- [ ] Abre la app móvil
- [ ] Pull to refresh
- [ ] **Resultado esperado**: Ver "Test Sync 1"

#### Test 2: Móvil → Web
- [ ] Abre la app móvil
- [ ] Crea un contacto: "Test Sync 2"
- [ ] Abre la web
- [ ] Recarga la página (F5)
- [ ] **Resultado esperado**: Ver "Test Sync 2"

#### Test 3: Mismo workspace
- [ ] Verifica que estás en el mismo workspace en ambas plataformas
- [ ] Web: Revisa el nombre del workspace activo
- [ ] Móvil: Revisa el nombre del workspace activo
- [ ] **Deben coincidir**

### 5️⃣ Troubleshooting

#### ❌ No sincroniza
- [ ] ¿APK/Web usan la URL de Railway? (no localhost)
- [ ] ¿Railway está activo?
- [ ] ¿Mismo usuario logueado?
- [ ] ¿Mismo workspace/tenant?
- [ ] ¿Hiciste refresh manual?

#### ❌ Error de conexión
- [ ] Verifica URL en `.env`
- [ ] Prueba acceder desde navegador móvil
- [ ] Verifica logs en Railway
- [ ] Limpia cache: `npx expo start --clear`

#### ❌ Datos viejos
- [ ] Refresca manualmente (no hay auto-sync todavía)
- [ ] Cierra sesión y vuelve a entrar
- [ ] Verifica token de auth

### 6️⃣ Configuración de Vercel

En tu proyecto de Vercel → Settings → Environment Variables:

- [ ] `EXPO_PUBLIC_API_URL` = `https://crm-v1-production.up.railway.app`
- [ ] `EXPO_PUBLIC_HTTP_TIMEOUT_MS` = `25000`
- [ ] Después de agregar/cambiar → **Redeploy**

### 7️⃣ Monitoreo

#### Ver requests en Railway
1. Ve a tu proyecto en Railway
2. Click en "Observability" → "Logs"
3. Deberías ver requests de:
   - `User-Agent: Mozilla...` (Web)
   - `User-Agent: Expo...` (Móvil)

#### Ver qué URL usa cada plataforma

**Web (DevTools Console):**
```javascript
console.log('API URL:', process.env.EXPO_PUBLIC_API_URL)
```

**Móvil (en el código):**
```typescript
import { getBaseURL } from '@/src/config/baseUrl';
console.log('API URL:', getBaseURL());
```

---

## 🎯 Checklist Rápido de Producción

### Antes de lanzar:
- [ ] Backend en Railway funcionando
- [ ] Variables de entorno configuradas en Vercel
- [ ] `.env` tiene URL de Railway
- [ ] APK compilado con configuración correcta
- [ ] OTA update publicado
- [ ] Probado en web
- [ ] Probado en Android
- [ ] Probado sincronización web ↔ móvil
- [ ] Documentación actualizada

### Cada vez que hagas cambios:
- [ ] Git push (web se actualiza automáticamente)
- [ ] `eas update --branch production` (móvil OTA)
- [ ] Probar que funciona en ambas plataformas

---

## 📞 Comandos Útiles de Referencia Rápida

```bash
# Ver URL configurada
cat .env | grep EXPO_PUBLIC_API_URL

# Probar backend
curl https://crm-v1-production.up.railway.app/health

# Update OTA (móvil)
eas update --branch production --message "Descripción del cambio"

# Build APK (solo si es necesario)
eas build --platform android --profile production

# Limpiar cache y reiniciar
npx expo start --clear

# Ver logs de Railway
railway logs --tail

# Verificar sincronización
npm run sync:check
```

---

## 📚 Referencias

- 📖 [Guía Completa de Sincronización](./SYNC-GUIDE.md)
- 🚀 [Guía de Despliegue Detallada](./DEPLOYMENT.md)
- 📱 [Documentación de EAS Update](https://docs.expo.dev/eas-update/introduction/)
- 🌐 [Documentación de Vercel](https://vercel.com/docs)
- 🚂 [Documentación de Railway](https://docs.railway.app/)

---

**Última actualización**: Noviembre 2025
