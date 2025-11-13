# Implementación: Validación de Seguridad para Members

## Cambio Requerido

Actualizar la función `choose` en `app/more/index.tsx` línea ~246:

### ANTES (Sin validación)
```typescript
const choose = async (t: string) => {
  if (t === tenant || busyChip) return;
  
  // Sin verificación de ID - igual que SQLite
  // El usuario puede cambiar de workspace libremente
  await performSwitch(t);
};
```

### DESPUÉS (Con validación para members)
```typescript
const choose = async (t: string) => {
  if (t === tenant || busyChip) return;
  
  // 🔒 SEGURIDAD: Members deben verificar ID antes de entrar
  // Admin/Owner pueden entrar directamente sin verificación
  if (currentRole === 'member') {
    // Buscar el workspace para obtener su nombre
    const workspace = tenants.find(ws => ws.id === t);
    const workspaceName = workspace?.name || t;
    
    // Mostrar modal de verificación
    setVerifyWorkspaceId(t);
    setPendingWorkspaceName(workspaceName);
    setVerifyInput('');
    setVerifyWorkspaceOpen(true);
  } else {
    // Admin/Owner entran directamente
    await performSwitch(t);
  }
};
```

## Flujo de Validación

### Para Members:
1. Usuario presiona chip de workspace (ej: "publicidad")
2. **Modal aparece** pidiendo confirmar ID
3. Usuario debe escribir: `jesus` (el ID exacto)
4. Si coincide → Entra al workspace
5. Si no coincide → Muestra error

### Para Admin/Owner:
1. Usuario presiona chip de workspace
2. **Entra directamente** sin validación
3. Sin modal ni confirmación

## El Modal ya Existe

El modal de verificación ya está implementado (línea ~829):

```typescript
<Modal visible={verifyWorkspaceOpen} transparent animationType="fade">
  <View style={styles.modalOverlay}>
    <View style={styles.modalBox}>
      <Text style={styles.modalTitle}>
        🔒 Verificar Workspace
      </Text>
      <Text style={styles.modalText}>
        Para entrar al workspace "{pendingWorkspaceName}", escribe su ID exacto:
      </Text>
      <TextInput
        value={verifyInput}
        onChangeText={setVerifyInput}
        placeholder={`ID: ${verifyWorkspaceId}`}
        placeholderTextColor={SUBTLE}
        style={styles.modalInput}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
        <Pressable
          style={[styles.modalBtn, styles.modalBtnCancel]}
          onPress={() => setVerifyWorkspaceOpen(false)}
        >
          <Text style={styles.modalBtnText}>Cancelar</Text>
        </Pressable>
        <Pressable
          style={[styles.modalBtn, styles.modalBtnConfirm]}
          onPress={confirmVerifyWorkspace}
          disabled={verifyInput.trim() !== verifyWorkspaceId}
        >
          <Text style={styles.modalBtnText}>Confirmar</Text>
        </Pressable>
      </View>
    </View>
  </View>
</Modal>
```

## Implementación Manual

### Paso 1: Abrir archivo
```bash
code app/more/index.tsx
```

### Paso 2: Buscar función (Ctrl+F)
```
const choose = async (t: string) =>
```

### Paso 3: Reemplazar el contenido de la función
Reemplaza todo el bloque (líneas ~246-252) con el código de **DESPUÉS**.

### Paso 4: Guardar
`Ctrl+S`

## Testing

### Como Member
1. Login: `admin@demo.local` / `test123`
2. Ir a "Más"
3. Click en chip "publicidad"
4. **✅ Debe aparecer modal** pidiendo ID
5. Escribir: `jesus`
6. Click "Confirmar"
7. ✅ Debe entrar al workspace

### Como Owner
1. Login: `jesusbloise@gmail.com` / (tu password)
2. Ir a "Más"
3. Click en chip "publicidad"
4. **✅ Debe entrar directo** sin modal

## Resultado Esperado

```
┌─────────────────────────────────────────┐
│ 🔒 SEGURIDAD WORKSPACES                │
├─────────────────────────────────────────┤
│ 👤 Member:                              │
│    • Ve todos los workspaces           │
│    • Al cambiar → Modal de validación  │
│    • Debe escribir ID exacto           │
│                                         │
│ 🔑 Admin/Owner:                         │
│    • Ve todos los workspaces           │
│    • Al cambiar → Directo sin modal    │
│    • Sin validación                    │
└─────────────────────────────────────────┘
```

## Logs Esperados

### Member intenta cambiar:
```
👤 Member trying to switch to 'jesus'
🔒 Showing verification modal
✅ Verified - proceeding with switch
🔄 /me/tenant/switch: { userId: '...', tenant_id: 'jesus' }
✅ Switch successful
```

### Owner cambia:
```
🔑 Owner switching to 'jesus' (no verification needed)
🔄 /me/tenant/switch: { userId: '...', tenant_id: 'jesus' }
✅ Switch successful
```
