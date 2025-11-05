# 📱 Guía: Ver los Cambios en iOS y Android

## ✅ Los Cambios YA Están Disponibles

Tu update OTA ya fue publicado:
- **Update ID**: `f2d6ba1f-20e5-4327-a25c-16863a952c8e`
- **Branch**: production
- **Estado**: ✅ PUBLISHED

## 🎯 Tres Formas de Ver los Cambios

### Opción 1: Dispositivos con App Instalada (RECOMENDADO)

#### Android (APK):
1. Abre la app en tu teléfono Android
2. Espera 10-15 segundos
3. La app se actualizará automáticamente
4. ✅ Ya tienes los cambios

#### iOS (TestFlight):
1. Abre la app en tu iPhone/iPad
2. Espera 10-15 segundos
3. La app se actualizará automáticamente
4. ✅ Ya tienes los cambios

**No necesitas hacer nada más.** La actualización es automática.

---

### Opción 2: Expo Go (Para Testing Rápido)

#### En Android:
1. Instala "Expo Go" desde Google Play Store
2. Abre Expo Go
3. Escanea el QR del proyecto:
   ```
   npx expo start
   ```
4. O abre directamente: `exp://192.168.x.x:8081`

#### En iOS:
1. Instala "Expo Go" desde App Store
2. Abre Expo Go
3. Escanea el QR del proyecto
4. La app se cargará con los últimos cambios

**Página del proyecto:**
```
https://expo.dev/@chuo/crm-v1
```

---

### Opción 3: Simuladores/Emuladores (Para Desarrollo)

#### Android Emulator:
```bash
# Si tienes Android Studio instalado
npx expo start
# Presiona 'a' para abrir en Android Emulator
```

#### iOS Simulator (Solo Mac):
```bash
# Si tienes Xcode instalado
npx expo start
# Presiona 'i' para abrir en iOS Simulator
```

---

## 🔍 Verificar que el Update Llegó

### Desde el Dashboard de Expo:

1. Ve a: https://expo.dev/accounts/chuo/projects/crm-v1/updates
2. Busca el update: `f2d6ba1f-20e5-4327-a25c-16863a952c8e`
3. Verás:
   - 📊 Cuántos dispositivos lo descargaron
   - ⏱️ Tiempo promedio de descarga
   - ❌ Errores (si los hay)

### Desde la App:

**Método 1: Crea un contacto desde Web**
1. Abre la web en Vercel
2. Crea un contacto: "Test Update iOS/Android"
3. Abre la app móvil (iOS o Android)
4. Pull to refresh (arrastra hacia abajo)
5. ✅ Si ves el contacto → El update funcionó

**Método 2: Verifica la URL del backend**
En la app, los datos ahora vienen de Railway, no de localhost.

---

## ⏱️ Tiempo de Actualización

| Plataforma | Tiempo |
|------------|--------|
| Android (APK ya instalado) | 10-30 segundos al abrir |
| iOS (TestFlight ya instalado) | 10-30 segundos al abrir |
| Expo Go | Inmediato |
| Web | Ya disponible en Vercel |

---

## 🚨 Si el Update No Llega

### Para APK/TestFlight:

```bash
# 1. Cierra completamente la app
# 2. Espera 5 segundos
# 3. Abre la app de nuevo
# 4. Deberías ver un mensaje de "Descargando actualización..."
```

### Si aún no funciona:

**Plan A: Force Update**
```bash
# Publica otro update
eas update --branch production --message "Force update"
```

**Plan B: Verifica el canal**
```bash
# Lista los updates
eas update:list --branch production

# Deberías ver tu update más reciente
```

**Plan C: Rebuild (SOLO si nada funciona)**
```bash
# Solo necesario si cambiaste algo nativo
eas build --platform android --profile production
```

---

## 📊 Diferencia entre OTA Update y Rebuild

### OTA Update (Lo que hiciste - RÁPIDO):
- ✅ Cambios de código JS/TS
- ✅ Actualización automática
- ✅ Sin reinstalar app
- ✅ 5-10 segundos
- ❌ No funciona para cambios nativos

### Rebuild (LENTO - solo si es necesario):
- ✅ Cambios nativos (permisos, plugins)
- ✅ Cambios en assets (iconos, splash)
- ❌ Hay que redistribuir el APK/IPA
- ❌ Usuarios deben reinstalar
- ⏱️ 10-20 minutos de build

**Tu caso:** Solo hiciste cambios de código → **OTA Update es suficiente** ✅

---

## 🎯 Comandos Útiles

```bash
# Ver updates publicados
eas update:list --branch production

# Ver detalles de un update específico
eas update:view f2d6ba1f-20e5-4327-a25c-16863a952c8e

# Publicar nuevo update
eas update --branch production --message "Nuevo cambio"

# Iniciar Expo para testing
npx expo start

# Limpiar cache y reiniciar
npx expo start --clear
```

---

## 📱 Prueba de Sincronización Completa

### Test iOS:
1. Abre la app en iPhone/iPad
2. Espera que descargue el update
3. Inicia sesión
4. Crea un contacto: "Test iOS - [hora]"
5. Ve a la web
6. Recarga (F5)
7. ✅ Deberías ver el contacto

### Test Android:
1. Abre la app en Android
2. Espera que descargue el update
3. Inicia sesión
4. Crea un contacto: "Test Android - [hora]"
5. Ve a la web
6. Recarga (F5)
7. ✅ Deberías ver el contacto

### Test Web → Móvil:
1. En web, crea contacto: "Test Web - [hora]"
2. En móvil (iOS o Android)
3. Pull to refresh
4. ✅ Deberías ver el contacto

---

## 🎉 ¿Qué Cambió en iOS/Android?

Después del update, las apps móviles ahora:

✅ Se conectan a Railway (antes localhost)
✅ Comparten base de datos con web
✅ Sincronizan datos en tiempo real (con refresh manual)
✅ Muestran información del creador de workspaces
✅ Tienen todos los bugs corregidos

---

## 📊 Monitoreo en Tiempo Real

### Dashboard de Expo:
```
https://expo.dev/accounts/chuo/projects/crm-v1
```

Aquí verás:
- 📈 Gráfica de instalaciones
- 🔄 Updates activos
- 📱 Dispositivos conectados
- ❌ Crashes (si los hay)

### Railway Logs:
```
https://railway.app/project/[tu-proyecto]/service/[tu-servicio]
```

Verás requests de:
- 🌐 Web (User-Agent: Mozilla...)
- 📱 Móvil (User-Agent: Expo...)

---

## ✅ Checklist Final

- [x] Update OTA publicado
- [x] Web desplegada en Vercel
- [ ] **Probar en Android físico o emulador**
- [ ] **Probar en iOS físico o simulador**
- [ ] **Verificar sincronización web ↔ móvil**
- [ ] **Confirmar que usa Railway (no localhost)**

---

**Siguiente paso:** Abre la app en tu teléfono y espera 15 segundos. El update se aplicará automáticamente 🚀
