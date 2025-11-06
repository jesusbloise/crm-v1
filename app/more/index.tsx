// app/more/index.tsx
import {
  fetchTenants,
  getActiveTenant,
  logout,
  switchTenant
} from "@/src/api/auth";
import { api } from "@/src/api/http";
import { Stack, router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// 🔔 Prueba de notificaciones nativas (directo con expo-notifications)
import * as Notifications from "expo-notifications";

const BG = "#0b0c10",
  CARD = "#14151a",
  BORDER = "#272a33",
  TEXT = "#e8ecf1",
  SUBTLE = "#a9b0bd",
  ACCENT = "#7c3aed";

const ANDROID_CHANNEL_ID = "crm-reminders";

// Handler compatible (sin pelear con tipos)
(Notifications as any).setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
} as any);

// Función de prueba: agenda una notificación en 10s
async function testLocalNotif10s() {
  try {
    if (Platform.OS === "web") {
      alert("⏱️ (WEB) simulando notificación en 10s…");
      setTimeout(() => alert("🚨 (WEB) Test 10s"), 10_000);
      return;
    }

    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permisos", "Activa las notificaciones para esta app en Ajustes del sistema");
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
        title: "🔔 Test notificación (10s)",
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
  const [userIsAdmin, setUserIsAdmin] = useState(false);

  // Discover / join por ID
  const [query, setQuery] = useState("");
  const [discover, setDiscover] = useState<Array<{ id: string; name: string; owner_name?: string; owner_email?: string }>>([]);
  const [busySearch, setBusySearch] = useState(false);

  // 🔒 Modal "Unirse por ID" (confirmación de clave)
  const [joinOpen, setJoinOpen] = useState(false);
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [joinIdInput, setJoinIdInput] = useState("");

  useEffect(() => {
    (async () => {
      const localActive = await getActiveTenant();
      setTenant(localActive);
      try {
        const data = await fetchTenants();
        console.log("📋 fetchTenants response:", JSON.stringify(data, null, 2));
        if (data?.items?.length) setTenants(data.items);
        if (data?.active_tenant) setTenant(data.active_tenant);
        
        // Verificar si es admin en algún workspace
        const adminStatus = await isAdminInAnyWorkspace(data?.items || []);
        console.log("🔐 Admin check DETALLADO:", {
          totalTenants: data?.items?.length,
          tenants: data?.items?.map(t => ({ 
            id: t.id, 
            name: t.name, 
            role: t.role,
            roleType: typeof t.role 
          })),
          isAdmin: adminStatus,
          hasItems: !!data?.items?.length
        });
        setUserIsAdmin(adminStatus);
      } catch (e: any) {
        console.warn("fetchTenants error:", e?.message || e);
      }
    })();
  }, []);

  // Función para verificar si el usuario es admin en algún workspace
  const isAdminInAnyWorkspace = async (tenantList: TenantItem[]) => {
    console.log("🔍 isAdminInAnyWorkspace - Input:", tenantList);
    
    // Si tiene algún tenant donde sea admin, puede acceder
    const hasAdminRole = tenantList.some(t => {
      console.log(`  Checking tenant ${t.name}: role="${t.role}" (type: ${typeof t.role})`);
      return t.role === "admin";
    });
    
    console.log("🔍 Resultado final:", { 
      tenantCount: tenantList.length,
      roles: tenantList.map(t => ({ id: t.id, role: t.role })),
      hasAdminRole 
    });
    return hasAdminRole;
  };

  const onSearch = async () => {
    const q = query.trim();
    if (!q) {
      setDiscover([]);
      return;
    }
    setBusySearch(true);
    try {
      const data = await api.get<{ items: Array<{ id: string; name: string; owner_name?: string; owner_email?: string }> }>(
        `/tenants/discover?query=${encodeURIComponent(q)}`
      );
      setDiscover(data.items || []);
    } catch (e: any) {
      Alert.alert("Ups", e?.message || "No se pudo buscar");
    } finally {
      setBusySearch(false);
    }
  };

  // Unirse (auto-join) y entrar directo — se llama solo si la "clave" coincide
  const joinAndEnter = async (tenantId: string) => {
    try {
      await api.post("/tenants/join", { tenant_id: tenantId });
      const res = await switchTenant(tenantId);
      const confirmed = res?.active_tenant || tenantId;
      setTenant(confirmed);
      
      // Refrescar la lista de tenants
      try {
        const data = await fetchTenants();
        if (data?.items?.length) setTenants(data.items);
        if (data?.active_tenant) setTenant(data.active_tenant);
      } catch (refreshError) {
        console.warn("Error refrescando tenants:", refreshError);
      }
      
      setJoinOpen(false);
      setPendingTenantId(null);
      setJoinIdInput("");
      router.replace("/");
    } catch (e: any) {
      Alert.alert("No se pudo entrar", e?.message || "Verifica el ID o solicita invitación.");
    }
  };

  // Cambiar workspace: si no pertenece → abrir modal para pedir ID
  const choose = async (t: string) => {
    if (t === tenant || busyChip) return;
    setBusyChip(t);
    const prev = tenant;

    try {
      const res = await switchTenant(t);
      const confirmed = res?.active_tenant || t;
      setTenant(confirmed);
      
      // Refrescar la lista de tenants para actualizar el estado activo
      try {
        const data = await fetchTenants();
        if (data?.items?.length) setTenants(data.items);
        if (data?.active_tenant) setTenant(data.active_tenant);
      } catch (refreshError) {
        console.warn("Error refrescando tenants:", refreshError);
      }
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

  const onLogout = async () => {
    if (busyLogout) return;
    setBusyLogout(true); // <-- fix
    try {
      await logout();
      router.replace("/auth/login");
    } finally {
      setBusyLogout(false);
    }
  };

  const Chip = ({ item }: { item: TenantItem }) => {
    const active = tenant === item.id;
    const isBusy = busyChip === item.id;
    return (
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
          {isBusy && <ActivityIndicator size="small" color={active ? "#fff" : ACCENT} />}
        </View>
        <Text style={[styles.role, active && styles.roleActive]}>
          Creado por: {item.owner_name || item.owner_email || "Desconocido"}
        </Text>
      </Pressable>
    );
  };

  const canConfirmJoin = pendingTenantId && joinIdInput.trim() === pendingTenantId;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "Más" }} />

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        bounces={true}
        alwaysBounceVertical={true}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---- TUS WORKSPACES ---- */}
        <Text style={styles.title}>Tus workspaces</Text>
        <View style={styles.row}>
          {tenants.map((it) => (
            <Chip key={it.id} item={it} />
          ))}
        </View>
        <Text style={styles.hint}>Un toque cambia al instante.</Text>

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
          <Text style={styles.primaryTxt}>{busySearch ? "Buscando…" : "Buscar"}</Text>
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
                  onPress={() => {
                    setPendingTenantId(d.id);
                    setJoinIdInput("");
                    setJoinOpen(true);
                  }}
                  style={styles.joinBtn}
                >
                  <Text style={styles.joinTxt}>Entrar</Text>
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

      {/* Lista moderna de opciones */}
      <View style={styles.menuList}>
        <Pressable
          onPress={() => router.push("/profile" as any)}
          style={({ pressed }) => [
            styles.menuItem,
            pressed && styles.menuItemPressed
          ]}
          android_ripple={{ color: "rgba(124,58,237,0.15)" }}
        >
          <View style={styles.menuItemLeft}>
            <View style={[styles.menuIcon, { backgroundColor: ACCENT + "20" }]}>
              <Text style={[styles.menuIconText, { color: ACCENT }]}>👤</Text>
            </View>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemTitle}>Ver perfil</Text>
              <Text style={styles.menuItemSubtitle}>Información y configuración personal</Text>
            </View>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/more/workspaces-new")}
          style={({ pressed }) => [
            styles.menuItem,
            pressed && styles.menuItemPressed
          ]}
          android_ripple={{ color: "rgba(16,185,129,0.15)" }}
        >
          <View style={styles.menuItemLeft}>
            <View style={[styles.menuIcon, { backgroundColor: "#10b98120" }]}>
              <Text style={[styles.menuIconText, { color: "#10b981" }]}>➕</Text>
            </View>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemTitle}>Nuevo workspace</Text>
              <Text style={styles.menuItemSubtitle}>Crear un espacio de trabajo nuevo</Text>
            </View>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </Pressable>

        {/* ---- Botón de Administrador ---- */}
        <Pressable
          onPress={() => router.push("/more/admin-users" as any)}
          style={({ pressed }) => [
            styles.menuItem,
            pressed && styles.menuItemPressed
          ]}
          android_ripple={{ color: "rgba(245,158,11,0.15)" }}
        >
          <View style={styles.menuItemLeft}>
            <View style={[styles.menuIcon, { backgroundColor: "#f59e0b20" }]}>
              <Text style={[styles.menuIconText, { color: "#f59e0b" }]}>👥</Text>
            </View>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemTitle}>Administrador</Text>
              <Text style={styles.menuItemSubtitle}>Ver todos los usuarios registrados</Text>
            </View>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </Pressable>

        <Pressable
          onPress={onLogout}
          disabled={busyLogout}
          style={({ pressed }) => [
            styles.menuItem,
            styles.menuItemDanger,
            pressed && styles.menuItemPressed,
            busyLogout && { opacity: 0.6 }
          ]}
          android_ripple={{ color: "rgba(239,68,68,0.15)" }}
        >
          <View style={styles.menuItemLeft}>
            <View style={[styles.menuIcon, { backgroundColor: "#ef444420" }]}>
              <Text style={[styles.menuIconText, { color: "#ef4444" }]}>
                {busyLogout ? "⏳" : "🚪"}
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
            pressed && styles.menuItemPressed
          ]}
          android_ripple={{ color: "rgba(124,58,237,0.15)" }}
        >
          <View style={styles.menuItemLeft}>
            <View style={[styles.menuIcon, { backgroundColor: ACCENT + "20" }]}>
              <Text style={[styles.menuIconText, { color: ACCENT }]}>🔔</Text>
            </View>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemTitle}>Test notificación (10s)</Text>
              <Text style={styles.menuItemSubtitle}>Programar notificación de prueba</Text>
            </View>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </Pressable>
      </View>
      </ScrollView>

      {/* ---- MODAL JOIN ---- */}
      <Modal visible={joinOpen} transparent animationType="fade" onRequestClose={() => setJoinOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.label, { marginBottom: 8 }]}>
              Escribe el <Text style={{ fontWeight: "900" }}>ID</Text> del workspace para entrar:
            </Text>
            {!!pendingTenantId && (
              <Text style={{ color: SUBTLE, marginBottom: 6 }}>
                ID esperado: <Text style={{ color: TEXT, fontWeight: "900" }}>{pendingTenantId}</Text>
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
                onPress={() => { setJoinOpen(false); setPendingTenantId(null); setJoinIdInput(""); }}
                style={[styles.modalBtn, { backgroundColor: "#374151" }]}
              >
                <Text style={styles.modalTxt}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => pendingTenantId && joinAndEnter(pendingTenantId)}
                disabled={!canConfirmJoin}
                style={[
                  styles.modalBtn,
                  { backgroundColor: canConfirmJoin ? ACCENT : "#5b21b6" },
                ]}
              >
                <Text style={styles.modalTxt}>Unirme y entrar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: BG,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

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
  joinBtn: { backgroundColor: "#22c55e", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  joinTxt: { color: "#fff", fontWeight: "800" },

  actionBtn: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  actionTxt: { color: "white", fontWeight: "800" },

  // Estilos de lista de menú moderna
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
  menuItemPressed: {
    backgroundColor: "rgba(124,58,237,0.08)",
  },
  menuItemDanger: {
    borderBottomWidth: 0,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  menuIconText: {
    fontSize: 20,
    fontWeight: "700",
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    color: TEXT,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 3,
  },
  menuItemSubtitle: {
    color: SUBTLE,
    fontSize: 13,
    lineHeight: 18,
  },
  menuArrow: {
    color: SUBTLE,
    fontSize: 28,
    fontWeight: "300",
    marginLeft: 8,
  },

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
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalTxt: { color: "#fff", fontWeight: "900" },
});