// app/more/index.tsx
import {
  fetchTenants,
  getActiveTenant,
  logout,
  setActiveTenant,
  switchTenant,
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

type TenantItem = { id: string; name?: string; role?: string; is_active?: boolean };

export default function More() {
  const [tenant, setTenant] = useState<string>("demo");
  const [tenants, setTenants] = useState<TenantItem[]>([{ id: "demo", name: "Demo" }]);
  const [busyChip, setBusyChip] = useState<string | null>(null);
  const [busyLogout, setBusyLogout] = useState(false);

  // Discover / join por ID
  const [query, setQuery] = useState("");
  const [discover, setDiscover] = useState<Array<{ id: string; name: string }>>([]);
  const [busySearch, setBusySearch] = useState(false);

  // 🔒 Modal “Unirse por ID” (confirmación de clave)
  const [joinOpen, setJoinOpen] = useState(false);
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [joinIdInput, setJoinIdInput] = useState("");

  useEffect(() => {
    (async () => {
      const localActive = await getActiveTenant();
      setTenant(localActive);
      try {
        const data = await fetchTenants();
        if (data?.items?.length) setTenants(data.items);
        if (data?.active_tenant) setTenant(data.active_tenant);
      } catch (e: any) {
        console.warn("fetchTenants error:", e?.message || e);
      }
    })();
  }, []);

  const onSearch = async () => {
    const q = query.trim();
    if (!q) {
      setDiscover([]);
      return;
    }
    setBusySearch(true);
    try {
      const data = await api.get<{ items: Array<{ id: string; name: string }> }>(
        `/tenants/discover?query=${encodeURIComponent(q)}`
      );
      setDiscover(data.items || []);
    } catch (e: any) {
      Alert.alert("Ups", e?.message || "No se pudo buscar");
    } finally {
      setBusySearch(false);
    }
  };

  // Unirse (auto-join) y entrar directo — se llama solo si la “clave” coincide
  const joinAndEnter = async (tenantId: string) => {
    try {
      await api.post("/tenants/join", { tenant_id: tenantId });
      const res = await switchTenant(tenantId);
      const confirmed = res?.active_tenant || tenantId;
      await setActiveTenant(confirmed);
      setTenant(confirmed);
      fetchTenants().then((d) => d?.items && setTenants(d.items)).catch(() => {});
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
      await setActiveTenant(confirmed);
      setTenant(confirmed);
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
    const active = tenant === item.id || item.is_active;
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
        {item.role ? (
          <Text style={[styles.role, active && styles.roleActive]}>{item.role}</Text>
        ) : null}
      </Pressable>
    );
  };

  const canConfirmJoin = pendingTenantId && joinIdInput.trim() === pendingTenantId;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "Más" }} />

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

      <Pressable
        onPress={() => router.push("/profile" as any)}
        style={({ pressed }) => [
          {
            backgroundColor: CARD,
            borderColor: BORDER,
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            opacity: pressed ? 0.85 : 1,
            alignSelf: "flex-start",
            marginTop: 8,
          },
        ]}
        android_ripple={{ color: "rgba(255,255,255,0.08)" }}
      >
        <Text style={{ color: TEXT, fontWeight: "800" }}>Ver perfil</Text>
      </Pressable>

      {/* ---- ACCIONES ---- */}
      <Pressable
        onPress={() => router.push("/more/workspaces-new")}
        style={[styles.actionBtn, { backgroundColor: "#10b981" }]}
      >
        <Text style={styles.actionTxt}>Nuevo workspace</Text>
      </Pressable>

      <Pressable
        onPress={onLogout}
        disabled={busyLogout}
        style={[styles.actionBtn, { backgroundColor: "#ef4444" }, busyLogout && { opacity: 0.6 }]}
      >
        <Text style={styles.actionTxt}>
          {busyLogout ? "Saliendo…" : "Cerrar sesión"}
        </Text>
      </Pressable>

      {/* ---- Botón de prueba de notificación (10s) ---- */}
      <Pressable
        onPress={testLocalNotif10s}
        style={{ padding: 12, borderRadius: 12, backgroundColor: "#7C3AED", margin: 16 }}
      >
        <Text style={{ color: "#fff", fontWeight: "900" }}>Test notificación (10s)</Text>
      </Pressable>

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
  screen: { flex: 1, backgroundColor: BG, padding: 16 },

  title: { color: TEXT, fontSize: 18, fontWeight: "900", marginBottom: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    marginRight: 8,
    marginBottom: 8,
    minWidth: 120,
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

// // app/more/index.tsx
// import {
//   fetchTenants,
//   getActiveTenant,
//   logout,
//   setActiveTenant,
//   switchTenant,
// } from "@/src/api/auth";
// import { api } from "@/src/api/http";
// import { Stack, router } from "expo-router";
// import { useEffect, useState } from "react";
// import {
//   ActivityIndicator,
//   Alert,
//   Modal,
//   Platform,
//   Pressable,
//   StyleSheet,
//   Text,
//   TextInput,
//   View,
// } from "react-native";

// const BG = "#0b0c10",
//   CARD = "#14151a",
//   BORDER = "#272a33",
//   TEXT = "#e8ecf1",
//   SUBTLE = "#a9b0bd",
//   ACCENT = "#7c3aed";

// type TenantItem = { id: string; name?: string; role?: string; is_active?: boolean };

// export default function More() {
//   const [tenant, setTenant] = useState<string>("demo");
//   const [tenants, setTenants] = useState<TenantItem[]>([{ id: "demo", name: "Demo" }]);
//   const [busyChip, setBusyChip] = useState<string | null>(null);
//   const [busyLogout, setBusyLogout] = useState(false);

//   // Discover / join por ID
//   const [query, setQuery] = useState("");
//   const [discover, setDiscover] = useState<Array<{ id: string; name: string }>>([]);
//   const [busySearch, setBusySearch] = useState(false);

//   // 🔒 Modal “Unirse por ID” (confirmación de clave)
//   const [joinOpen, setJoinOpen] = useState(false);
//   const [pendingTenantId, setPendingTenantId] = useState<string | null>(null); // ID que se intenta unir
//   const [joinIdInput, setJoinIdInput] = useState(""); // lo que escribe el usuario

//   useEffect(() => {
//     (async () => {
//       const localActive = await getActiveTenant();
//       setTenant(localActive);

//       try {
//         const data = await fetchTenants();
//         if (data?.items?.length) setTenants(data.items);
//         if (data?.active_tenant) setTenant(data.active_tenant);
//       } catch (e: any) {
//         console.warn("fetchTenants error:", e?.message || e);
//       }
//     })();
//   }, []);

//   const onSearch = async () => {
//     const q = query.trim();
//     if (!q) {
//       setDiscover([]);
//       return;
//     }
//     setBusySearch(true);
//     try {
//       const data = await api.get<{ items: Array<{ id: string; name: string }> }>(
//         `/tenants/discover?query=${encodeURIComponent(q)}`
//       );
//       setDiscover(data.items || []);
//     } catch (e: any) {
//       Alert.alert("Ups", e?.message || "No se pudo buscar");
//     } finally {
//       setBusySearch(false);
//     }
//   };

//   // Unirse (auto-join) y entrar directo — se llama solo si la “clave” coincide
//   const joinAndEnter = async (tenantId: string) => {
//     try {
//       await api.post("/tenants/join", { tenant_id: tenantId });
//       const res = await switchTenant(tenantId);
//       const confirmed = res?.active_tenant || tenantId;
//       await setActiveTenant(confirmed);
//       setTenant(confirmed);
//       fetchTenants().then((d) => d?.items && setTenants(d.items)).catch(() => {});
//       setJoinOpen(false);
//       setPendingTenantId(null);
//       setJoinIdInput("");
//       router.replace("/");
//     } catch (e: any) {
//       Alert.alert("No se pudo entrar", e?.message || "Verifica el ID o solicita invitación.");
//     }
//   };

//   // Cambiar workspace: si no pertenece → abrir modal para pedir ID
//   const choose = async (t: string) => {
//     if (t === tenant || busyChip) return;
//     setBusyChip(t);
//     const prev = tenant;

//     try {
//       const res = await switchTenant(t);
//       const confirmed = res?.active_tenant || t;
//       await setActiveTenant(confirmed);
//       setTenant(confirmed);
//     } catch (e: any) {
//       const msg = String(e?.message || "");
//       if (msg.includes("forbidden_tenant")) {
//         // 👉 pedir “clave” (ID) antes de unirse
//         setPendingTenantId(t);
//         setJoinIdInput("");        // obliga a escribirla
//         setJoinOpen(true);
//       } else {
//         setTenant(prev);
//         Alert.alert("No se pudo cambiar de workspace", msg || "Intenta de nuevo.");
//       }
//     } finally {
//       setBusyChip(null);
//     }
//   };

//   const onLogout = async () => {
//     if (busyLogout) return;
//     setBusyLogout(true);
//     try {
//       await logout();
//       router.replace("/auth/login");
//     } finally {
//       setBusyLogout(false);
//     }
//   };

//   const Chip = ({ item }: { item: TenantItem }) => {
//     const active = tenant === item.id || item.is_active;
//     const isBusy = busyChip === item.id;
//     return (
//       <Pressable
//         onPress={() => choose(item.id)}
//         disabled={Boolean(busyChip)}
//         style={[
//           styles.chip,
//           active && styles.chipActive,
//           busyChip && !isBusy && { opacity: 0.6 },
//         ]}
//         android_ripple={{ color: "rgba(255,255,255,0.08)" }}
//       >
//         <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
//           <Text style={[styles.chipText, active && styles.chipTextActive]}>
//             {item.name || item.id}
//           </Text>
//           {isBusy && <ActivityIndicator size="small" color={active ? "#fff" : ACCENT} />}
//         </View>
//         {item.role ? (
//           <Text style={[styles.role, active && styles.roleActive]}>{item.role}</Text>
//         ) : null}
//       </Pressable>
//     );
//   };

//   const canConfirmJoin = pendingTenantId && joinIdInput.trim() === pendingTenantId;

//   return (
//     <View style={styles.screen}>
//       <Stack.Screen options={{ title: "Más" }} />

//       {/* ---- TUS WORKSPACES ---- */}
//       <Text style={styles.title}>Tus workspaces</Text>
//       <View style={styles.row}>
//         {tenants.map((it) => (
//           <Chip key={it.id} item={it} />
//         ))}
//       </View>
//       <Text style={styles.hint}>Un toque cambia al instante.</Text>

//       <View style={{ height: 24 }} />

//       {/* ---- DESCUBRIR / ENTRAR POR ID ---- */}
//       <View style={styles.card}>
//         <Text style={styles.label}>Descubrir / entrar por ID</Text>
//         <TextInput
//           value={query}
//           onChangeText={setQuery}
//           onSubmitEditing={onSearch}
//           placeholder="ej: acme"
//           placeholderTextColor={SUBTLE}
//           style={styles.input}
//           autoCapitalize="none"
//           autoCorrect={false}
//         />
//         <Pressable
//           onPress={onSearch}
//           disabled={busySearch}
//           style={[styles.primaryBtn, busySearch && { opacity: 0.6 }]}
//         >
//           <Text style={styles.primaryTxt}>{busySearch ? "Buscando…" : "Buscar"}</Text>
//         </Pressable>

//         {discover.length > 0 && (
//           <View style={{ marginTop: 12, gap: 8 }}>
//             {discover.map((d) => (
//               <View key={d.id} style={styles.resultItem}>
//                 <View>
//                   <Text style={styles.resultTitle}>{d.name || d.id}</Text>
//                   <Text style={styles.resultSub}>ID: {d.id}</Text>
//                 </View>
//                 {/* 🔒 ya no entra directo: abre modal para confirmar escribiendo el ID */}
//                 <Pressable
//                   onPress={() => {
//                     setPendingTenantId(d.id);
//                     setJoinIdInput(""); // obliga a escribirlo
//                     setJoinOpen(true);
//                   }}
//                   style={styles.joinBtn}
//                 >
//                   <Text style={styles.joinTxt}>Entrar</Text>
//                 </Pressable>
//               </View>
//             ))}
//           </View>
//         )}
//       </View>

//       <View style={{ height: 24 }} />

//       {/* ---- ACCIONES ---- */}
//       <Pressable
//         onPress={() => router.push("/more/workspaces-new")}
//         style={[styles.actionBtn, { backgroundColor: "#10b981" }]}
//       >
//         <Text style={styles.actionTxt}>Nuevo workspace</Text>
//       </Pressable>
      

//       <Pressable
//         onPress={onLogout}
//         disabled={busyLogout}
//         style={[styles.actionBtn, { backgroundColor: "#ef4444" }, busyLogout && { opacity: 0.6 }]}
//       >
//         <Text style={styles.actionTxt}>
//           {busyLogout ? "Saliendo…" : "Cerrar sesión"}
//         </Text>
//       </Pressable>

//       {/* ---- MODAL JOIN (SIEMPRE exige escribir el ID exacto) ---- */}
//       <Modal visible={joinOpen} transparent animationType="fade" onRequestClose={() => setJoinOpen(false)}>
//         <View style={styles.modalOverlay}>
//           <View style={styles.modalCard}>
//             <Text style={[styles.label, { marginBottom: 8 }]}>
//               Escribe el <Text style={{ fontWeight: "900" }}>ID</Text> del workspace para entrar:
//             </Text>
//             {!!pendingTenantId && (
//               <Text style={{ color: SUBTLE, marginBottom: 6 }}>
//                 ID esperado: <Text style={{ color: TEXT, fontWeight: "900" }}>{pendingTenantId}</Text>
//               </Text>
//             )}
//             <TextInput
//               value={joinIdInput}
//               onChangeText={setJoinIdInput}
//               placeholder="ej: acme"
//               placeholderTextColor={SUBTLE}
//               style={styles.input}
//               autoCapitalize="none"
//               autoCorrect={false}
//             />
//             <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
//               <Pressable
//                 onPress={() => { setJoinOpen(false); setPendingTenantId(null); setJoinIdInput(""); }}
//                 style={[styles.modalBtn, { backgroundColor: "#374151" }]}
//               >
//                 <Text style={styles.modalTxt}>Cancelar</Text>
//               </Pressable>
//               <Pressable
//                 onPress={() => pendingTenantId && joinAndEnter(pendingTenantId)}
//                 disabled={!canConfirmJoin}
//                 style={[
//                   styles.modalBtn,
//                   { backgroundColor: canConfirmJoin ? ACCENT : "#5b21b6" },
//                 ]}
//               >
//                 <Text style={styles.modalTxt}>Unirme y entrar</Text>
//               </Pressable>
//             </View>
//           </View>
//         </View>
//       </Modal>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG, padding: 16 },

//   title: { color: TEXT, fontSize: 18, fontWeight: "900", marginBottom: 12 },
//   row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

//   chip: {
//     paddingHorizontal: 12,
//     paddingVertical: 8,
//     borderRadius: 12,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: CARD,
//     marginRight: 8,
//     marginBottom: 8,
//     minWidth: 120,
//   },
//   chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
//   chipText: { color: TEXT, fontWeight: "700" },
//   chipTextActive: { color: "#fff" },
//   role: { color: SUBTLE, fontSize: 12, marginTop: 2 },
//   roleActive: { color: "#f5f5f5" },

//   hint: { color: SUBTLE, marginTop: 6 },

//   card: {
//     backgroundColor: CARD,
//     borderColor: BORDER,
//     borderWidth: 1,
//     borderRadius: 14,
//     padding: 14,
//   },
//   label: { color: TEXT, fontWeight: "800" },
//   input: {
//     marginTop: 8,
//     backgroundColor: "#0f1015",
//     color: TEXT,
//     borderRadius: 10,
//     borderWidth: 1,
//     borderColor: BORDER,
//     paddingHorizontal: 12,
//     paddingVertical: Platform.select({ ios: 12, android: 8, default: 10 }),
//   },

//   primaryBtn: {
//     marginTop: 12,
//     backgroundColor: ACCENT,
//     borderRadius: 12,
//     paddingVertical: 12,
//     alignItems: "center",
//   },
//   primaryTxt: { color: "#fff", fontWeight: "900" },

//   resultItem: {
//     backgroundColor: "#111216",
//     borderWidth: 1,
//     borderColor: BORDER,
//     borderRadius: 12,
//     padding: 12,
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//   },
//   resultTitle: { color: TEXT, fontWeight: "800" },
//   resultSub: { color: SUBTLE, fontSize: 12, marginTop: 2 },
//   joinBtn: { backgroundColor: "#22c55e", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
//   joinTxt: { color: "#fff", fontWeight: "800" },

//   actionBtn: {
//     alignSelf: "flex-start",
//     borderRadius: 12,
//     paddingHorizontal: 14,
//     paddingVertical: 10,
//     marginTop: 12,
//   },
//   actionTxt: { color: "white", fontWeight: "800" },

//   modalOverlay: {
//     flex: 1,
//     backgroundColor: "rgba(0,0,0,0.5)",
//     alignItems: "center",
//     justifyContent: "center",
//     padding: 16,
//   },
//   modalCard: {
//     width: "100%",
//     maxWidth: 480,
//     backgroundColor: CARD,
//     borderColor: BORDER,
//     borderWidth: 1,
//     borderRadius: 14,
//     padding: 16,
//   },
//   modalBtn: {
//     flex: 1,
//     borderRadius: 10,
//     paddingVertical: 12,
//     alignItems: "center",
//   },
//   modalTxt: { color: "#fff", fontWeight: "900" },
// });


// // app/more/index.tsx
// import {
//   fetchTenants,
//   getActiveTenant,
//   logout,
//   setActiveTenant,
//   switchTenant,
// } from "@/src/api/auth";
// import { Stack, router } from "expo-router";
// import { useEffect, useState } from "react";
// import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

// const BG = "#0b0c10",
//   CARD = "#14151a",
//   BORDER = "#272a33",
//   TEXT = "#e8ecf1",
//   SUBTLE = "#a9b0bd",
//   ACCENT = "#7c3aed";

// type TenantItem = { id: string; name?: string; role?: string; is_active?: boolean };

// export default function More() {
//   const [tenant, setTenant] = useState<string>("demo");
//   const [tenants, setTenants] = useState<TenantItem[]>([{ id: "demo", name: "Demo" }]);
//   const [busy, setBusy] = useState<"switch" | "logout" | null>(null);

//   // Cargar tenant activo + lista desde /me/tenants
//   useEffect(() => {
//     (async () => {
//       const localActive = await getActiveTenant();
//       setTenant(localActive);

//       try {
//         const data = await fetchTenants(); // { items, active_tenant? }
//         if (data?.items?.length) setTenants(data.items);
//         if (data?.active_tenant) setTenant(data.active_tenant);
//       } catch (e: any) {
//         // si falla (semillas/permisos), mantenemos fallback "demo"
//         console.warn("fetchTenants error:", e?.message || e);
//       }
//     })();
//   }, []);

//   const choose = async (t: string) => {
//     if (t === tenant || busy) return;
//     setBusy("switch");
//     const prev = tenant;
//     setTenant(t); // optimistic

//     try {
//       const res = await switchTenant(t); // { token, active_tenant }
//       const confirmed = res?.active_tenant || t;
//       await setActiveTenant(confirmed);
//       setTenant(confirmed);
//     } catch (e: any) {
//       setTenant(prev); // rollback
//       Alert.alert("No se pudo cambiar de workspace", e?.message ?? "Intenta de nuevo.");
//     } finally {
//       setBusy(null);
//     }
//   };

//   const onLogout = async () => {
//     if (busy) return;
//     setBusy("logout");
//     try {
//       await logout(); // limpia token + tenant
//       router.replace("/auth/login");
//     } finally {
//       setBusy(null);
//     }
//   };

//   return (
//     <View style={styles.screen}>
//       <Stack.Screen options={{ title: "Más" }} />

//       <Text style={styles.title}>Workspace activo</Text>

//       <View style={styles.row}>
//         {tenants.map((it) => {
//           const active = tenant === it.id || it.is_active;
//           return (
//             <Pressable
//               key={it.id}
//               onPress={() => choose(it.id)}
//               disabled={busy === "switch"}
//               style={[
//                 styles.chip,
//                 active && styles.chipActive,
//                 busy === "switch" && { opacity: 0.6 },
//               ]}
//               android_ripple={{ color: "rgba(255,255,255,0.08)" }}
//             >
//               <Text style={[styles.chipText, active && styles.chipTextActive]}>
//                 {it.name || it.id}
//               </Text>
//               {it.role ? (
//                 <Text style={[styles.role, active && styles.roleActive]}>
//                   {it.role}
//                 </Text>
//               ) : null}
//             </Pressable>
//           );
//         })}
//       </View>

//       <Text style={styles.hint}>
//         Todas las listas y detalles se filtran por este workspace.
//       </Text>

//       <View style={{ height: 24 }} />

//       <Pressable
//         onPress={onLogout}
//         disabled={busy === "logout"}
//         style={[styles.logoutBtn, busy === "logout" && { opacity: 0.6 }]}
//       >
//         <Text style={styles.logoutTxt}>
//           {busy === "logout" ? "Saliendo…" : "Cerrar sesión"}
//         </Text>
//       </Pressable>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG, padding: 16 },
//   title: { color: TEXT, fontSize: 18, fontWeight: "900", marginBottom: 12 },
//   row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
//   chip: {
//     paddingHorizontal: 12,
//     paddingVertical: 8,
//     borderRadius: 12,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: CARD,
//     marginRight: 8,
//     marginBottom: 8,
//   },
//   chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
//   chipText: { color: TEXT, fontWeight: "700" },
//   chipTextActive: { color: "#fff" },
//   role: { color: SUBTLE, fontSize: 12, marginTop: 2 },
//   roleActive: { color: "#f5f5f5" },
//   hint: { color: SUBTLE, marginTop: 12 },

//   logoutBtn: {
//     alignSelf: "flex-start",
//     backgroundColor: "#ef4444",
//     borderRadius: 12,
//     paddingHorizontal: 14,
//     paddingVertical: 10,
//   },
//   logoutTxt: { color: "white", fontWeight: "800" },
// });


// // app/more/index.tsx
// import {
//   authFetch,
//   getActiveTenant,
//   logout,
//   setActiveTenant,
// } from "@/src/api/auth";
// import { Stack, router } from "expo-router";
// import React, { useEffect, useState } from "react";
// import { Pressable, StyleSheet, Text, View } from "react-native";

// const BG = "#0b0c10",
//   CARD = "#14151a",
//   BORDER = "#272a33",
//   TEXT = "#e8ecf1",
//   SUBTLE = "#a9b0bd",
//   ACCENT = "#7c3aed";

// type TenantItem = { id: string; name?: string; role?: string };

// export default function More() {
//   const [tenant, setTenant] = useState<string>("demo");
//   const [tenants, setTenants] = useState<TenantItem[]>([{ id: "demo", name: "Demo" }]);
//   const [busy, setBusy] = useState<"switch" | "logout" | null>(null);

//   // Cargar tenant activo y lista de tenants del usuario
//   useEffect(() => {
//     (async () => {
//       const t = await getActiveTenant();
//       setTenant(t);

//       try {
//         const data = await authFetch<{ items: TenantItem[] }>("/tenants", { method: "GET" });
//         if (data?.items?.length) setTenants(data.items);
//       } catch {
//         // si falla (por permisos o seed), nos quedamos con el fallback
//       }
//     })();
//   }, []);

//   const choose = async (t: string) => {
//     if (t === tenant || busy) return;       // nada que hacer
//     setBusy("switch");
//     const prev = tenant;
//     setTenant(t);                           // optimistic

//     try {
//       await authFetch("/tenants/switch", {
//         method: "POST",
//         body: JSON.stringify({ tenant_id: t }),
//       });
//       await setActiveTenant(t);             // persistir para próximas requests
//     } catch {
//       setTenant(prev);                      // rollback si backend niega
//     } finally {
//       setBusy(null);
//     }
//   };

//   const onLogout = async () => {
//     if (busy) return;
//     setBusy("logout");
//     try {
//       await logout();                       // limpia token + tenant
//       router.replace("/auth/login");
//     } finally {
//       setBusy(null);
//     }
//   };

//   return (
//     <View style={styles.screen}>
//       <Stack.Screen options={{ title: "Más" }} />

//       <Text style={styles.title}>Empresa activa</Text>

//       <View style={styles.row}>
//         {tenants.map((it) => {
//           const active = tenant === it.id;
//           return (
//             <Pressable
//               key={it.id}
//               onPress={() => choose(it.id)}
//               disabled={busy === "switch"}
//               style={[styles.chip, active && styles.chipActive, busy === "switch" && { opacity: 0.6 }]}
//               android_ripple={{ color: "rgba(255,255,255,0.08)" }}
//             >
//               <Text style={[styles.chipText, active && styles.chipTextActive]}>
//                 {it.name || it.id}
//               </Text>
//             </Pressable>
//           );
//         })}
//       </View>

//       <Text style={styles.hint}>
//         Todas las listas y detalles se filtran por esta empresa.
//       </Text>

//       <View style={{ height: 24 }} />

//       <Pressable onPress={onLogout} disabled={busy === "logout"} style={[styles.logoutBtn, busy === "logout" && { opacity: 0.6 }]}>
//         <Text style={styles.logoutTxt}>{busy === "logout" ? "Saliendo…" : "Cerrar sesión"}</Text>
//       </Pressable>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG, padding: 16 },
//   title: { color: TEXT, fontSize: 18, fontWeight: "900", marginBottom: 12 },
//   row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
//   chip: {
//     paddingHorizontal: 12,
//     paddingVertical: 8,
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: CARD,
//   },
//   chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
//   chipText: { color: TEXT, fontWeight: "700" },
//   chipTextActive: { color: "#fff" },
//   hint: { color: SUBTLE, marginTop: 12 },

//   logoutBtn: {
//     alignSelf: "flex-start",
//     backgroundColor: "#ef4444",
//     borderRadius: 12,
//     paddingHorizontal: 14,
//     paddingVertical: 10,
//   },
//   logoutTxt: { color: "white", fontWeight: "800" },
// });
