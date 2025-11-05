# 🚀 Guía de Despliegue y Sincronización

## 📱 Problema Resuelto: Sincronización entre Web y Móvil

Esta guía explica cómo mantener sincronizados los datos entre todas las plataformas (Web, Android, iOS).

## 🌐 Arquitectura Actual

```
┌─────────────────────────────────────────────────────────┐
│                  Backend (Railway)                       │
│        https://crm-v1-production.up.railway.app         │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │
          ┌───────────────┼───────────────┐
          │               │               │
     ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
     │   Web   │    │ Android │    │   iOS   │
     │ (Vercel)│    │  (APK)  │    │ (Expo)  │
     └─────────┘    └─────────┘    └─────────┘
```

## ✅ Solución Implementada

Todas las plataformas ahora apuntan al **mismo backend en Railway**, lo que garantiza que:

- ✅ Los datos se comparten entre todas las plataformas
- ✅ Los cambios en web se reflejan en móvil (después de refrescar)
- ✅ Los cambios en móvil se reflejan en web (después de refrescar)
- ✅ Misma base de datos SQLite en Railway

## 🔧 Configuración por Entorno

### 📦 Producción (Web + Móvil)

**Archivo**: `.env` o `.env.production`

```bash
EXPO_PUBLIC_API_URL=https://crm-v1-production.up.railway.app
```

**Plataformas que usan esta configuración:**
- 🌐 Web en Vercel
- 📱 APK de Android (producción)
- 🍎 Build de iOS (producción)

### 🛠️ Desarrollo Local

**Archivo**: `.env.development`

```bash
# Para web y simuladores iOS
EXPO_PUBLIC_API_URL=http://localhost:3001

# Para Android Emulator
EXPO_PUBLIC_API_URL=http://10.0.2.2:3001

# Para dispositivo físico (usa tu IP)
EXPO_PUBLIC_API_URL=http://192.168.1.X:3001
```

## 📲 Pasos para Desplegar Actualizaciones

### 1️⃣ Web (Vercel)

```bash
# Hacer commit de tus cambios
git add .
git commit -m "Update: descripción del cambio"
git push origin main

# Vercel desplegará automáticamente
```

### 2️⃣ Android (APK)

```bash
# Opción A: Build local
npx expo build:android

# Opción B: EAS Build (recomendado)
eas build --platform android --profile production

# Opción C: Expo Updates (actualización sin rebuild)
eas update --platform android --branch production
```

### 3️⃣ iOS (Expo)

```bash
# Build para App Store
eas build --platform ios --profile production

# O actualización OTA (Over The Air)
eas update --platform ios --branch production
```

## 🔄 Sincronización en Tiempo Real

### Opción Actual: Refresh Manual
Los usuarios deben:
- **Web**: Recargar la página (F5)
- **Móvil**: Pull to refresh o cerrar/abrir la app

### Opción Futura: WebSockets/Polling (Opcional)

Si deseas sincronización automática, puedes implementar:

1. **WebSockets** con Socket.io
2. **Polling** cada X segundos
3. **Server-Sent Events** (SSE)
4. **Firebase Realtime Database**

## 🧪 Probar Sincronización

1. Abre la web en Vercel
2. Abre la app móvil
3. Crea un contacto en web
4. Refresca la app móvil → Deberías ver el contacto
5. Crea un contacto en móvil
6. Refresca la web → Deberías ver el contacto

## ⚠️ Notas Importantes

### Para Desarrollo Local:

Si quieres probar localmente con el backend local:

1. Edita `.env`:
   ```bash
   # Para web y iOS Simulator
   EXPO_PUBLIC_API_URL=http://localhost:3001
   
   # Para Android Emulator
   EXPO_PUBLIC_API_URL=http://10.0.2.2:3001
   
   # Para dispositivo físico en tu red (reemplaza con tu IP)
   EXPO_PUBLIC_API_URL=http://192.168.1.100:3001
   ```

2. Obtén tu IP local:
   ```bash
   # Windows
   ipconfig
   
   # Mac/Linux
   ifconfig
   ```

3. Levanta el backend local:
   ```bash
   cd server
   npm start
   ```

4. Reinicia la app:
   ```bash
   npx expo start --clear
   ```

### Para Producción:

Siempre usa:
```bash
EXPO_PUBLIC_API_URL=https://crm-v1-production.up.railway.app
```

## 🐛 Troubleshooting

### "No se conecta al backend"

1. Verifica que Railway esté activo
2. Verifica la URL en `.env`
3. Limpia cache: `npx expo start --clear`
4. Revisa los logs del backend en Railway

### "Los datos no se sincronizan"

1. Ambas apps apuntan al mismo backend? Verifica `.env`
2. Refresca manualmente (por ahora no hay auto-sync)
3. Verifica que el token de auth sea válido
4. Revisa el `X-Tenant-Id` en las peticiones

### "Funciona en web pero no en móvil"

1. Reconstruye el APK/iOS con la nueva configuración
2. O usa `eas update` para actualizaciones OTA
3. Verifica que el `.env` tenga la URL correcta

## 📚 Recursos Adicionales

- [Expo Environment Variables](https://docs.expo.dev/guides/environment-variables/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [EAS Update](https://docs.expo.dev/eas-update/introduction/)
- [Railway Docs](https://docs.railway.app/)
- [Vercel Deployment](https://vercel.com/docs)

## 🎯 Próximos Pasos Recomendados

1. ✅ **Implementado**: Backend único en Railway
2. ✅ **Implementado**: Misma configuración para todas las plataformas
3. 🔲 **Opcional**: Implementar WebSockets para sync en tiempo real
4. 🔲 **Opcional**: Implementar notificaciones push
5. 🔲 **Opcional**: Implementar offline-first con SQLite local + sync

---

**Creado**: Noviembre 2025  
**Última actualización**: Noviembre 2025
