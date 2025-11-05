# 🔄 Sincronización entre Web y Móvil - CRM v1

## ❓ El Problema que Tenías

Antes teníamos esta situación:

```
Desarrollo Local:
├── Backend: localhost:3001 (o :4000)
├── Web: localhost:8081 → ✅ Conecta a localhost
└── Móvil: localhost:8081 → ✅ Conecta a localhost
    └── 📱 Los datos se sincronizaban porque compartían la misma DB local

Producción (ANTES):
├── Backend: Railway ✅
├── Web: Vercel → ✅ Conecta a Railway
└── Móvil: APK/Expo → ❌ Conectaba a localhost (no existe en producción!)
    └── 📱 Los datos NO se sincronizaban
```

## ✅ La Solución Implementada

Ahora TODAS las plataformas apuntan al mismo backend:

```
Producción (AHORA):
├── Backend: Railway (https://crm-v1-production.up.railway.app)
│
├── Web: Vercel ────────┐
│                        ├─→ MISMA BASE DE DATOS EN RAILWAY
└── Móvil: APK/Expo ────┘
    
    └── 📱 ✅ Los datos SE SINCRONIZAN!
```

## 📝 Qué Se Modificó

### 1. Archivo `.env` (Configuración por defecto - PRODUCCIÓN)
```bash
EXPO_PUBLIC_API_URL=https://crm-v1-production.up.railway.app
```

✅ Este archivo se usa para:
- Builds de producción (APK, iOS)
- Web en Vercel
- Cuando no especificas otro entorno

### 2. Archivo `.env.development` (Desarrollo Local)
```bash
EXPO_PUBLIC_API_URL=http://localhost:3001
```

✅ Este archivo se usa cuando desarrollas localmente

### 3. Scripts npm actualizados
```bash
npm start                  # Usa .env (producción)
npm run start:development  # Usa .env.development (local)
npm run start:production   # Usa .env.production (Railway)
```

## 🚀 Cómo Usar Ahora

### Para Probar la Sincronización (Producción)

1. **Abre tu web en Vercel**
   - URL: `https://tu-app.vercel.app`

2. **Abre tu app móvil** (APK o Expo Go)
   - Debe estar usando la última versión

3. **Prueba crear datos:**
   ```
   Web: Crea un contacto → "Juan Pérez"
   Móvil: Refresca (pull to refresh) → Deberías ver "Juan Pérez"
   
   Móvil: Crea un contacto → "María García"
   Web: Recarga la página (F5) → Deberías ver "María García"
   ```

### Para Desarrollo Local

Si quieres trabajar con el backend local:

1. **Edita `.env`:**
   ```bash
   # Comenta la URL de producción
   # EXPO_PUBLIC_API_URL=https://crm-v1-production.up.railway.app
   
   # Descomenta localhost
   EXPO_PUBLIC_API_URL=http://localhost:3001
   ```

2. **Levanta el backend local:**
   ```bash
   cd server
   npm start
   ```

3. **Reinicia Expo:**
   ```bash
   npx expo start --clear
   ```

4. **Cuando termines, vuelve a poner la URL de Railway en `.env`**

## 📲 Actualizar la App Móvil

### Opción 1: OTA Update (Over-The-Air) - RECOMENDADO

No necesitas recompilar el APK. Los usuarios recibirán la actualización automáticamente:

```bash
# Actualización para todos los usuarios
eas update --branch production --message "Fix: sincronización de datos"
```

✅ **Ventajas:**
- Sin rebuild del APK
- Actualizaciones instantáneas
- Los usuarios la reciben al abrir la app

❌ **Limitaciones:**
- Solo funciona para cambios de JS/TS
- No funciona para cambios nativos (permisos, plugins, etc.)

### Opción 2: Rebuild del APK

Solo necesario si cambiaste algo nativo:

```bash
# Build nuevo APK
eas build --platform android --profile production

# Después de que termine, descarga el APK
# y distribúyelo a tus usuarios
```

## 🔧 Configuración de Vercel

Tu web en Vercel debe tener estas variables de entorno configuradas:

```bash
EXPO_PUBLIC_API_URL=https://crm-v1-production.up.railway.app
EXPO_PUBLIC_HTTP_TIMEOUT_MS=25000
```

**Cómo configurarlas:**
1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agrega las variables
4. Redeploy (si ya estaba desplegado)

## ⚡ Sincronización en Tiempo Real (Futuro)

Actualmente la sincronización funciona así:
- ✅ Datos compartidos: SÍ (misma base de datos)
- ⏱️ Actualización: Manual (refrescar/recargar)

Para sincronización automática (opcional), puedes implementar:

### Opción A: Polling Simple
```typescript
// Cada 30 segundos, verifica si hay datos nuevos
useEffect(() => {
  const interval = setInterval(() => {
    refetchData();
  }, 30000);
  return () => clearInterval(interval);
}, []);
```

### Opción B: WebSockets con Socket.io
```bash
# Backend
npm install socket.io

# Frontend
npm install socket.io-client
```

### Opción C: React Query con refetch automático
```typescript
const { data } = useQuery({
  queryKey: ['contacts'],
  queryFn: fetchContacts,
  refetchInterval: 30000, // Cada 30 seg
  refetchOnWindowFocus: true, // Al volver a la app
});
```

## 🐛 Solución de Problemas

### "La app móvil no sincroniza"

**Checklist:**

1. ✅ ¿El APK fue compilado con la URL correcta?
   ```bash
   # Verifica en .env antes de compilar
   cat .env | grep EXPO_PUBLIC_API_URL
   ```

2. ✅ ¿Railway está activo?
   ```bash
   # Prueba desde el navegador
   https://crm-v1-production.up.railway.app/health
   ```

3. ✅ ¿Hiciste update OTA después del cambio?
   ```bash
   eas update --branch production
   ```

4. ✅ ¿El usuario está logueado en ambas plataformas?

5. ✅ ¿Estás usando el mismo workspace/tenant?

### "Funciona en web pero no en móvil"

**Posibles causas:**

1. **APK antiguo**: Recompila o haz OTA update
2. **Cache**: Limpia cache de la app
3. **Token expirado**: Cierra sesión y vuelve a entrar
4. **Permisos de red**: Verifica en ajustes del teléfono

### "Los datos no aparecen al instante"

**Es normal**: Por ahora la sincronización es manual.

**Soluciones:**
- 📱 Móvil: Pull to refresh
- 🌐 Web: F5 o recargar
- 🔄 Futuro: Implementar WebSockets o polling

## 📊 Monitoreo

### Ver requests en Railway
1. Ve a tu proyecto en Railway
2. Observability → Logs
3. Deberías ver requests de web y móvil

### Verificar qué URL usa cada plataforma

**Web (en el navegador):**
```javascript
// Abre DevTools → Console
console.log(process.env.EXPO_PUBLIC_API_URL)
```

**Móvil (en el código):**
```typescript
import { getBaseURL } from '@/src/config/baseUrl';
console.log('API URL:', getBaseURL());
```

## 🎯 Resumen

| Plataforma | Backend | Base de Datos | ¿Sincroniza? |
|------------|---------|---------------|--------------|
| Web (Vercel) | Railway | SQLite en Railway | ✅ SÍ |
| Android (APK) | Railway | SQLite en Railway | ✅ SÍ |
| iOS (Expo) | Railway | SQLite en Railway | ✅ SÍ |
| Local (Dev) | localhost | SQLite local | ✅ SÍ (solo local) |

## ✅ Checklist de Implementación

- [x] Configurar `.env` con URL de Railway
- [x] Configurar variables en Vercel
- [x] Actualizar documentación
- [x] Crear scripts npm útiles
- [ ] Rebuild APK con nueva configuración
- [ ] Hacer OTA update
- [ ] Probar sincronización web ↔ móvil
- [ ] (Opcional) Implementar sync en tiempo real

---

**¿Dudas?** Revisa `DEPLOYMENT.md` para más detalles técnicos.
