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

const BG = "#f5f6fa",
  CARD = "#ffffff",
  BORDER = "#e7e9f0",
  TEXT = "#202536",
  SUBTLE = "#737b8e",
  ACCENT = "#7551c8";

(Notifications as any).setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
} as any);

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
  const [tenants, setTenants] = useState<TenantItem[]>([
    { id: "demo", name: "Demo" },
  ]);
  const [busyChip, setBusyChip] = useState<string | null>(null);
  const [busyLogout, setBusyLogout] = useState(false);

  // Rol GLOBAL actual (owner/admin/member)
  const [currentRole, setCurrentRole] = useState<
    "owner" | "admin" | "member" | null
  >(null);
  const [loadingRole, setLoadingRole] = useState(true);

  const [query, setQuery] = useState("");
  const [discover, setDiscover] = useState<
    Array<{ id: string; name: string; owner_name?: string; owner_email?: string }>
  >([]);
  const [busySearch, setBusySearch] = useState(false);

  // Modal para UNIRSE por primera vez (verificación de ID)
  const [joinOpen, setJoinOpen] = useState(false);
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [joinIdInput, setJoinIdInput] = useState("");

  const appState = useRef<AppStateStatus>(AppState.currentState);

  /** ------------------------------------------
   * Rol global actual
   * ------------------------------------------ */
  const fetchCurrentRole = useCallback(async () => {
    setLoadingRole(true);
    try {
      const url = `/tenants/role?_=${Date.now()}`;
      const res = await api.get<{ tenant_id: string | null; role: string | null }>(
        url
      );
      const r = (res?.role || "").toLowerCase() as
        | "owner"
        | "admin"
        | "member"
        | "";
      setCurrentRole(r || null);
      console.log("🔑 Rol actualizado:", r || "sin rol");
    } catch (err) {
      console.warn("⚠️ No se pudo obtener rol actual:", err);
      setCurrentRole(null);
    } finally {
      setLoadingRole(false);
    }
  }, []);

  const isAdminOrOwner = currentRole === "owner" || currentRole === "admin";

  /** ------------------------------------------
   * Cargar workspaces + rol
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
   * Búsqueda de workspaces
   * ------------------------------------------ */
  const onSearch = async () => {
    const raw = query.trim();

    console.log("🔍 onSearch called with raw query:", raw);

    if (!raw) {
      console.log("⚠️ Query empty, clearing results");
      setDiscover([]);
      return;
    }

    // 👇 normalizamos para que sea case-insensitive
    const q = raw.toLowerCase();

    setBusySearch(true);
    try {
      console.log("🌐 Fetching workspaces with query:", q);
      const data = await api.get<{
        items: Array<{
          id: string;
          name: string;
          owner_name?: string;
          owner_email?: string;
        }>;
      }>(`/tenants/discover?query=${encodeURIComponent(q)}&_=${Date.now()}`);

      console.log("✅ Search results:", data);
      setDiscover(data?.items || []);

      if (!data?.items || data.items.length === 0) {
        Alert.alert("Sin resultados", `No se encontraron workspaces con "${raw}"`);
      }
    } catch (e: any) {
      console.error("❌ Search error:", e);
      Alert.alert("Ups", e?.message || "No se pudo buscar");
    } finally {
      setBusySearch(false);
    }
  };


  /** ------------------------------------------
   * Hacer switch REAL de workspace
   * (solo para workspaces donde YA soy miembro)
   * ------------------------------------------ */
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
      console.warn("❌ Error en performSwitch:", msg);
      setTenant(prev);
      Alert.alert(
        "No se pudo cambiar de workspace",
        msg || "Intenta de nuevo."
      );
    } finally {
      setBusyChip(null);
    }
  };

  /** ------------------------------------------
   * Unirse por primera vez (con ID verificado)
   * ------------------------------------------ */
  const joinWorkspace = async (tenantId: string) => {
    try {
      const res = await api.post<{
        ok: boolean;
        joined?: boolean;
        tenant?: { id: string; name: string };
        role?: string;
      }>("/tenants/join", { tenant_id: tenantId });

      if (!res?.ok) throw new Error("join_failed");

      const sw = await switchTenant(tenantId);
      const confirmed = (sw as any)?.active_tenant || tenantId;
      setTenant(confirmed);

      await fetchCurrentRole();
      await refreshTenantsAndRole();

      setJoinOpen(false);
      setPendingTenantId(null);
      setJoinIdInput("");
      setDiscover([]);
      setQuery("");
    } catch (e: any) {
      console.error("❌ joinWorkspace error:", e);
      Alert.alert(
        "No se pudo entrar",
        e?.message || "Verifica el ID del workspace."
      );
    } finally {
      setBusyChip(null);
    }
  };

  /** ------------------------------------------
   * Cambiar workspace desde los CHIPS
   * (aquí NUNCA se pide ID, ya eres miembro)
   * ------------------------------------------ */
  const choose = async (t: string) => {
    if (t === tenant || busyChip) return;
    await performSwitch(t);
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
   * Eliminar workspace (solo admin/owner globales)
   */
  const handleDeleteWorkspace = async (workspace: TenantItem) => {
    console.log("🗑️ handleDeleteWorkspace called for:", workspace.id, workspace.name);

    if (!isAdminOrOwner) {
      console.log("❌ Permisos insuficientes - Rol global:", currentRole);
      Alert.alert(
        "Permisos insuficientes",
        "Solo usuarios con rol admin u owner pueden eliminar workspaces"
      );
      return;
    }

    const confirmDelete = () =>
      new Promise<boolean>((resolve) => {
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
    if (!confirmed) return;

    const workspaceId = workspace.id;
    const workspaceName = workspace.name || workspace.id;

    try {
      console.log("🔄 Eliminando workspace:", workspaceId);
      setBusyChip(workspaceId);

      const result = await deleteTenant(workspaceId);
      console.log("✅ Workspace eliminado del servidor:", result);

      if (tenant === workspaceId) {
        console.log("🔄 Workspace activo eliminado, cambiando...");
        const remaining = tenants.filter((t) => t.id !== workspaceId);
        if (remaining.length > 0) {
          setTenant(remaining[0].id);
          try {
            await AsyncStorage.setItem("auth.tenant", remaining[0].id);
          } catch (e) {
            console.warn("No se pudo actualizar AsyncStorage:", e);
          }
        } else {
          setTenant("demo");
          try {
            await AsyncStorage.setItem("auth.tenant", "demo");
          } catch (e) {
            console.warn("No se pudo actualizar AsyncStorage:", e);
          }
        }
      }

      setTenants((prev) => prev.filter((t) => t.id !== workspaceId));

      setTimeout(() => {
        refreshTenantsAndRole().catch((e) => {
          console.warn("Error recargando del servidor:", e);
        });
      }, 100);

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

        {canDelete && item.id !== "demo" && (
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              handleDeleteWorkspace(item);
            }}
            disabled={Boolean(busyChip)}
            style={[styles.deleteBtn, busyChip && { opacity: 0.4 }]}
            android_ripple={{ color: "rgba(239,68,68,0.3)", borderless: true }}
          >
            <Text style={styles.deleteBtnText}>🗑️</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const canConfirmJoin =
    !!pendingTenantId && joinIdInput.trim() === pendingTenantId;

  return (
    <View style={styles.screen}>
            <Stack.Screen options={{ title: "Configuración" }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
        bounces
        alwaysBounceVertical
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

        {loadingRole && (
          <View
            style={{
              marginTop: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
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
            placeholder="Nombre o ID compartido"
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
                    <Text style={styles.resultTitle}>{d.name || "Workspace"}</Text>
                    {/* 🔒 Ya NO mostramos el ID */}
                    <Text style={[styles.resultSub, { marginTop: 2 }]}>
                      Creador: {d.owner_name || d.owner_email || "Desconocido"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={async () => {
                      const alreadyMember = tenants.some((t) => t.id === d.id);

                      if (alreadyMember) {
                        // ✅ Ya soy miembro: entrar sin pedir ID
                        setBusyChip(d.id);
                        await performSwitch(d.id);
                      } else {
                        // 🧩 Primera vez: pedir ID en el modal (pero sin mostrarlo)
                        setPendingTenantId(d.id);
                        setJoinIdInput("");
                        setJoinOpen(true);
                      }
                    }}
                    disabled={busyChip === d.id}
                    style={[
                      styles.joinBtn,
                      busyChip === d.id && { opacity: 0.5 },
                    ]}
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
      </ScrollView>

      {/* 🔒 MODAL: pedir ID solo la PRIMERA vez que entras a un workspace */}
      <Modal
        visible={joinOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setJoinOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.label, { marginBottom: 8 }]}>
              Escribe el ID del workspace que te compartieron para entrar por
              primera vez:
            </Text>

            {/* 🔒 Ya no mostramos el ID esperado, solo el mensaje genérico */}
            <Text style={{ color: SUBTLE, marginBottom: 6, fontSize: 12 }}>
              Debe coincidir exactamente con el ID que te envió el administrador.
            </Text>

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
                style={[styles.modalBtn, styles.modalCancel]}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => pendingTenantId && joinWorkspace(pendingTenantId)}
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
    width: "100%",
    maxWidth: 1200,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 48,
  },
  title: {
    color: TEXT,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  chip: {
    minWidth: 210,
    maxWidth: "100%",
    minHeight: 90,
    paddingLeft: 16,
    paddingRight: 64,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: "#f0ebfb",
    borderColor: "#b49bdc",
  },
  chipText: {
    color: TEXT,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    flexShrink: 1,
  },
  chipTextActive: {
    color: "#6541b4",
  },
  role: {
    color: SUBTLE,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 5,
    flexShrink: 1,
  },
  roleActive: {
    color: "#7a6597",
  },
  hint: {
    color: SUBTLE,
    fontSize: 12,
    lineHeight: 20,
    marginTop: 12,
  },
  card: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    minWidth: 0,
  },
  label: {
    color: TEXT,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "700",
  },
  input: {
    marginTop: 10,
    width: "100%",
    minWidth: 0,
    minHeight: 46,
    backgroundColor: "#ffffff",
    color: TEXT,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce0e9",
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14,
  },
  primaryBtn: {
    marginTop: 12,
    minHeight: 44,
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryTxt: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  resultItem: {
    backgroundColor: "#fafbfe",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  resultTitle: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "600",
  },
  resultSub: {
    color: SUBTLE,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 3,
  },
  joinBtn: {
    minHeight: 42,
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  joinTxt: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  menuList: {
    marginTop: 4,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  menuItem: {
    minHeight: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 10,
  },
  menuItemPressed: {
    backgroundColor: "#f7f4fc",
  },
  menuItemDanger: {
    borderBottomWidth: 0,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  menuIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  menuIconText: {
    fontSize: 11,
    fontWeight: "700",
  },
  menuItemContent: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  menuItemTitle: {
    color: TEXT,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  menuItemSubtitle: {
    color: SUBTLE,
    fontSize: 12,
    lineHeight: 20,
  },
  menuArrow: {
    color: "#9299a7",
    fontSize: 25,
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(32,37,54,0.35)",
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
    padding: 22,
  },
  modalBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTxt: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  modalCancel: {
    backgroundColor: "#f5f6fa",
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalCancelText: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "600",
  },
  deleteBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#f3d6db",
    zIndex: 1,
  },
  deleteBtnText: {
    fontSize: 16,
  },
});