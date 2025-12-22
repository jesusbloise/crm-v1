// app/tasks/index.tsx
import { listActivities, type Activity } from "@/src/api/activities";
import { fetchTenants, getActiveTenant, switchTenant } from "@/src/api/auth";
import { api } from "@/src/api/http";
import { listTenantMembers, type TenantMember } from "@/src/api/tenants";
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

/* Paleta */
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

/* ✅ evento local fallback */
const LOCAL_EVENT_MAP_KEY = "activityEventLocal:v1";

type Filter = "all" | "open" | "done" | "canceled";

type ActivityWithCreator = Activity & {
  created_by?: string | null;
  created_by_name?: string | null;
  created_by_email?: string | null;
  assigned_to_name?: string | null;
  assigned_to_2?: string | null;
  assigned_to_2_name?: string | null;

  // Contacto relacionado
  contact_id?: string | null;
  contact_name?: string | null;
  contact_title?: string | null;

  // Fecha evento (si existe)
  event_at?: number | string | null;
  event_start?: number | string | null;
  calendar_start?: number | string | null;

  // por si tu API lo manda
  due_date?: number | string | null;
  time_str?: string | null;
};

type MemberChip = {
  id: string;
  label: string;
};

type TenantItem = {
  id: string;
  name?: string;
};

type TimeFilter = "all" | "day" | "week" | "month";

export default function TasksList() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");

  const [completedMaster, setCompletedMaster] = useState<Set<string>>(new Set());
  const [inProgressMaster, setInProgressMaster] = useState<Set<string>>(new Set());

  // ✅ mapa local de eventos
  const [localEventMap, setLocalEventMap] = useState<Record<string, number>>({});

  // Filtros por persona / workspace (dropdowns)
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);

  // Filtro de tiempo
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [timeFilterDateStr, setTimeFilterDateStr] = useState("");

  // Rol global + workspaces
  const [currentRole, setCurrentRole] = useState<"owner" | "admin" | "member" | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [activeTenant, setActiveTenant] = useState<string | null>(null);
  const [busyWs, setBusyWs] = useState<string | null>(null);

  const isAdminOrOwner = currentRole === "owner" || currentRole === "admin";

  const parseDateStr = (s: string): Date | null => {
    const trimmed = s.trim();
    if (!trimmed) return null;
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const getRefDateMs = (a: ActivityWithCreator): number | null => {
    const raw = (a as any).due_date ?? a.created_at ?? a.updated_at;
    const ms = parseEventDateToMs(raw);
    if (ms != null) return ms;

    const n = typeof raw === "string" ? Number(raw) : raw;
    if (!Number.isFinite(n)) return null;
    return n as number;
  };

  const loadCompletedMaster = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MASTER_COMPLETED_KEY);
      setCompletedMaster(new Set<string>(raw ? JSON.parse(raw) : []));
    } catch {
      setCompletedMaster(new Set());
    }
  }, []);

  const loadInProgressMaster = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MASTER_INPROGRESS_KEY);
      setInProgressMaster(new Set<string>(raw ? JSON.parse(raw) : []));
    } catch {
      setInProgressMaster(new Set());
    }
  }, []);

  const loadLocalEventMap = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_EVENT_MAP_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      setLocalEventMap(map || {});
    } catch {
      setLocalEventMap({});
    }
  }, []);

  const loadRoleAndTenants = useCallback(async () => {
    setLoadingRole(true);
    try {
      const resRole = await api.get<{ tenant_id: string | null; role: string | null }>("/tenants/role");
      const r = (resRole?.role || "").toLowerCase() as "owner" | "admin" | "member" | "";
      setCurrentRole(r || null);
    } catch {
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
    } catch {}
  }, []);

  useEffect(() => {
    loadCompletedMaster();
    loadInProgressMaster();
    loadLocalEventMap();
    loadRoleAndTenants();
  }, [loadCompletedMaster, loadInProgressMaster, loadLocalEventMap, loadRoleAndTenants]);

  useFocusEffect(
    useCallback(() => {
      loadCompletedMaster();
      loadInProgressMaster();
      loadLocalEventMap();
      loadRoleAndTenants();
    }, [loadCompletedMaster, loadInProgressMaster, loadLocalEventMap, loadRoleAndTenants])
  );

  const q = useQuery<ActivityWithCreator[]>({
    queryKey: ["activities-all"],
    queryFn: () => listActivities() as Promise<ActivityWithCreator[]>,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const qMembers = useQuery<TenantMember[]>({
    queryKey: ["tenant-members"],
    queryFn: listTenantMembers,
  });

  const memberChips: MemberChip[] = useMemo(() => {
    const base: MemberChip[] = [{ id: "all", label: "Todos" }];

    if (!qMembers.data || qMembers.data.length === 0) return base;

    const seen = new Set<string>();
    for (const m of qMembers.data) {
      const label = m.name || m.email || m.id;
      if (!label) continue;
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      base.push({ id: m.id, label });
    }

    return base;
  }, [qMembers.data]);

  const onRefresh = useCallback(() => {
    loadCompletedMaster();
    loadInProgressMaster();
    loadLocalEventMap();
    q.refetch();
  }, [q, loadCompletedMaster, loadInProgressMaster, loadLocalEventMap]);

  const data = useMemo(() => {
    let items: ActivityWithCreator[] = (q.data ?? [])
      .slice()
      .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));

    // 0) Filtro por rango de tiempo
    if (timeFilter !== "all") {
      let baseDate: Date | null = null;
      if (timeFilterDateStr.trim()) {
        baseDate = parseDateStr(timeFilterDateStr);
      }
      if (!baseDate) baseDate = new Date(); // hoy

      const start = new Date(baseDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);

      if (timeFilter === "day") {
        end.setDate(start.getDate() + 1);
      } else if (timeFilter === "week") {
        const day = start.getDay(); // 0 = domingo
        const diff = (day + 6) % 7;
        start.setDate(start.getDate() - diff);
        end.setTime(start.getTime());
        end.setDate(start.getDate() + 7);
      } else if (timeFilter === "month") {
        start.setDate(1);
        end.setMonth(start.getMonth() + 1, 1);
      }

      const startMs = start.getTime();
      const endMs = end.getTime();

      items = items.filter((a) => {
        const ref = getRefDateMs(a);
        if (ref == null) return false;
        return ref >= startMs && ref < endMs;
      });
    }

    // 1) Filtro por estado
    items = items.filter((a) => {
      const isDoneUI = a.status === "done" || completedMaster.has(a.id as string);
      const isInProgressUI = !isDoneUI && inProgressMaster.has(a.id as string);

      switch (filter) {
        case "open":
          return !isDoneUI && !isInProgressUI;
        case "done":
          return isDoneUI;
        case "canceled":
          return a.status === "canceled";
        case "all":
        default:
          return true;
      }
    });

    // 2) Filtro por persona (solo admin/owner)
    if (assigneeFilter !== "all" && isAdminOrOwner) {
      const selected = memberChips.find((m) => m.id === assigneeFilter);
      if (selected) {
        const term = selected.label.toLowerCase();

        items = items.filter((a) => {
          const created = (a.created_by_name || "").toLowerCase();
          const assigned1 = (a.assigned_to_name || "").toLowerCase();
          const assigned2 = (a.assigned_to_2_name || "").toLowerCase();

          return created.includes(term) || assigned1.includes(term) || assigned2.includes(term);
        });
      }
    }

    // 3) Filtro de texto libre
    const termText = search.trim().toLowerCase();
    if (termText) {
      items = items.filter((a) => {
        const title = (a.title || "").toLowerCase();
        const type = (a.type || "").toLowerCase();
        const created = (a.created_by_name || "").toLowerCase();
        const assigned1 = (a.assigned_to_name || "").toLowerCase();
        const assigned2 = (a.assigned_to_2_name || "").toLowerCase();
        const contact = (
          (a as any).contact_name ||
          (a as any).contact_title ||
          (a as any).contact?.name ||
          (a as any).contact_id ||
          ""
        )
          .toString()
          .toLowerCase();

        return (
          title.includes(termText) ||
          type.includes(termText) ||
          created.includes(termText) ||
          assigned1.includes(termText) ||
          assigned2.includes(termText) ||
          contact.includes(termText)
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
    memberChips,
    timeFilter,
    timeFilterDateStr,
  ]);

  const onSelectWorkspace = useCallback(
    async (tenantId: string) => {
      if (!isAdminOrOwner) return;
      if (busyWs || tenantId === activeTenant) return;

      setBusyWs(tenantId);
      try {
        const res = await switchTenant(tenantId);
        const confirmed = (res as any)?.active_tenant || tenantId;
        setActiveTenant(confirmed);
        await q.refetch();
      } catch {
      } finally {
        setBusyWs(null);
      }
    },
    [isAdminOrOwner, busyWs, activeTenant, q]
  );

  const assigneeActiveLabel = useMemo(() => {
    const opt = memberChips.find((m) => m.id === assigneeFilter);
    if (!opt) return "Todas las personas";
    return assigneeFilter === "all" ? "Todas las personas" : opt.label;
  }, [assigneeFilter, memberChips]);

  const wsActiveLabel = useMemo(() => {
    if (!tenants.length) return "Sin workspaces";
    const t = tenants.find((tt) => tt.id === activeTenant);
    if (t?.name) return `Workspace: ${t.name}`;
    if (t?.id) return `Workspace: ${t.id}`;
    return "Seleccionar workspace";
  }, [tenants, activeTenant]);

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
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {labelFilter(f)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.timeFiltersRow}>
          {(["all", "day", "week", "month"] as TimeFilter[]).map((tf) => {
            const active = timeFilter === tf;
            return (
              <Pressable
                key={tf}
                onPress={() => setTimeFilter(tf)}
                style={[styles.timeChip, active && styles.timeChipActive]}
              >
                <Text style={[styles.timeChipText, active && styles.timeChipTextActive]}>
                  {tf === "all" ? "Todas" : tf === "day" ? "Día" : tf === "week" ? "Semana" : "Mes"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {timeFilter !== "all" && (
          <TextInput
            value={timeFilterDateStr}
            onChangeText={setTimeFilterDateStr}
            placeholder="Fecha base (YYYY-MM-DD). Vacío = hoy"
            placeholderTextColor={SUBTLE}
            style={styles.dateFilterInput}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
        )}

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por título, usuario, cliente..."
          placeholderTextColor={SUBTLE}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {isAdminOrOwner && memberChips.length > 0 && (
          <View style={styles.dropdownRow}>
            <View style={styles.dropdownWrapper}>
              <Pressable style={styles.dropdownTrigger} onPress={() => setAssigneeMenuOpen((v) => !v)}>
                <Text style={styles.dropdownText} numberOfLines={1}>
                  {assigneeActiveLabel}
                </Text>
                <Text style={styles.dropdownArrow}>{assigneeMenuOpen ? "▲" : "▼"}</Text>
              </Pressable>

              {assigneeMenuOpen && (
                <View style={styles.dropdownMenu}>
                  {memberChips.map((m) => {
                    const active = assigneeFilter === m.id;
                    return (
                      <Pressable
                        key={m.id}
                        style={[styles.dropdownOption, active && styles.dropdownOptionActive]}
                        onPress={() => {
                          setAssigneeFilter(m.id);
                          setAssigneeMenuOpen(false);
                        }}
                      >
                        <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]} numberOfLines={1}>
                          {m.id === "all" ? "Todas las personas" : m.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        )}

        {isAdminOrOwner && tenants.length > 0 && (
          <View style={styles.dropdownRow}>
            <View style={styles.dropdownWrapper}>
              <Pressable style={styles.dropdownTrigger} onPress={() => setWsMenuOpen((v) => !v)}>
                <Text style={styles.dropdownText} numberOfLines={1}>
                  {wsActiveLabel}
                </Text>
                <Text style={styles.dropdownArrow}>{wsMenuOpen ? "▲" : "▼"}</Text>
              </Pressable>

              {wsMenuOpen && (
                <View style={styles.dropdownMenu}>
                  {tenants.map((t) => {
                    const active = activeTenant === t.id;
                    const busy = busyWs === t.id;
                    return (
                      <Pressable
                        key={t.id}
                        style={[styles.dropdownOption, active && styles.dropdownOptionActive, busy && { opacity: 0.5 }]}
                        onPress={async () => {
                          await onSelectWorkspace(t.id);
                          setWsMenuOpen(false);
                        }}
                      >
                        <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]} numberOfLines={1}>
                          {t.name || t.id}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        )}

        {loadingRole && (
          <View style={{ marginTop: 6 }}>
            <Text style={{ color: SUBTLE, fontSize: 11 }}>Verificando permisos…</Text>
          </View>
        )}

        {q.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={PRIMARY} />
            <Text style={styles.subtle}>Cargando actividades…</Text>
          </View>
        ) : q.isError ? (
          <Text style={{ color: "#fecaca" }}>Error: {String((q.error as any)?.message || q.error)}</Text>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={onRefresh} />}
            ListEmptyComponent={<Text style={styles.subtle}>No hay actividades</Text>}
            renderItem={({ item }) => (
              <TaskCard
                item={item}
                completedMaster={completedMaster}
                inProgressMaster={inProgressMaster}
                localEventMap={localEventMap}
              />
            )}
            contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
          />
        )}
      </View>
    </>
  );
}

function getLastNoteBlock(notes?: string | null): string | null {
  if (!notes) return null;

  const blocks = notes
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0) return null;
  return blocks[blocks.length - 1];
}

/**
 * - Si NO viene contact_name/contact_title/contact.name,
 *   mostramos el contact_id para que nunca desaparezca.
 */
function getContactLabel(a: ActivityWithCreator): string | null {
  const name =
    (a as any).contact_name ||
    (a as any).contact_title ||
    (a as any).contact?.name ||
    null;

  if (name && String(name).trim()) return String(name).trim();

  return null;
}



function parseEventDateToMs(raw: any): number | null {
  if (raw == null) return null;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;

    const asNum = Number(s);
    if (Number.isFinite(asNum)) {
      return asNum < 1e12 ? asNum * 1000 : asNum;
    }

    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
      return Number.isNaN(d.getTime()) ? null : d.getTime();
    }

    const t = Date.parse(s);
    if (!Number.isNaN(t)) return t;

    return null;
  }

  return null;
}

function formatEventLabelFromMs(ms: number): string {
  const dt = new Date(ms);
  const hasTime = !(dt.getHours() === 0 && dt.getMinutes() === 0 && dt.getSeconds() === 0);

  return hasTime
    ? dt.toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : dt.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getEventDateLabel(a: ActivityWithCreator): string | null {
  const raw =
    (a as any).event_at ??
    (a as any).event_start ??
    (a as any).calendar_start ??
    (a as any).calendar_event_start ??
    (a as any).due_date ??
    null;

  const ms = parseEventDateToMs(raw);
  if (!ms) return null;
  return formatEventLabelFromMs(ms);
}

function TaskCard({
  item,
  completedMaster,
  inProgressMaster,
  localEventMap,
}: {
  item: ActivityWithCreator;
  completedMaster: Set<string>;
  inProgressMaster: Set<string>;
  localEventMap: Record<string, number>;
}) {
  const isDoneUI = item.status === "done" || completedMaster.has(item.id);
  const isInProgressUI = !isDoneUI && inProgressMaster.has(item.id);

  const statusLabel = isDoneUI ? "Realizada" : isInProgressUI ? "En proceso" : "Abierta";
  const createdByLabel = item.created_by_name ? `por ${item.created_by_name}` : "";

  const assignedNames: string[] = [];

  if ((item as any).assigned_to_name) assignedNames.push((item as any).assigned_to_name);
  else if ((item as any).assigned_to) assignedNames.push(String((item as any).assigned_to));

  if ((item as any).assigned_to_2_name) assignedNames.push((item as any).assigned_to_2_name);
  else if ((item as any).assigned_to_2) assignedNames.push(String((item as any).assigned_to_2));

  const assignedInfo =
    assignedNames.length === 0
      ? " · sin asignar"
      : assignedNames.length === 1
      ? ` · asignada a ${assignedNames[0]}`
      : ` · asignada a ${assignedNames[0]} y ${assignedNames[1]}`;

  const createdLabel = item.created_at != null ? ` · creada el ${formatDate(item.created_at as any)}` : "";

  const lastNoteBlock = getLastNoteBlock((item as any).notes);
  const contactLabel = getContactLabel(item);

  const eventDateLabel =
    getEventDateLabel(item) ||
    (localEventMap?.[item.id] ? formatEventLabelFromMs(localEventMap[item.id]) : null);

  return (
    <Link href={{ pathname: "/tasks/[id]", params: { id: item.id } }} asChild>
      <Pressable accessibilityRole="link" hitSlop={8}>
        <View style={[styles.row, isDoneUI && styles.rowDone, !isDoneUI && isInProgressUI && styles.rowInProgress]}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.title, isDoneUI && styles.titleDone, !isDoneUI && isInProgressUI && styles.titleInProgress]}
              numberOfLines={1}
            >
              {item.title}
            </Text>

            <View style={styles.rightMeta}>
              {contactLabel && (
                <View style={styles.contactChip}>
                  <Text style={styles.contactChipText} numberOfLines={1}>
                    Contacto: {contactLabel}
                  </Text>
                </View>
              )}

              {eventDateLabel && (
                <View style={styles.eventChip}>
                  <Text style={styles.eventChipText} numberOfLines={1}>
                    Evento para: {eventDateLabel}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <Text
            style={[styles.sub, isDoneUI && styles.subDone, !isDoneUI && isInProgressUI && styles.subInProgress]}
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

          {lastNoteBlock && (
            <Text style={styles.lastNoteText} numberOfLines={2}>
              {lastNoteBlock}
            </Text>
          )}

          {isDoneUI && (
            <View style={styles.badgeDone}>
              <Text style={styles.badgeDoneText}>Tarea completada</Text>
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

function formatDate(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const ms = parseEventDateToMs(value);
  if (ms == null) return "—";
  const dt = new Date(ms);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },

  filters: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#1a1b2a",
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: { backgroundColor: "rgba(124,58,237,0.20)", borderColor: PRIMARY },
  chipText: { color: SUBTLE, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#E9D5FF" },

  timeFiltersRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  timeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#11121b",
  },
  timeChipActive: { backgroundColor: "rgba(124,58,237,0.20)", borderColor: PRIMARY },
  timeChipText: { color: SUBTLE, fontSize: 11, fontWeight: "700" },
  timeChipTextActive: { color: "#E9D5FF" },

  dateFilterInput: {
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#11121b",
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: TEXT,
    fontSize: 13,
  },

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

  dropdownRow: { marginBottom: 6 },
  dropdownWrapper: { alignSelf: "flex-start", minWidth: 180 },
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#11121b",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownText: { color: TEXT, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  dropdownArrow: { color: SUBTLE, fontSize: 10, marginLeft: 6 },
  dropdownMenu: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#11121b",
    overflow: "hidden",
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2933",
  },
  dropdownOptionActive: { backgroundColor: "#1f2937" },
  dropdownOptionText: { color: TEXT, fontSize: 12 },
  dropdownOptionTextActive: { color: "#E9D5FF", fontWeight: "700" },

  row: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4, // ✅ antes 6 (reduce el espacio interno)
  },
  rowDone: { borderColor: SUCCESS, backgroundColor: "rgba(22,163,74,0.08)" },
  rowInProgress: { borderColor: "#3b82f6", backgroundColor: "rgba(37,99,235,0.12)" },

  titleRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6, // ✅ antes 8
    flexWrap: "wrap",
  },
  title: { color: TEXT, fontWeight: "800", fontSize: 15, flexShrink: 1, minWidth: 0 },

  titleDone: { color: SUCCESS },
  titleInProgress: { color: "#60a5fa" },

  rightMeta: { marginLeft: "auto", alignItems: "flex-end", gap: 6, maxWidth: "100%" },

  contactChip: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#11121b",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    maxWidth: "100%",
  },
  contactChipText: { color: TEXT, fontSize: 12, fontWeight: "800" },

  eventChip: {
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.35)",
    backgroundColor: "rgba(124,58,237,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    maxWidth: "100%",
  },
  eventChipText: { color: "#E9D5FF", fontSize: 12, fontWeight: "800" },

  sub: {
    color: SUBTLE,
    fontSize: 12,
    marginTop: -2, // ✅ pega el detalle al título
  },
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
  badgeDoneText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },

  lastNoteText: { color: SUBTLE, fontSize: 12, marginTop: 2 },
});


