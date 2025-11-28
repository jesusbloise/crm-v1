// app/tasks/index.tsx
import { listActivities, type Activity } from "@/src/api/activities";
import {
  fetchTenants,
  getActiveTenant,
  switchTenant,
} from "@/src/api/auth";
import { api } from "@/src/api/http";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/* 🎨 Paleta */
const BG = "#0F1115";
const CARD = "#171923";
const BORDER = "#2B3140";
const TEXT = "#F3F4F6";
const SUBTLE = "#A4ADBD";
const PRIMARY = "#7C3AED";
const SUCCESS = "#16a34a";

/* Maestro de completadas locales */
const MASTER_COMPLETED_KEY = "completedActivities:v1:all";
/* Maestro de EN PROCESO locales */
const MASTER_INPROGRESS_KEY = "inProgressActivities:v1:all";

type Filter = "all" | "open" | "done" | "canceled";

type ActivityWithCreator = Activity & {
  created_by?: string | null; // ID del creador (para filtros)
  created_by_name?: string | null;
  created_by_email?: string | null;
  assigned_to_name?: string | null;
  assigned_to_2?: string | null;
  assigned_to_2_name?: string | null;
};

type MemberChip = {
  id: string;
  label: string; // lo usaremos para buscar en los nombres
};

/** 👉 Chips que ve el ADMIN para filtrar por nombre (texto) */
const MEMBERS: MemberChip[] = [
  { id: "all", label: "Todos" },
  { id: "cata", label: "cata" },
  { id: "jesus", label: "jesus" },
  { id: "luisa", label: "luisa" },
  { id: "ramon", label: "ramon" },
];

type TenantItem = {
  id: string;
  name?: string;
};

export default function TasksList() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");

  const [completedMaster, setCompletedMaster] = useState<Set<string>>(new Set());
  const [inProgressMaster, setInProgressMaster] = useState<Set<string>>(
    new Set()
  );

  // 🔑 Rol global + workspaces para pestañas de WS (solo admin/owner)
  const [currentRole, setCurrentRole] = useState<
    "owner" | "admin" | "member" | null
  >(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [activeTenant, setActiveTenant] = useState<string | null>(null);
  const [busyWs, setBusyWs] = useState<string | null>(null);

  const isAdminOrOwner = currentRole === "owner" || currentRole === "admin";

  // 🔁 Carga maestro de COMPLETADAS
  const loadCompletedMaster = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MASTER_COMPLETED_KEY);
      setCompletedMaster(new Set<string>(raw ? JSON.parse(raw) : []));
    } catch {
      setCompletedMaster(new Set());
    }
  }, []);

  // 🔁 Carga maestro de EN PROCESO
  const loadInProgressMaster = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MASTER_INPROGRESS_KEY);
      setInProgressMaster(new Set<string>(raw ? JSON.parse(raw) : []));
    } catch {
      setInProgressMaster(new Set());
    }
  }, []);

  // 🔁 Carga rol y workspaces
  const loadRoleAndTenants = useCallback(async () => {
    setLoadingRole(true);
    try {
      // Rol global actual
      const resRole = await api.get<{
        tenant_id: string | null;
        role: string | null;
      }>("/tenants/role");
      const r = (resRole?.role || "").toLowerCase() as
        | "owner"
        | "admin"
        | "member"
        | "";
      setCurrentRole(r || null);
    } catch (e) {
      console.warn("⚠️ No se pudo obtener rol actual:", e);
      setCurrentRole(null);
    } finally {
      setLoadingRole(false);
    }

    try {
      const localActive = await getActiveTenant();
      if (localActive) setActiveTenant(localActive);

      const data = await fetchTenants();
      if (data?.items?.length) {
        setTenants(
          data.items.map((t) => ({
            id: t.id,
            name: t.name,
          }))
        );
      }
      if (data?.active_tenant) {
        setActiveTenant(data.active_tenant);
      }
    } catch (e) {
      console.warn("⚠️ No se pudo obtener lista de workspaces:", e);
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    loadCompletedMaster();
    loadInProgressMaster();
    loadRoleAndTenants();
  }, [loadCompletedMaster, loadInProgressMaster, loadRoleAndTenants]);

  // Y en cada focus (por si marcaste en otra pantalla o cambiaste ws)
  useFocusEffect(
    useCallback(() => {
      loadCompletedMaster();
      loadInProgressMaster();
      loadRoleAndTenants();
    }, [loadCompletedMaster, loadInProgressMaster, loadRoleAndTenants])
  );

  // 🔑 Trae TODAS las actividades (del workspace activo, backend ya filtra por usuario según rol)
  const q = useQuery<ActivityWithCreator[]>({
    queryKey: ["activities-all"],
    queryFn: () => listActivities() as Promise<ActivityWithCreator[]>,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const onRefresh = useCallback(() => {
    loadCompletedMaster();
    loadInProgressMaster();
    q.refetch();
  }, [q, loadCompletedMaster, loadInProgressMaster]);

  const data = useMemo(() => {
    let items: ActivityWithCreator[] = (q.data ?? [])
      .slice()
      .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));

    // 1) Filtro por estado
    items = items.filter((a) => {
      const isDoneUI =
        a.status === "done" || completedMaster.has(a.id as string);
      const isInProgressUI = !isDoneUI && inProgressMaster.has(a.id as string);

      switch (filter) {
        case "open":
          return !isDoneUI && !isInProgressUI; // abiertas
        case "done":
          return isDoneUI;
        case "canceled":
          return a.status === "canceled";
        case "all":
        default:
          return true;
      }
    });

    // 2) Filtro por NOMBRE (chips) — SOLO si admin/owner
    if (assigneeFilter !== "all" && isAdminOrOwner) {
      const selected = MEMBERS.find((m) => m.id === assigneeFilter);
      if (selected) {
        const term = selected.label.toLowerCase();

        items = items.filter((a) => {
          const created = (a.created_by_name || "").toLowerCase();
          const assigned1 = (a.assigned_to_name || "").toLowerCase();
          const assigned2 = (a.assigned_to_2_name || "").toLowerCase();

          return (
            created.includes(term) ||
            assigned1.includes(term) ||
            assigned2.includes(term)
          );
        });
      }
    }

    // 3) Filtro por texto libre (título, tipo, creador, cualquiera de los dos asignados)
    const termText = search.trim().toLowerCase();
    if (termText) {
      items = items.filter((a) => {
        const title = (a.title || "").toLowerCase();
        const type = (a.type || "").toLowerCase();
        const created = (a.created_by_name || "").toLowerCase();
        const assigned1 = (a.assigned_to_name || "").toLowerCase();
        const assigned2 = (a.assigned_to_2_name || "").toLowerCase();

        return (
          title.includes(termText) ||
          type.includes(termText) ||
          created.includes(termText) ||
          assigned1.includes(termText) ||
          assigned2.includes(termText)
        );
      });
    }

    return items;
  }, [
    q.data,
    filter,
    search,
    assigneeFilter,
    completedMaster,
    inProgressMaster,
    isAdminOrOwner,
  ]);

  // 👉 Cambiar de workspace (solo admin/owner ve estas pestañas)
  const onSelectWorkspace = useCallback(
    async (tenantId: string) => {
      if (!isAdminOrOwner) return;
      if (busyWs || tenantId === activeTenant) return;

      setBusyWs(tenantId);
      try {
        const res = await switchTenant(tenantId);
        const confirmed = (res as any)?.active_tenant || tenantId;
        setActiveTenant(confirmed);
        await q.refetch(); // recarga actividades del nuevo ws
      } catch (e) {
        console.warn("❌ Error al cambiar de workspace:", e);
      } finally {
        setBusyWs(null);
      }
    },
    [isAdminOrOwner, busyWs, activeTenant, q]
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Actividades",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
      <View style={styles.screen}>
        {/* Filtros de estado + Nueva */}
        <View style={styles.filters}>
          {(["all", "open", "done", "canceled"] as Filter[]).map((f) => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {labelFilter(f)}
                </Text>
              </Pressable>
            );
          })}

          <Link href="/tasks/new" asChild>
            <Pressable style={styles.newBtn} accessibilityRole="button">
              <Text style={styles.newBtnText}>＋ Nueva</Text>
            </Pressable>
          </Link>
        </View>

        {/* 🔍 Buscador general */}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por título, usuario, cliente..."
          placeholderTextColor={SUBTLE}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* 👤 Filtros por usuario (solo admin/owner) */}
        {isAdminOrOwner && (
          <View style={styles.membersRow}>
            {MEMBERS.map((m) => {
              const active = assigneeFilter === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setAssigneeFilter(m.id)}
                  style={[
                    styles.memberChip,
                    active && styles.memberChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.memberChipText,
                      active && styles.memberChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* 🌐 Pestañas de Workspaces SOLO para admin/owner */}
        {isAdminOrOwner && tenants.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.wsLabel}>Workspaces</Text>
            <View style={styles.wsRow}>
              {tenants.map((t) => {
                const active = activeTenant === t.id;
                const busy = busyWs === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => onSelectWorkspace(t.id)}
                    style={[
                      styles.wsChip,
                      active && styles.wsChipActive,
                      busy && { opacity: 0.5 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.wsChipText,
                        active && styles.wsChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {t.name || t.id}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {loadingRole && (
          <View style={{ marginTop: 6 }}>
            <Text style={{ color: SUBTLE, fontSize: 11 }}>
              Verificando permisos…
            </Text>
          </View>
        )}

        {/* Lista de actividades */}
        {q.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={PRIMARY} />
            <Text style={styles.subtle}>Cargando actividades…</Text>
          </View>
        ) : q.isError ? (
          <Text style={{ color: "#fecaca" }}>
            Error: {String((q.error as any)?.message || q.error)}
          </Text>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={q.isFetching}
                onRefresh={onRefresh}
              />
            }
            ListEmptyComponent={
              <Text style={styles.subtle}>No hay actividades</Text>
            }
            renderItem={({ item }) => (
              <TaskCard
                item={item}
                completedMaster={completedMaster}
                inProgressMaster={inProgressMaster}
              />
            )}
            contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
          />
        )}
      </View>
    </>
  );
}

function TaskCard({
  item,
  completedMaster,
  inProgressMaster,
}: {
  item: ActivityWithCreator;
  completedMaster: Set<string>;
  inProgressMaster: Set<string>;
}) {
  const isDoneUI = item.status === "done" || completedMaster.has(item.id);
  const isInProgressUI = !isDoneUI && inProgressMaster.has(item.id);

  const statusLabel = isDoneUI
    ? "Realizada"
    : isInProgressUI
    ? "En proceso"
    : "Abierta";

  const createdByLabel = item.created_by_name
    ? `por ${item.created_by_name}`
    : "";

  // 👇 Construimos hasta 2 nombres para el resumen
  const assignedNames: string[] = [];

  if (item.assigned_to_name) {
    assignedNames.push(item.assigned_to_name);
  } else if (item.assigned_to) {
    assignedNames.push(String(item.assigned_to));
  }

  if (item.assigned_to_2_name) {
    assignedNames.push(item.assigned_to_2_name);
  } else if ((item as any).assigned_to_2) {
    assignedNames.push(String((item as any).assigned_to_2));
  }

  const assignedInfo =
    assignedNames.length === 0
      ? " · sin asignar"
      : assignedNames.length === 1
      ? ` · asignada a ${assignedNames[0]}`
      : ` · asignada a ${assignedNames[0]} y ${assignedNames[1]}`;

  const createdLabel =
    item.created_at != null
      ? ` · creada el ${formatDate(item.created_at as any)}`
      : "";

  return (
    <Link href={{ pathname: "/tasks/[id]", params: { id: item.id } }} asChild>
      <Pressable accessibilityRole="link" hitSlop={8}>
        <View
          style={[
            styles.row,
            isDoneUI && styles.rowDone,
            !isDoneUI && isInProgressUI && styles.rowInProgress,
          ]}
        >
          <Text
            style={[
              styles.title,
              isDoneUI && styles.titleDone,
              !isDoneUI && isInProgressUI && styles.titleInProgress,
            ]}
            numberOfLines={2}
          >
            {iconByType(item.type)} {item.title}
          </Text>

          <Text
            style={[
              styles.sub,
              isDoneUI && styles.subDone,
              !isDoneUI && isInProgressUI && styles.subInProgress,
            ]}
            numberOfLines={3}
          >
            {(item.type || "task") +
              " · " +
              statusLabel +
              (createdByLabel ? ` · ${createdByLabel}` : "") +
              assignedInfo +
              createdLabel +
              (isDoneUI ? " · tarea completada" : "")}
          </Text>

          {isDoneUI && (
            <View style={styles.badgeDone}>
              <Text style={styles.badgeDoneText}>✔ Tarea completada</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

function labelFilter(f: Filter) {
  switch (f) {
    case "all":
      return "Todas";
    case "open":
      return "Abiertas";
    case "done":
      return "Hechas";
    case "canceled":
      return "Canceladas";
  }
}

function iconByType(t: Activity["type"]) {
  if (t === "call") return "📞";
  if (t === "meeting") return "📅";
  if (t === "note") return "📝";
  return "✅";
}

function formatDate(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const dt = new Date(n);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString();
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
    padding: 16,
    gap: 12,
  },
  filters: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#1a1b2a",
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: {
    backgroundColor: "rgba(124,58,237,0.20)",
    borderColor: PRIMARY,
  },
  chipText: { color: SUBTLE, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#E9D5FF" },
  newBtn: {
    marginLeft: "auto",
    backgroundColor: PRIMARY,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newBtnText: { color: "#fff", fontWeight: "900" },

  // 🔍 buscador
  searchInput: {
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#11121b",
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: TEXT,
    fontSize: 14,
  },

  // 👤 chips de usuarios
  membersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  memberChip: {
    width: 110,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#11121b",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  memberChipActive: {
    backgroundColor: "#111827",
    borderColor: PRIMARY,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  memberChipText: {
    color: SUBTLE,
    fontWeight: "700",
    fontSize: 13,
  },
  memberChipTextActive: {
    color: "#E9D5FF",
  },

  // 🌐 chips de workspaces (solo admin/owner las ve)
  wsLabel: {
    color: SUBTLE,
    fontSize: 12,
    marginBottom: 4,
  },
  wsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  wsChip: {
    minWidth: 120,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#090a10",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  wsChipActive: {
    backgroundColor: "#1f2937",
    borderColor: PRIMARY,
  },
  wsChipText: {
    color: SUBTLE,
    fontWeight: "700",
    fontSize: 12,
  },
  wsChipTextActive: {
    color: "#E9D5FF",
  },

  row: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
  },
  rowDone: {
    borderColor: SUCCESS,
    backgroundColor: "rgba(22,163,74,0.08)",
  },
  rowInProgress: {
    borderColor: "#3b82f6",
    backgroundColor: "rgba(37,99,235,0.12)",
  },
  title: { color: TEXT, fontWeight: "800", fontSize: 15 },
  titleDone: { color: SUCCESS },
  titleInProgress: { color: "#60a5fa" },
  sub: { color: SUBTLE, fontSize: 12, marginTop: 0 },
  subDone: { color: SUCCESS },
  subInProgress: { color: "#60a5fa" },
  subtle: { color: SUBTLE, textAlign: "center", marginTop: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  badgeDone: {
    alignSelf: "flex-start",
    marginTop: 2,
    backgroundColor: SUCCESS,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  badgeDoneText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.3,
  },
});


