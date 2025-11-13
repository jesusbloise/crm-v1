// app/more/index.tsx
import {
  deleteTenant,
  fetchTenants,
  getActiveTenant,
  logout,
  switchTenant,
} from "@/src/api/auth";
import { api } from "@/src/api/http";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const BG = "#0b0c10",
  CARD = "#14151a",
  BORDER = "#272a33",
  TEXT = "#e8ecf1",
  SUBTLE = "#a9b0bd",
  ACCENT = "#7c3aed";

const ANDROID_CHANNEL_ID = "crm-reminders";

(Notifications as any).setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
} as any);

async function testLocalNotif10s() {
  try {
    if (Platform.OS === "web") {
      alert("(WEB) simulando notificación en 10s…");
      setTimeout(() => alert("(WEB) Test 10s"), 10_000);
      return;
    }
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permisos",
        "Activa las notificaciones para esta app en Ajustes del sistema"
      );
      return;
    }
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: "CRM Reminders",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        showBadge: true,
        bypassDnd: true,
      });
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Notificación de prueba",
        body: "Deberías ver/oir esto ~10s después de tocar el botón",
        sound: Platform.OS === "ios" ? true : undefined,
        data: { kind: "debug-10s" },
      },
      trigger:
        Platform.OS === "android"
          ? (({ seconds: 10, channelId: ANDROID_CHANNEL_ID } as any) as Notifications.NotificationTriggerInput)
          : (({ seconds: 10 } as any) as Notifications.NotificationTriggerInput),
    });
    Alert.alert("Programada", "Sonará en ~10s");
  } catch (e: any) {
    console.warn("testLocalNotif10s error:", e);
    Alert.alert("Error", String(e?.message ?? e));
  }
}

type TenantItem = {
  id: string;
  name?: string;
  owner_name?: string;
  owner_email?: string;
  role?: string;
  is_active?: boolean;
};

export default function More() {
  const [tenant, setTenant] = useState<string>("demo");
  const [tenants, setTenants] = useState<TenantItem[]>([{ id: "demo", name: "Demo" }]);
  const [busyChip, setBusyChip] = useState<string | null>(null);
  const [busyLogout, setBusyLogout] = useState(false);
  
  // ✨ UNA SOLA FUENTE DE VERDAD: rol actual del workspace activo
  const [currentRole, setCurrentRole] = useState<"owner" | "admin" | "member" | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  const [query, setQuery] = useState("");
  const [discover, setDiscover] = useState<
    Array<{ id: string; name: string; owner_name?: string; owner_email?: string }>
  >([]);
  const [busySearch, setBusySearch] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [joinIdInput, setJoinIdInput] = useState("");

  // 🔒 Estado para verificación de workspace
  const [verifyWorkspaceOpen, setVerifyWorkspaceOpen] = useState(false);
  const [verifyWorkspaceId, setVerifyWorkspaceId] = useState("");
  const [verifyInput, setVerifyInput] = useState("");
  const [pendingWorkspaceName, setPendingWorkspaceName] = useState("");

  const appState = useRef<AppStateStatus>(AppState.currentState);

  /** ------------------------------------------
   * ✨ NUEVA LÓGICA SIMPLIFICADA: Una sola fuente de verdad
   * ------------------------------------------ */
  const fetchCurrentRole = useCallback(async () => {
    setLoadingRole(true);
    try {
      const url = `/tenants/role?_=${Date.now()}`;
      const res = await api.get<{ tenant_id: string | null; role: string | null }>(url);
      const r = (res?.role || "").toLowerCase() as "owner" | "admin" | "member" | "";
      setCurrentRole(r || null);
      console.log("🔑 Rol actualizado:", r || "sin rol");
    } catch (err) {
      console.warn("⚠️ No se pudo obtener rol actual:", err);
      setCurrentRole(null);
    } finally {
      setLoadingRole(false);
    }
  }, []);

  // ✨ SIMPLIFICADO: No fallbacks, no computaciones complejas
  const isAdminOrOwner = currentRole === "owner" || currentRole === "admin";

  /** ------------------------------------------
   * ✨ SIMPLIFICADO: Actualiza tenant y recarga datos
   * ------------------------------------------ */
  const refreshTenantsAndRole = useCallback(async () => {
    try {
      const localActive = await getActiveTenant();
      if (localActive) {
        setTenant(localActive);
      }
      
      const data = await fetchTenants();
      if (data?.items?.length) setTenants(data.items);
      if (data?.active_tenant) {
        setTenant(data.active_tenant);
      }
      
      // Obtener rol actual
      await fetchCurrentRole();
    } catch (e) {
      console.warn("⚠️ refreshTenantsAndRole error:", e);
    }
  }, [fetchCurrentRole]);

  useFocusEffect(
    useCallback(() => {
      refreshTenantsAndRole();
    }, [refreshTenantsAndRole])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appState.current;
      appState.current = next;
      if (prev.match(/inactive|background/) && next === "active") {
        refreshTenantsAndRole();
      }
    });
    return () => sub.remove();
  }, [refreshTenantsAndRole]);

  /** ------------------------------------------
   * Búsqueda y join
   * ------------------------------------------ */
  const onSearch = async () => {
    const q = query.trim();
    console.log('🔍 onSearch called with query:', q);
    
    if (!q) {
      console.log('⚠️ Query empty, clearing results');
      setDiscover([]);
      return;
    }
    
    setBusySearch(true);
    try {
      console.log('🌐 Fetching workspaces...');
      const data = await api.get<{
        items: Array<{ id: string; name: string; owner_name?: string; owner_email?: string }>;
      }>(`/tenants/discover?query=${encodeURIComponent(q)}&_=${Date.now()}`);
      
      console.log('✅ Search results:', data);
      console.log('📋 Items:', data?.items);
      
      setDiscover(data?.items || []);
      
      if (!data?.items || data.items.length === 0) {
        Alert.alert("Sin resultados", `No se encontraron workspaces con "${q}"`);
      }
    } catch (e: any) {
      console.error('❌ Search error:', e);
      Alert.alert("Ups", e?.message || "No se pudo buscar");
    } finally {
      setBusySearch(false);
    }
  };

  const joinAndEnter = async (tenantId: string) => {
    try {
      // 🔄 Sistema simplificado: Solo hacer switch al workspace
      // Ya no hay memberships, cualquier usuario puede entrar a cualquier workspace
      const res = await switchTenant(tenantId);
      const confirmed = (res as any)?.active_tenant || tenantId;
      setTenant(confirmed);
      await fetchCurrentRole();
      await refreshTenantsAndRole();
      setJoinOpen(false);
      setPendingTenantId(null);
      setJoinIdInput("");
      router.replace("/");
    } catch (e: any) {
      Alert.alert("No se pudo entrar", e?.message || "Verifica el ID.");
    }
  };

  /** ------------------------------------------
   * Cambiar de workspace
   * ------------------------------------------ */
    const choose = async (t: string) => {
    if (t === tenant || busyChip) return;
    
    //  SEGURIDAD: Members deben verificar ID antes de entrar
    // Admin/Owner pueden entrar directamente sin verificación
    if (currentRole === 'member') {
      // Buscar el workspace para obtener su nombre
      const workspace = tenants.find(ws => ws.id === t);
      const workspaceName = workspace?.name || t;
      
      console.log(' Member trying to switch to:', t, '- Showing verification modal');
      
      // Mostrar modal de verificación
      setVerifyWorkspaceId(t);
      setPendingWorkspaceName(workspaceName);
      setVerifyInput('');
      setVerifyWorkspaceOpen(true);
    } else {
      // Admin/Owner entran directamente
      console.log(' Admin/Owner switching to:', t, '(no verification needed)');
      await performSwitch(t);
    }
  };

  /**
   * Realizar el switch de workspace (después de verificación o si ya verificado)
   */
  const performSwitch = async (t: string) => {
    setBusyChip(t);
    const prev = tenant;
    try {
      const res = await switchTenant(t);
      const confirmed = (res as any)?.active_tenant || t;
      setTenant(confirmed);
      await fetchCurrentRole();
      await refreshTenantsAndRole();
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("forbidden_tenant")) {
        setPendingTenantId(t);
        setJoinIdInput("");
        setJoinOpen(true);
      } else {
        setTenant(prev);
        Alert.alert("No se pudo cambiar de workspace", msg || "Intenta de nuevo.");
      }
    } finally {
      setBusyChip(null);
    }
  };

  /**
   * Confirmar verificación de workspace
   */
  const confirmVerifyWorkspace = async () => {
    if (verifyInput.trim() !== verifyWorkspaceId) {
      Alert.alert("ID incorrecto", "El ID ingresado no coincide con el workspace");
      return;
    }
    
    // Guardar como verificado
    const VERIFIED_KEY = `@workspace_verified_${verifyWorkspaceId}`;
    await AsyncStorage.setItem(VERIFIED_KEY, "true");
    
    setVerifyWorkspaceOpen(false);
    
    // Proceder con el switch
    await performSwitch(verifyWorkspaceId);
  };

  /** ------------------------------------------
   * Logout
   * ------------------------------------------ */
  const onLogout = async () => {
    if (busyLogout) return;
    setBusyLogout(true);
    try {
      await logout();
      router.replace("/auth/login");
    } finally {
      setBusyLogout(false);
    }
  };

  /**
   * Eliminar workspace (solo admin/owner GLOBALES)
   */
  const handleDeleteWorkspace = async (workspace: TenantItem) => {
    console.log("🗑️ handleDeleteWorkspace called for:", workspace.id, workspace.name);
    
    // Verificar que sea admin o owner GLOBAL
    if (!isAdminOrOwner) {
      console.log("❌ Permisos insuficientes - Rol global:", currentRole);
      Alert.alert(
        "Permisos insuficientes",
        "Solo usuarios con rol admin u owner pueden eliminar workspaces"
      );
      return;
    }
    console.log("✅ Usuario tiene permisos (rol global:", currentRole, "), mostrando confirmación...");

    // Confirmación (compatible web y móvil)
    const confirmDelete = () => new Promise<boolean>((resolve) => {
      if (Platform.OS === "web") {
        const confirmed = window.confirm(
          `¿Estás seguro que deseas eliminar "${workspace.name || workspace.id}"?\n\n⚠️ Esta acción eliminará TODOS los datos del workspace:\n• Miembros\n• Leads\n• Contactos\n• Deals\n• Notas\n• Actividades\n\nEsta acción no se puede deshacer.`
        );
        resolve(confirmed);
      } else {
        Alert.alert(
          "Eliminar workspace",
          `¿Estás seguro que deseas eliminar "${workspace.name || workspace.id}"?\n\n⚠️ Esta acción eliminará TODOS los datos del workspace:\n• Miembros\n• Leads\n• Contactos\n• Deals\n• Notas\n• Actividades\n\nEsta acción no se puede deshacer.`,
          [
            { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
            { text: "Eliminar", style: "destructive", onPress: () => resolve(true) },
          ]
        );
      }
    });

    const confirmed = await confirmDelete();
    if (!confirmed) {
      console.log("❌ Usuario canceló la eliminación");
      return;
    }

    // Ejecutar eliminación
    const workspaceId = workspace.id;
    const workspaceName = workspace.name || workspace.id;
    
    try {
      console.log("🔄 Eliminando workspace:", workspaceId);
      setBusyChip(workspaceId);
      
      // 1. Eliminar en el servidor
      const result = await deleteTenant(workspaceId);
      console.log("✅ Workspace eliminado del servidor:", result);
      
      // 2. Si era el workspace activo, cambiar primero
      if (tenant === workspaceId) {
        console.log("🔄 Workspace activo eliminado, cambiando...");
        const remaining = tenants.filter((t) => t.id !== workspaceId);
        if (remaining.length > 0) {
          console.log("→ Cambiando a:", remaining[0].id);
          setTenant(remaining[0].id);
          // Actualizar AsyncStorage
          try {
            const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
            await AsyncStorage.setItem("auth.tenant", remaining[0].id);
          } catch (e) {
            console.warn("No se pudo actualizar AsyncStorage:", e);
          }
        } else {
          console.log("→ Cambiando a: demo");
          setTenant("demo");
          try {
            const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
            await AsyncStorage.setItem("auth.tenant", "demo");
          } catch (e) {
            console.warn("No se pudo actualizar AsyncStorage:", e);
          }
        }
      }

      // 3. Actualizar lista local INMEDIATAMENTE (UI instantánea)
      console.log("🔄 Actualizando lista local...");
      setTenants((prev) => prev.filter((t) => t.id !== workspaceId));
      
      // 4. Recargar del servidor (para sincronizar)
      console.log("🔄 Recargando del servidor...");
      setTimeout(() => {
        refreshTenantsAndRole().catch((e) => {
          console.warn("Error recargando del servidor:", e);
        });
      }, 100);
      
      console.log("✅ Workspace eliminado completamente");
      
      // 5. Mostrar mensaje de éxito
      if (Platform.OS === "web") {
        alert(`Workspace "${workspaceName}" eliminado exitosamente`);
      } else {
        Alert.alert(
          "Workspace eliminado",
          `El workspace "${workspaceName}" ha sido eliminado exitosamente`
        );
      }
      
    } catch (err: any) {
      console.error("❌ Error deleting workspace:", err);
      console.error("Error details:", {
        message: err?.message,
        code: err?.code,
        status: err?.status,
        data: err?.data,
      });
      
      // Mostrar error amigable
      let errorMessage = "No se pudo eliminar el workspace.";
      if (err?.status === 404) {
        errorMessage = "El workspace ya no existe o ya fue eliminado.";
      } else if (err?.status === 403) {
        errorMessage = "No tienes permisos para eliminar este workspace.";
      } else if (err?.message) {
        errorMessage = err.message;
      }
      
      if (Platform.OS === "web") {
        alert(`Error: ${errorMessage}`);
      } else {
        Alert.alert("Error al eliminar", errorMessage);
      }
      
      // Recargar lista en caso de error para sincronizar
      refreshTenantsAndRole().catch((e) => {
        console.warn("Error recargando después de fallo:", e);
      });
    } finally {
      setBusyChip(null);
    }
  };

  /** ------------------------------------------
   * UI
   * ------------------------------------------ */
  const Chip = ({ item }: { item: TenantItem }) => {
    const active = tenant === item.id;
    const isBusy = busyChip === item.id;
    // 🔑 Usar rol GLOBAL para permisos de eliminación
    const canDelete = isAdminOrOwner;
    
    return (
      <View style={{ position: "relative" }}>
        <Pressable
          onPress={() => choose(item.id)}
          disabled={Boolean(busyChip)}
          style={[
            styles.chip,
            active && styles.chipActive,
            busyChip && !isBusy && { opacity: 0.6 },
          ]}
          android_ripple={{ color: "rgba(255,255,255,0.08)" }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {item.name || item.id}
            </Text>
            {isBusy && (
              <ActivityIndicator size="small" color={active ? "#fff" : ACCENT} />
            )}
          </View>
          <Text style={[styles.role, active && styles.roleActive]}>
            Creado por: {item.owner_name || item.owner_email || "Desconocido"}
          </Text>
        </Pressable>

        {/* Botón de eliminar (solo admin/owner GLOBALES) */}
        {canDelete && item.id !== "demo" && (
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              handleDeleteWorkspace(item);
            }}
            disabled={Boolean(busyChip)}
            style={[
              styles.deleteBtn,
              busyChip && { opacity: 0.4 },
            ]}
            android_ripple={{ color: "rgba(239,68,68,0.3)", borderless: true }}
          >
            <Text style={styles.deleteBtnText}>🗑️</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const canConfirmJoin = !!pendingTenantId && joinIdInput.trim() === pendingTenantId;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "Más" }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
        bounces
        alwaysBounceVertical
        keyboardShouldPersistTaps="handled"
      >
        {/* 🔍 DEBUG BUTTON - TEMPORAL */}
        <Pressable
          style={{
            backgroundColor: "#dc2626",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            alignItems: "center",
          }}
          onPress={() => router.push("/debug-api")}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
            🔍 DEBUG API
          </Text>
        </Pressable>

        {/* ---- TUS WORKSPACES ---- */}
        <Text style={styles.title}>Tus workspaces</Text>
        <View style={styles.row}>
          {tenants.map((it) => (
            <Chip key={it.id} item={it} />
          ))}
        </View>
        <Text style={styles.hint}>Un toque cambia al instante.</Text>

        {/* Indicador de carga de rol */}
        {loadingRole && (
          <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="small" color={ACCENT} />
            <Text style={{ color: SUBTLE, fontSize: 12 }}>
              Verificando permisos...
            </Text>
          </View>
        )}

        <View style={{ height: 24 }} />

        {/* ---- DESCUBRIR / ENTRAR POR ID ---- */}
        <View style={styles.card}>
          <Text style={styles.label}>Descubrir / entrar por ID</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={onSearch}
            placeholder="ej: acme"
            placeholderTextColor={SUBTLE}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            onPress={onSearch}
            disabled={busySearch}
            style={[styles.primaryBtn, busySearch && { opacity: 0.6 }]}
          >
            <Text style={styles.primaryTxt}>
              {busySearch ? "Buscando…" : "Buscar"}
            </Text>
          </Pressable>

          {discover.length > 0 && (
            <View style={{ marginTop: 12, gap: 8 }}>
              {discover.map((d) => (
                <View key={d.id} style={styles.resultItem}>
                  <View>
                    <Text style={styles.resultTitle}>{d.name || d.id}</Text>
                    <Text style={styles.resultSub}>ID: {d.id}</Text>
                    <Text style={[styles.resultSub, { marginTop: 2 }]}>
                      Creador: {d.owner_name || d.owner_email || "Desconocido"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={async () => {
                      try {
                        setBusyChip(d.id);
                        const res = await switchTenant(d.id);
                        const confirmed = (res as any)?.active_tenant || d.id;
                        setTenant(confirmed);
                        await fetchCurrentRole();
                        await refreshTenantsAndRole();
                        setDiscover([]); // Limpiar búsqueda
                        setQuery(""); // Limpiar campo
                        Alert.alert("Éxito", `Cambiado a workspace "${d.name || d.id}"`);
                      } catch (e: any) {
                        Alert.alert("Error", e?.message || "No se pudo cambiar de workspace");
                      } finally {
                        setBusyChip(null);
                      }
                    }}
                    disabled={busyChip === d.id}
                    style={[styles.joinBtn, busyChip === d.id && { opacity: 0.5 }]}
                  >
                    <Text style={styles.joinTxt}>
                      {busyChip === d.id ? "..." : "Entrar"}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 24 }} />

        {/* ---- Cuenta → Ver perfil ---- */}
        <View style={{ height: 16 }} />
        <Text style={styles.title}>Cuenta</Text>

        <View style={styles.menuList}>
          {/* Ver perfil */}
          <Pressable
            onPress={() => router.push("/profile" as any)}
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.menuItemPressed,
            ]}
            android_ripple={{ color: "rgba(124,58,237,0.15)" }}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: ACCENT + "20" }]}>
                <Text style={[styles.menuIconText, { color: ACCENT }]}>
                  Perfil
                </Text>
              </View>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Ver perfil</Text>
                <Text style={styles.menuItemSubtitle}>
                  Información y configuración personal
                </Text>
              </View>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>

          {/* Nuevo workspace */}
          {isAdminOrOwner && (
            <Pressable
              onPress={() => router.push("/more/workspaces-new")}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
              android_ripple={{ color: "rgba(16,185,129,0.15)" }}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: "#10b98120" }]}>
                  <Text style={[styles.menuIconText, { color: "#10b981" }]}>
                    Nuevo
                  </Text>
                </View>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemTitle}>Nuevo workspace</Text>
                  <Text style={styles.menuItemSubtitle}>
                    Crear un espacio de trabajo nuevo
                  </Text>
                </View>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </Pressable>
          )}

          {/* Administrador */}
          {isAdminOrOwner && (
            <Pressable
              onPress={() => router.push("/more/admin-users" as any)}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
              android_ripple={{ color: "rgba(245,158,11,0.15)" }}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: "#f59e0b20" }]}>
                  <Text style={[styles.menuIconText, { color: "#f59e0b" }]}>
                    Admin
                  </Text>
                </View>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemTitle}>Administrador</Text>
                  <Text style={styles.menuItemSubtitle}>
                    Ver y gestionar usuarios del workspace
                  </Text>
                </View>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </Pressable>
          )}

          {/* Cerrar sesión */}
          <Pressable
            onPress={onLogout}
            disabled={busyLogout}
            style={({ pressed }) => [
              styles.menuItem,
              styles.menuItemDanger,
              pressed && styles.menuItemPressed,
              busyLogout && { opacity: 0.6 },
            ]}
            android_ripple={{ color: "rgba(239,68,68,0.15)" }}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: "#ef444420" }]}>
                <Text style={[styles.menuIconText, { color: "#ef4444" }]}>
                  Salir
                </Text>
              </View>
              <View style={styles.menuItemContent}>
                <Text style={[styles.menuItemTitle, { color: "#ef4444" }]}>
                  {busyLogout ? "Saliendo..." : "Cerrar sesión"}
                </Text>
                <Text style={styles.menuItemSubtitle}>
                  Salir de tu cuenta en este dispositivo
                </Text>
              </View>
            </View>
            <Text style={[styles.menuArrow, { color: "#ef4444" }]}>›</Text>
          </Pressable>
        </View>

        {/* ---- Desarrollo / Debug ---- */}
        <View style={{ height: 24 }} />
        <Text style={styles.title}>Desarrollo</Text>
        <View style={styles.menuList}>
          <Pressable
            onPress={testLocalNotif10s}
            style={({ pressed }) => [
              styles.menuItem,
              { borderBottomWidth: 0 },
              pressed && styles.menuItemPressed,
            ]}
            android_ripple={{ color: "rgba(124,58,237,0.15)" }}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: ACCENT + "20" }]}>
                <Text style={[styles.menuIconText, { color: ACCENT }]}>
                  Notificar
                </Text>
              </View>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Test notificación (10s)</Text>
                <Text style={styles.menuItemSubtitle}>
                  Programar notificación de prueba
                </Text>
              </View>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* ---- MODAL JOIN ---- */}
      <Modal
        visible={joinOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setJoinOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.label, { marginBottom: 8 }]}>
              Escribe el ID del workspace para entrar:
            </Text>
            {!!pendingTenantId && (
              <Text style={{ color: SUBTLE, marginBottom: 6 }}>
                ID esperado:{" "}
                <Text style={{ color: TEXT, fontWeight: "900" }}>
                  {pendingTenantId}
                </Text>
              </Text>
            )}
            <TextInput
              value={joinIdInput}
              onChangeText={setJoinIdInput}
              placeholder="ej: acme"
              placeholderTextColor={SUBTLE}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable
                onPress={() => {
                  setJoinOpen(false);
                  setPendingTenantId(null);
                  setJoinIdInput("");
                }}
                style={[styles.modalBtn, { backgroundColor: "#374151" }]}
              >
                <Text style={styles.modalTxt}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => pendingTenantId && joinAndEnter(pendingTenantId)}
                disabled={!canConfirmJoin}
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor: canConfirmJoin ? ACCENT : "#5b21b6",
                  },
                ]}
              >
                <Text style={styles.modalTxt}>Unirme y entrar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 🔒 Modal: Verificar ID de workspace */}
      <Modal visible={verifyWorkspaceOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.title, { textAlign: "center", marginBottom: 8 }]}>
              Verificar acceso al workspace
            </Text>
            <Text style={{ color: SUBTLE, marginBottom: 16, textAlign: "center" }}>
              Para acceder a "{pendingWorkspaceName}" por primera vez, verifica el ID del workspace.
              {"\n\n"}
              Solicita este ID al administrador.
            </Text>

            <Text style={styles.label}>ID del workspace</Text>
            <TextInput
              value={verifyInput}
              onChangeText={setVerifyInput}
              placeholder="Ingresa el ID exacto"
              placeholderTextColor={SUBTLE}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />

            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <Pressable
                onPress={() => {
                  setVerifyWorkspaceOpen(false);
                  setVerifyInput("");
                }}
                style={[styles.modalBtn, { flex: 1, backgroundColor: "#1f2430" }]}
              >
                <Text style={[styles.modalTxt, { color: TEXT }]}>Cancelar</Text>
              </Pressable>

              <Pressable
                onPress={confirmVerifyWorkspace}
                disabled={!verifyInput.trim()}
                style={[
                  styles.modalBtn,
                  { 
                    flex: 1, 
                    backgroundColor: verifyInput.trim() ? ACCENT : "#5b21b6",
                    opacity: verifyInput.trim() ? 1 : 0.6
                  }
                ]}
              >
                <Text style={styles.modalTxt}>Verificar y entrar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  title: { color: TEXT, fontSize: 18, fontWeight: "900", marginBottom: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    marginRight: 8,
    marginBottom: 8,
    minWidth: 160,
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { color: TEXT, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  role: { color: SUBTLE, fontSize: 12, marginTop: 2 },
  roleActive: { color: "#f5f5f5" },
  hint: { color: SUBTLE, marginTop: 6 },
  card: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  label: { color: TEXT, fontWeight: "800" },
  input: {
    marginTop: 8,
    backgroundColor: "#0f1015",
    color: TEXT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 8, default: 10 }),
  },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryTxt: { color: "#fff", fontWeight: "900" },
  resultItem: {
    backgroundColor: "#111216",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultTitle: { color: TEXT, fontWeight: "800" },
  resultSub: { color: SUBTLE, fontSize: 12, marginTop: 2 },
  joinBtn: {
    backgroundColor: "#22c55e",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  joinTxt: { color: "#fff", fontWeight: "800" },
  menuList: {
    marginTop: 12,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  menuItemPressed: { backgroundColor: "rgba(124,58,237,0.08)" },
  menuItemDanger: { borderBottomWidth: 0 },
  menuItemLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconText: { fontSize: 14, fontWeight: "700" },
  menuItemContent: { flex: 1 },
  menuItemTitle: { color: TEXT, fontSize: 16, fontWeight: "800", marginBottom: 3 },
  menuItemSubtitle: { color: SUBTLE, fontSize: 13, lineHeight: 18 },
  menuArrow: { color: SUBTLE, fontSize: 28, fontWeight: "300", marginLeft: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  modalTxt: { color: "#fff", fontWeight: "900" },
  deleteBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(239, 68, 68, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(239, 68, 68, 0.6)",
    zIndex: 10,
    elevation: 5,
  },
  deleteBtnText: {
    fontSize: 20,
    pointerEvents: "none",
  },
});

