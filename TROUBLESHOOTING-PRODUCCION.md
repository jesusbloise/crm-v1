# 🔧 Troubleshooting: Diferencias Local vs Producción

## Problema identificado:
- **LOCAL:** Funciona perfecto (admin ve workspaces, puede eliminar)
- **VERCEL:** No funciona correctamente (no ve todos los workspaces, roles incorrectos)

---

## ✅ Checklist de Sincronización

### 1. Código en GitHub (Backend + Frontend)
```bash
# Verificar que todo está en GitHub
git status
git log origin/main..HEAD  # debe estar vacío

# Si hay commits pendientes:
git push origin main
```

### 2. Base de Datos en Railway
```bash
# Ejecutar seed (solo una vez después de cada deploy):
https://crm-v1-production.up.railway.app/seed/production

# Verificar que devuelve:
# - users: 4
# - workspaces: 3
# - memberships: 7
```

### 3. Forzar Redeploy en Vercel
```bash
# Forzar nuevo build en Vercel:
git commit --allow-empty -m "chore: force redeploy"
git push origin main
```

### 4. Limpiar Caché en Navegador
```javascript
// En la consola del navegador (F12):
localStorage.clear()
sessionStorage.clear()
// Luego recarga la página (Ctrl+Shift+R)
```

---

## 🔍 Verificación Rápida

### En LOCAL (debe funcionar):
1. Login: `jesusbloise@gmail.com` / `jesus123`
2. Ve a `/more`
3. **Debe ver:** 3 workspaces (Demo, publicidad, edicion)
4. **Debe ver:** "Tu rol: owner" en todos
5. **Debe ver:** Botón ❌ en publicidad y edicion

### En VERCEL (debe ser igual):
1. URL: https://crm-v1-azure.vercel.app
2. **IMPORTANTE:** Abrir en modo incógnito O hacer logout primero
3. Login: `jesusbloise@gmail.com` / `jesus123`
4. Ve a `/more`
5. **Debe ver:** EXACTAMENTE lo mismo que en local

---

## 🐛 Si sigue fallando en Vercel:

### Opción 1: Verificar variables de entorno en Vercel
```
EXPO_PUBLIC_API_URL=https://crm-v1-production.up.railway.app
```

### Opción 2: Ver logs en tiempo real

**En Vercel:**
1. Dashboard → Tu proyecto → Deployments
2. Click en el último deployment
3. Ve a "Runtime Logs"
4. Busca errores

**En Railway:**
1. Dashboard → Tu servicio
2. Tab "Logs"
3. Busca errores cuando hagas login

### Opción 3: Verificar respuesta de API

Abre consola del navegador (F12) en Vercel y verifica:

```javascript
// Después de hacer login, ejecuta:
fetch('https://crm-v1-production.up.railway.app/me/tenants', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('auth.token')
  }
})
.then(r => r.json())
.then(data => console.table(data.items))
```

**Debe mostrar:**
- 3 items (Demo, publicidad, edicion)
- Todos con `role: "owner"`

---

## 📝 Credenciales de Producción

```
jesusbloise@gmail.com / jesus123  → Owner de: demo, jesus, luis
luisa@gmail.com / luisa123        → Member de: demo, luis
carolina@gmail.com / carolina123  → Member de: demo
admin@demo.local / demo           → Owner de: demo
```

---

## 🚨 Errores Comunes

### "Solo veo 1 workspace en Vercel"
**Causa:** Token antiguo en localStorage  
**Solución:** Logout → Login en modo incógnito

### "Veo los workspaces pero como 'member'"
**Causa:** Base de datos de Railway no tiene los datos correctos  
**Solución:** Ejecutar seed endpoint de nuevo

### "No veo botones de eliminar"
**Causa:** Código antiguo en Vercel  
**Solución:** Forzar redeploy con commit vacío

### "Error 404 tenant_not_found"
**Causa:** Railway no tiene ese workspace  
**Solución:** Ejecutar seed endpoint

---

## 🎯 Proceso Correcto de Deploy

1. **Hacer cambios** en local
2. **Probar** en local (localhost:8081)
3. **Commit y push** a GitHub
4. **Esperar** que Vercel y Railway hagan autodeploy (2-3 min)
5. **Ejecutar seed** en Railway (solo si es primer deploy o reset DB)
6. **Probar en Vercel** en modo incógnito
7. **Si falla:** Revisar logs en Vercel y Railway

---

## 📞 Contacto de Emergencia

Si nada funciona:
1. Revisa los logs de Vercel y Railway
2. Ejecuta el seed endpoint de nuevo
3. Limpia caché del navegador completamente
4. Prueba en modo incógnito

---

**Última actualización:** 2025-11-10
**Versión del código:** commit db446ae
