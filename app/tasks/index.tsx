// app/tasks/index.tsx
import { listActivities, type Activity } from "@/src/api/activities";
import { fetchTenants, getActiveTenant, switchTenant } from "@/src/api/auth";
import { api } from "@/src/api/http";
import { listTenantMembers, type TenantMember } from "@/src/api/tenants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { Link, router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

/* Paleta */
const BG = "#f5f6fa";
const CARD = "#ffffff";
const BORDER = "#e7e9f0";
const TEXT = "#202536";
const SUBTLE = "#737b8e";
const PRIMARY = "#7551c8";
const SUCCESS = "#23744d";
/* Maestro de completadas locales */
const MASTER_COMPLETED_KEY = "completedActivities:v1:all";
/* Maestro de EN PROCESO locales */
const MASTER_INPROGRESS_KEY = "inProgressActivities:v1:all";

/* ✅ evento local fallback */
const LOCAL_EVENT_MAP_KEY = "activityEventLocal:v1";

type Filter = "all" | "open" | "in_progress" | "done" | "canceled";

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
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 1100;
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
      const resRole = await api.get<{ tenant_id: string | null; role: string | null }>(
        "/tenants/role"
      );
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

    // 1) Filtro por estado (UI)
    items = items.filter((a) => {
      const isDoneUI = a.status === "done" || completedMaster.has(a.id as string);
      const isInProgressUI = !isDoneUI && inProgressMaster.has(a.id as string);

      switch (filter) {
        case "open":
          return !isDoneUI && !isInProgressUI;
        case "in_progress":
          return isInProgressUI;
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
        <View style={styles.pageHeader}>
          <View style={styles.pageHeading}>
            <Text style={styles.pageTitle}>Actividades</Text>
            <Text style={styles.pageDescription}>
              Organiza el seguimiento y las tareas de tu equipo.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/tasks/new")}
            style={styles.createButton}
          >
            <Text style={styles.createButtonText}>+ Nueva actividad</Text>
          </Pressable>
        </View>

        <View style={styles.filters}>
          {(["all", "open", "in_progress", "done", "canceled"] as Filter[]).map((f) => {
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
                <View
          style={[
            styles.searchToolbar,
            desktop && styles.searchToolbarDesktop,
          ]}
        >
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por título, usuario, cliente..."
            placeholderTextColor={SUBTLE}
            style={[
              styles.searchInput,
              desktop && styles.searchInputDesktop,
            ]}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {isAdminOrOwner && memberChips.length > 0 && (
            <View
              style={[
                styles.dropdownRow,
                desktop && styles.dropdownRowDesktop,
              ]}
            >
              <View style={styles.dropdownWrapper}>
                <Pressable
                  style={styles.dropdownTrigger}
                  onPress={() => setAssigneeMenuOpen((v) => !v)}
                >
                  <Text style={styles.dropdownText} numberOfLines={1}>
                    {assigneeActiveLabel}
                  </Text>
                  <Text style={styles.dropdownArrow}>
                    {assigneeMenuOpen ? "▲" : "▼"}
                  </Text>
                </Pressable>

                {assigneeMenuOpen && (
                  <View style={styles.dropdownMenu}>
                    {memberChips.map((m) => {
                      const active = assigneeFilter === m.id;

                      return (
                        <Pressable
                          key={m.id}
                          style={[
                            styles.dropdownOption,
                            active && styles.dropdownOptionActive,
                          ]}
                          onPress={() => {
                            setAssigneeFilter(m.id);
                            setAssigneeMenuOpen(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.dropdownOptionText,
                              active && styles.dropdownOptionTextActive,
                            ]}
                            numberOfLines={1}
                          >
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
            <View
              style={[
                styles.dropdownRow,
                desktop && styles.dropdownRowDesktop,
              ]}
            >
              <View style={styles.dropdownWrapper}>
                <Pressable
                  style={styles.dropdownTrigger}
                  onPress={() => setWsMenuOpen((v) => !v)}
                >
                  <Text style={styles.dropdownText} numberOfLines={1}>
                    {wsActiveLabel}
                  </Text>
                  <Text style={styles.dropdownArrow}>
                    {wsMenuOpen ? "▲" : "▼"}
                  </Text>
                </Pressable>

                {wsMenuOpen && (
                  <View style={styles.dropdownMenu}>
                    {tenants.map((t) => {
                      const active = activeTenant === t.id;
                      const busy = busyWs === t.id;

                      return (
                        <Pressable
                          key={t.id}
                          style={[
                            styles.dropdownOption,
                            active && styles.dropdownOptionActive,
                            busy && { opacity: 0.5 },
                          ]}
                          onPress={async () => {
                            await onSelectWorkspace(t.id);
                            setWsMenuOpen(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.dropdownOptionText,
                              active && styles.dropdownOptionTextActive,
                            ]}
                            numberOfLines={1}
                          >
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
        </View>


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
          <Text style={{ color: "#fecaca" }}>
            Error: {String((q.error as any)?.message || q.error)}
          </Text>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
                        style={styles.list}
            ListHeaderComponent={
              <View>
                <Text style={styles.resultCount}>
                  {data.length} actividades en el resultado
                </Text>

                {desktop && (
                  <View style={styles.tableHeader}>
                    <Text style={[styles.columnHeading, styles.activityColumn]}>
                      Actividad
                    </Text>
                    <Text style={[styles.columnHeading, styles.personColumn]}>
                      Responsables
                    </Text>
                    <Text style={[styles.columnHeading, styles.contactColumn]}>
                      Contacto
                    </Text>
                    <Text style={[styles.columnHeading, styles.dateColumn]}>
                      Fecha del evento
                    </Text>
                    <Text style={[styles.columnHeading, styles.statusColumn]}>
                      Estado
                    </Text>
                  </View>
                )}
              </View>
            }
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
                        contentContainerStyle={{
              gap: desktop ? 0 : 10,
              paddingBottom: 20,
            }}
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
    const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 1100;
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

  const createdLabel =
    item.created_at != null ? ` · creada el ${formatDate(item.created_at as any)}` : "";

  const lastNoteBlock = getLastNoteBlock((item as any).notes);
  const contactLabel = getContactLabel(item);

  const eventDateLabel =
    getEventDateLabel(item) ||
    (localEventMap?.[item.id] ? formatEventLabelFromMs(localEventMap[item.id]) : null);

      if (desktop) {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Abrir actividad: ${item.title}`}
        onPress={() =>
          router.push({
            pathname: "/tasks/[id]",
            params: { id: item.id },
          })
        }
        style={({ pressed, hovered }) => [
          styles.tableRow,
          (hovered || pressed) && styles.tableRowHover,
        ]}
      >
        <View style={styles.activityColumn}>
          <Text style={styles.tableTitle} numberOfLines={2}>
            {item.title || "Sin título"}
          </Text>
          <Text style={styles.tableSecondary} numberOfLines={1}>
            {createdByLabel || "Sin información del creador"}
          </Text>
          {!!lastNoteBlock && (
            <Text style={styles.tableSecondary} numberOfLines={1}>
              {lastNoteBlock}
            </Text>
          )}
        </View>

        <Text
          style={[styles.tableCell, styles.personColumn]}
          numberOfLines={2}
        >
          {assignedNames.length ? assignedNames.join(" y ") : "Sin asignar"}
        </Text>

        <Text
          style={[styles.tableCell, styles.contactColumn]}
          numberOfLines={2}
        >
          {contactLabel || "—"}
        </Text>

        <Text
          style={[styles.tableCell, styles.dateColumn]}
          numberOfLines={2}
        >
          {eventDateLabel || "Sin fecha"}
        </Text>

        <View style={styles.statusColumn}>
          <View
            style={[
              styles.statusBadge,
              isDoneUI
                ? styles.statusBadgeDone
                : isInProgressUI
                ? styles.statusBadgeProgress
                : styles.statusBadgeOpen,
            ]}
          >
            <Text style={styles.statusBadgeText}>{statusLabel}</Text>
          </View>
        </View>
      </Pressable>
    );
  }
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
          <View style={styles.titleRow}>
            <Text
              style={[
                styles.title,
                isDoneUI && styles.titleDone,
                !isDoneUI && isInProgressUI && styles.titleInProgress,
              ]}
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
    case "in_progress":
      return "En proceso";
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
  searchToolbar: {
    gap: 10,
    minWidth: 0,
  },

  searchToolbarDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  searchInputDesktop: {
    flex: 1,
    minWidth: 0,
  },

  dropdownRowDesktop: {
    width: 220,
    flexShrink: 0,
  },

  screen: {
    flex: 1,
    minWidth: 0,
    backgroundColor: BG,
    padding: 20,
    gap: 12,
  },

  pageHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 6,
  },
  pageHeading: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: 5,
  },
  pageTitle: { color: TEXT, fontSize: 25, fontWeight: "700" },
  pageDescription: { color: SUBTLE, fontSize: 13, lineHeight: 20 },
  createButton: {
    backgroundColor: PRIMARY,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 42,
    justifyContent: "center",
  },
  createButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "600" },

  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 7,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: { backgroundColor: "#eee8f8", borderColor: "#b49bdc" },
  chipText: { color: SUBTLE, fontWeight: "600", fontSize: 12 },
  chipTextActive: { color: PRIMARY },

  timeFiltersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },
  timeChipActive: { backgroundColor: "#eee8f8", borderColor: "#b49bdc" },
  timeChipText: { color: SUBTLE, fontSize: 12, fontWeight: "500" },
  timeChipTextActive: { color: PRIMARY },

  dateFilterInput: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: CARD,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: TEXT,
    fontSize: 13,
  },
  searchInput: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: CARD,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: TEXT,
    fontSize: 14,
  },

  dropdownRow: { minWidth: 0 },
  dropdownWrapper: { width: "100%", maxWidth: 360 },
  dropdownTrigger: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: CARD,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  dropdownText: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
    minWidth: 0,
  },
  dropdownArrow: { color: SUBTLE, fontSize: 10 },
  dropdownMenu: {
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    overflow: "hidden",
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  dropdownOptionActive: { backgroundColor: "#f1ecfa" },
  dropdownOptionText: { color: TEXT, fontSize: 12 },
  dropdownOptionTextActive: { color: PRIMARY, fontWeight: "600" },

  list: { flex: 1, minHeight: 0 },
  resultCount: {
    color: SUBTLE,
    fontSize: 12,
    paddingVertical: 12,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#eef0f6",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderWidth: 1,
    borderColor: BORDER,
  },
  columnHeading: { color: "#596274", fontSize: 11, fontWeight: "600" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowHover: { backgroundColor: "#faf8fe" },
  activityColumn: { flex: 3, minWidth: 0, gap: 5 },
  personColumn: { flex: 1.7, minWidth: 0 },
  contactColumn: { flex: 1.5, minWidth: 0 },
  dateColumn: { flex: 1.5, minWidth: 0 },
  statusColumn: { width: 100 },
  tableTitle: { color: TEXT, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  tableSecondary: { color: SUBTLE, fontSize: 11, lineHeight: 17 },
  tableCell: { color: "#475467", fontSize: 12, lineHeight: 19 },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusBadgeOpen: { backgroundColor: "#eef0f5" },
  statusBadgeProgress: { backgroundColor: "#e8f0ff" },
  statusBadgeDone: { backgroundColor: "#e3f4e9" },
  statusBadgeText: { color: "#344054", fontSize: 11, fontWeight: "500" },

  row: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 16,
    gap: 9,
  },
  rowDone: { borderColor: "#badfc8", backgroundColor: "#f4fbf6" },
  rowInProgress: { borderColor: "#bed0f1", backgroundColor: "#f4f7fe" },
  titleRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flexWrap: "wrap",
  },
  title: {
    color: TEXT,
    fontWeight: "600",
    fontSize: 15,
    flexShrink: 1,
    minWidth: 0,
  },
  titleDone: { color: SUCCESS },
  titleInProgress: { color: "#2858a5" },
  rightMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    maxWidth: "100%",
  },
  contactChip: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fafbfe",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    maxWidth: "100%",
  },
  contactChipText: { color: "#596274", fontSize: 11, fontWeight: "500" },
  eventChip: {
    borderWidth: 1,
    borderColor: "#e2d9f2",
    backgroundColor: "#f1ecfa",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    maxWidth: "100%",
  },
  eventChipText: { color: PRIMARY, fontSize: 11, fontWeight: "500" },
  sub: { color: SUBTLE, fontSize: 12, lineHeight: 20 },
  subDone: { color: "#587a65" },
  subInProgress: { color: "#526d96" },
  subtle: { color: SUBTLE, textAlign: "center", marginTop: 8 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  badgeDone: {
    alignSelf: "flex-start",
    backgroundColor: "#e3f4e9",
    borderRadius: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  badgeDoneText: { color: SUCCESS, fontWeight: "600", fontSize: 11 },
  lastNoteText: { color: SUBTLE, fontSize: 12, lineHeight: 19 },
});