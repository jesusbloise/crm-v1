// app/tasks/index.tsx
import {
  listActivitiesPage,
  type Activity,
  type ActivityPageFilters,
} from "@/src/api/activities";
import { fetchTenants, getActiveTenant } from "@/src/api/auth";
import { api } from "@/src/api/http";
import {
  listTenantMembers,
  type TenantMember,
} from "@/src/api/tenants";
import ActivityStatsPanel from "@/src/components/ActivityStatsPanel";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

const BG = "#f5f6fa";
const CARD = "#ffffff";
const BORDER = "#e7e9f0";
const TEXT = "#202536";
const SUBTLE = "#737b8e";
const PRIMARY = "#7551c8";
const SUCCESS = "#23744d";

const PAGE_SIZE = 50;
const LOCAL_EVENT_MAP_KEY = "activityEventLocal:v1";

type Filter = "all" | "open" | "in_progress" | "done" | "canceled";
type TimeFilter = "all" | "day" | "week" | "month";
type QuickFilter = "all" | "overdue" | "undated";
type ActivityScope = "team" | "mine";

type ActivityWithCreator = Omit<Activity, "due_date"> & {
  due_date?: number | string | null;
  contact_name?: string | null;
  contact_title?: string | null;
  contact?: {
    name?: string | null;
  } | null;
  event_at?: number | string | null;
  event_start?: number | string | null;
  calendar_start?: number | string | null;
  calendar_event_start?: number | string | null;
};

type MemberChip = {
  id: string;
  label: string;
};

export default function TasksList() {
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();

  const [contentWidth, setContentWidth] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [activityScope, setActivityScope] =
    useState<ActivityScope>("team");
  const [filterMenu, setFilterMenu] =
    useState<"status" | "period" | null>(null);

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);

  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [timeFilterDateStr, setTimeFilterDateStr] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  const [currentRole, setCurrentRole] =
    useState<"owner" | "admin" | "member" | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [activeTenant, setActiveTenant] = useState<string | null>(null);

  const [localEventMap, setLocalEventMap] =
    useState<Record<string, number>>({});
  const [agendaNow, setAgendaNow] = useState(() => Date.now());

  const availableWidth = contentWidth || Math.max(0, width - 260);

  const sidePanel =
    Platform.OS === "web" && availableWidth >= 1120;

  const statsWidth = Math.min(
    400,
    Math.max(320, availableWidth * 0.28)
  );

  const listWidth = sidePanel
    ? availableWidth - statsWidth - 20
    : availableWidth;

  const desktop = Platform.OS === "web" && listWidth >= 760;

  const isAdminOrOwner =
    currentRole === "owner" || currentRole === "admin";

  const effectiveScope: ActivityScope =
    isAdminOrOwner ? activityScope : "mine";

  useEffect(() => {
    const timer = setInterval(() => {
      setAgendaNow(Date.now());
    }, 60_000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  const loadLocalEventMap = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_EVENT_MAP_KEY);
      const map = raw
        ? (JSON.parse(raw) as Record<string, number>)
        : {};

      setLocalEventMap(map || {});
    } catch {
      setLocalEventMap({});
    }
  }, []);

  const loadRoleAndTenant = useCallback(async () => {
    setLoadingRole(true);

    try {
      const response = await api.get<{
        tenant_id: string | null;
        role: string | null;
      }>("/tenants/role");

      const role = (response?.role || "").toLowerCase();

      setCurrentRole(
        role === "owner" || role === "admin" || role === "member"
          ? role
          : null
      );

      const storedTenant = await getActiveTenant();

      if (storedTenant) {
        setActiveTenant(storedTenant);
      }

      const tenantData = await fetchTenants();

      const confirmedTenant =
        tenantData?.active_tenant ||
        response?.tenant_id ||
        storedTenant ||
        null;

      setActiveTenant(confirmedTenant);
    } catch {
      setCurrentRole(null);
      setActiveTenant(null);
    } finally {
      setLoadingRole(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLocalEventMap();
      void loadRoleAndTenant();
    }, [loadLocalEventMap, loadRoleAndTenant])
  );

  const agendaDay = new Date(agendaNow).toLocaleDateString("en-CA");

  const serverFilters = useMemo<ActivityPageFilters>(() => {
    const result: ActivityPageFilters = {
      limit: PAGE_SIZE,
      scope: effectiveScope,
      sort: quickFilter === "all" ? "updated" : "due",
    };

    if (debouncedSearch) {
      result.q = debouncedSearch;
    }

    if (filter !== "all") {
      result.status = filter;
    }

    if (
      effectiveScope === "team" &&
      assigneeFilter !== "all"
    ) {
      result.person_id = assigneeFilter;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (quickFilter !== "all") {
      result.pending = true;

      if (quickFilter === "undated") {
        result.undated = true;
      } else {
        result.due_before = today.getTime();
      }

      return result;
    }

    if (timeFilter !== "all") {
      let base = new Date(today);

      const match = timeFilterDateStr
        .trim()
        .match(/^(\d{4})-(\d{2})-(\d{2})$/);

      if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        const candidate = new Date(year, month, day);

        if (
          candidate.getFullYear() === year &&
          candidate.getMonth() === month &&
          candidate.getDate() === day
        ) {
          base = candidate;
        }
      }

      const start = new Date(base);
      start.setHours(0, 0, 0, 0);

      if (timeFilter === "week") {
        const daysSinceMonday = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - daysSinceMonday);
      } else if (timeFilter === "month") {
        start.setDate(1);
      }

      const end = new Date(start);

      if (timeFilter === "day") {
        end.setDate(end.getDate() + 1);
      } else if (timeFilter === "week") {
        end.setDate(end.getDate() + 7);
      } else {
        end.setMonth(end.getMonth() + 1, 1);
      }

      result.due_from = start.getTime();
      result.due_before = end.getTime();
    }

    return result;
  }, [
    effectiveScope,
    debouncedSearch,
    filter,
    assigneeFilter,
    quickFilter,
    timeFilter,
    timeFilterDateStr,
    agendaDay,
  ]);

  const paginationKey = JSON.stringify([
    activeTenant,
    serverFilters,
  ]);

  const [pagination, setPagination] = useState({
    key: "",
    offset: 0,
  });

  const offset =
    pagination.key === paginationKey ? pagination.offset : 0;

  const queryEnabled =
    Boolean(activeTenant) &&
    !loadingRole &&
    currentRole !== null;

  const q = useQuery({
    queryKey: [
      "activities-all",
      activeTenant,
      serverFilters,
      offset,
    ],
    queryFn: () =>
      listActivitiesPage({
        ...serverFilters,
        offset,
      }),
    enabled: queryEnabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const refetchActivities = q.refetch;

  useFocusEffect(
    useCallback(() => {
      if (
        !activeTenant ||
        loadingRole ||
        currentRole === null
      ) {
        return;
      }

      void refetchActivities();

      void queryClient.invalidateQueries({
        queryKey: ["activity-stats", activeTenant],
      });

      void queryClient.invalidateQueries({
        queryKey: ["activity-trend", activeTenant],
      });
    }, [
      activeTenant,
      loadingRole,
      currentRole,
      refetchActivities,
      queryClient,
    ])
  );

  const total = q.data?.total ?? 0;
  const data: ActivityWithCreator[] = q.data?.items ?? [];

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  useEffect(() => {
    if (
      !q.data ||
      q.isFetching ||
      offset === 0 ||
      offset < q.data.total
    ) {
      return;
    }

    const lastOffset =
      Math.max(0, Math.ceil(q.data.total / PAGE_SIZE) - 1) *
      PAGE_SIZE;

    setPagination({
      key: paginationKey,
      offset: lastOffset,
    });
  }, [q.data, q.isFetching, offset, paginationKey]);

  const changePage = (direction: -1 | 1) => {
    if (q.isFetching) return;

    setPagination({
      key: paginationKey,
      offset: Math.max(0, offset + direction * PAGE_SIZE),
    });
  };

  const qMembers = useQuery<TenantMember[]>({
    queryKey: ["tenant-members", activeTenant],
    queryFn: listTenantMembers,
    enabled: queryEnabled && isAdminOrOwner,
  });

  const memberChips = useMemo<MemberChip[]>(() => {
    const result: MemberChip[] = [
      {
        id: "all",
        label: "Todos los responsables",
      },
    ];

    const seen = new Set<string>();

    for (const member of qMembers.data ?? []) {
      if (seen.has(member.id)) continue;

      seen.add(member.id);

      result.push({
        id: member.id,
        label: member.name || member.email || member.id,
      });
    }

    return result;
  }, [qMembers.data]);

  const assigneeActiveLabel = useMemo(() => {
    return (
      memberChips.find(
        (member) => member.id === assigneeFilter
      )?.label || "Todos los responsables"
    );
  }, [memberChips, assigneeFilter]);

  const onRefresh = useCallback(() => {
    void loadLocalEventMap();
    void refetchActivities();

    if (!activeTenant) return;

    void queryClient.invalidateQueries({
      queryKey: ["activity-stats", activeTenant],
    });

    void queryClient.invalidateQueries({
      queryKey: ["activity-trend", activeTenant],
    });
  }, [
    loadLocalEventMap,
    refetchActivities,
    activeTenant,
    queryClient,
  ]);

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setFilter("all");
    setTimeFilter("all");
    setTimeFilterDateStr("");
    setQuickFilter("all");
    setAssigneeFilter("all");
    setFilterMenu(null);
    setAssigneeMenuOpen(false);
  };

  const hasFilters =
    search.trim() !== "" ||
    filter !== "all" ||
    timeFilter !== "all" ||
    quickFilter !== "all" ||
    (
      effectiveScope === "team" &&
      assigneeFilter !== "all"
    ) ||
    timeFilterDateStr !== "";

  const statisticsPanel = (
    <ActivityStatsPanel
      tenantId={activeTenant}
      enabled={queryEnabled}
      filters={{
        scope: effectiveScope,
        person_id:
          effectiveScope === "team" &&
          assigneeFilter !== "all"
            ? assigneeFilter
            : undefined,
        q: serverFilters.q,
        pending: serverFilters.pending,
        undated: serverFilters.undated,
        due_from: serverFilters.due_from,
        due_before: serverFilters.due_before,
      }}
      onSelectStatus={(status) => {
        setFilter(status);

        if (status === "done" || status === "canceled") {
          setQuickFilter("all");
        }

        setShowStats(false);
      }}
      onSelectPerson={(id) => {
        setActivityScope("team");
        setAssigneeFilter(id);
        setAssigneeMenuOpen(false);
        setShowStats(false);
      }}
    />
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Actividades",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: {
            color: TEXT,
            fontWeight: "800",
          },
        }}
      />

      <View
        style={[
          styles.screen,
          { padding: width < 600 ? 12 : 20 },
        ]}
      >
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
            <Text style={styles.createButtonText}>
              + Nueva actividad
            </Text>
          </Pressable>
        </View>

        {isAdminOrOwner && (
          <View style={styles.scopeBar}>
            {(
              [
                ["team", "Equipo"],
                ["mine", "Mis actividades"],
              ] as const
            ).map(([value, label]) => {
              const selected = effectiveScope === value;

              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setActivityScope(value);
                    setAssigneeFilter("all");
                    setAssigneeMenuOpen(false);
                    setFilterMenu(null);
                  }}
                  style={[
                    styles.scopeButton,
                    selected && styles.scopeButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.scopeText,
                      selected && styles.scopeTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.filterCard}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar actividad, persona o contacto…"
            placeholderTextColor={SUBTLE}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
            accessibilityLabel="Buscar actividades"
          />

          <View style={styles.filterControls}>
            <View style={styles.filterControl}>
              <Text style={styles.filterCaption}>ESTADO</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  expanded: filterMenu === "status",
                }}
                style={styles.dropdownTrigger}
                onPress={() => {
                  setFilterMenu(
                    filterMenu === "status" ? null : "status"
                  );
                  setAssigneeMenuOpen(false);
                }}
              >
                <Text style={styles.dropdownText}>
                  {labelFilter(filter)}
                </Text>
                <Text style={styles.dropdownArrow}>▾</Text>
              </Pressable>

              {filterMenu === "status" && (
                <View style={styles.dropdownMenu}>
                  {(
                    [
                      "all",
                      "open",
                      "in_progress",
                      "done",
                      "canceled",
                    ] as Filter[]
                  ).map((value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: filter === value,
                      }}
                      style={[
                        styles.dropdownOption,
                        filter === value &&
                          styles.dropdownOptionActive,
                      ]}
                      onPress={() => {
                        setFilter(value);

                        if (
                          value === "done" ||
                          value === "canceled"
                        ) {
                          setQuickFilter("all");
                        }

                        setFilterMenu(null);
                      }}
                    >
                      <Text style={styles.dropdownOptionText}>
                        {labelFilter(value)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.filterControl}>
              <Text style={styles.filterCaption}>
                PERIODO PROGRAMADO
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  expanded: filterMenu === "period",
                }}
                style={styles.dropdownTrigger}
                onPress={() => {
                  setFilterMenu(
                    filterMenu === "period" ? null : "period"
                  );
                  setAssigneeMenuOpen(false);
                }}
              >
                <Text style={styles.dropdownText}>
                  {labelTimeFilter(timeFilter)}
                </Text>
                <Text style={styles.dropdownArrow}>▾</Text>
              </Pressable>

              {filterMenu === "period" && (
                <View style={styles.dropdownMenu}>
                  {(
                    ["all", "day", "week", "month"] as TimeFilter[]
                  ).map((value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: timeFilter === value,
                      }}
                      style={[
                        styles.dropdownOption,
                        timeFilter === value &&
                          styles.dropdownOptionActive,
                      ]}
                      onPress={() => {
                        setTimeFilter(value);
                        setQuickFilter("all");
                        setFilterMenu(null);
                      }}
                    >
                      <Text style={styles.dropdownOptionText}>
                        {labelTimeFilter(value)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {isAdminOrOwner && effectiveScope === "team" && (
              <View style={styles.filterControl}>
                <Text style={styles.filterCaption}>
                  RESPONSABLE
                </Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    expanded: assigneeMenuOpen,
                  }}
                  style={styles.dropdownTrigger}
                  onPress={() => {
                    setAssigneeMenuOpen((value) => !value);
                    setFilterMenu(null);
                  }}
                >
                  <Text
                    style={styles.dropdownText}
                    numberOfLines={1}
                  >
                    {assigneeActiveLabel}
                  </Text>
                  <Text style={styles.dropdownArrow}>▾</Text>
                </Pressable>

                {assigneeMenuOpen && (
                  <View style={styles.dropdownMenu}>
                    {memberChips.map((member) => (
                      <Pressable
                        key={member.id}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: assigneeFilter === member.id,
                        }}
                        style={[
                          styles.dropdownOption,
                          assigneeFilter === member.id &&
                            styles.dropdownOptionActive,
                        ]}
                        onPress={() => {
                          setAssigneeFilter(member.id);
                          setAssigneeMenuOpen(false);
                        }}
                      >
                        <Text style={styles.dropdownOptionText}>
                          {member.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          {timeFilter !== "all" && (
            <View style={{ gap: 5 }}>
              <Text style={styles.filterCaption}>
                FECHA BASE · VACÍO = HOY
              </Text>
              <TextInput
                value={timeFilterDateStr}
                onChangeText={setTimeFilterDateStr}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={SUBTLE}
                style={styles.dateFilterInput}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Fecha base del periodo"
              />
            </View>
          )}

          <View style={styles.filterShortcuts}>
            <Text style={{ color: SUBTLE, fontSize: 12 }}>
              Pendientes:
            </Text>

            {(
              [
                ["overdue", "De días anteriores"],
                ["undated", "Sin fecha"],
              ] as const
            ).map(([value, label]) => {
              const active = quickFilter === value;

              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.chip,
                    active && styles.chipActive,
                  ]}
                  onPress={() => {
                    const next = active ? "all" : value;
                    setQuickFilter(next);

                    if (next !== "all") {
                      setTimeFilter("all");
                      setTimeFilterDateStr("");

                      if (
                        filter === "done" ||
                        filter === "canceled"
                      ) {
                        setFilter("all");
                      }
                    }

                    setFilterMenu(null);
                    setAssigneeMenuOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                    ]}
                  >
                    {label}
                    {active ? " ×" : ""}
                  </Text>
                </Pressable>
              );
            })}

            {hasFilters && (
              <Pressable
                accessibilityRole="button"
                onPress={clearFilters}
                style={styles.clearFiltersButton}
              >
                <Text style={styles.clearFiltersText}>
                  Limpiar filtros
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {loadingRole && (
          <Text style={styles.permissionsText}>
            Verificando permisos…
          </Text>
        )}

        {!sidePanel && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowStats((value) => !value)}
            style={styles.chip}
          >
            <Text style={styles.chipText}>
              {showStats ? "Volver al listado" : "Ver estadísticas"}
            </Text>
          </Pressable>
        )}

        <View
          onLayout={(event) => {
            const nextWidth = Math.round(
              event.nativeEvent.layout.width
            );

            setContentWidth((previous) =>
              previous === nextWidth ? previous : nextWidth
            );
          }}
          style={[
            styles.contentColumns,
            { gap: sidePanel ? 20 : 0 },
          ]}
        >
          <View
            style={[
              styles.listColumn,
              {
                display:
                  !sidePanel && showStats ? "none" : "flex",
              },
            ]}
          >
            {loadingRole ? (
              <View style={styles.center}>
                <ActivityIndicator color={PRIMARY} />
                <Text style={styles.subtle}>
                  Preparando actividades…
                </Text>
              </View>
            ) : !queryEnabled ? (
              <View style={styles.center}>
                <Text style={styles.subtle}>
                  No pudimos cargar el workspace o verificar
                  tus permisos.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadRoleAndTenant()}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>Reintentar</Text>
                </Pressable>
              </View>
            ) : q.isLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={PRIMARY} />
                <Text style={styles.subtle}>
                  Cargando actividades…
                </Text>
              </View>
            ) : q.isError ? (
              <View style={styles.center}>
                <Text style={styles.errorText}>
                  No pudimos cargar las actividades.
                </Text>
                <Text style={styles.subtle}>
                  {q.error instanceof Error
                    ? q.error.message
                    : String(q.error)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void q.refetch()}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>Reintentar</Text>
                </Pressable>
              </View>
            ) : (
              <FlatList
                key={`${paginationKey}:${offset}`}
                data={data}
                keyExtractor={(item) => item.id}
                style={styles.list}
                ListHeaderComponent={
                  <View>
                    <Text style={styles.resultCount}>
                      {total === 0
                        ? "0 actividades"
                        : `${offset + 1}–${
                            offset + data.length
                          } de ${total} actividades`}
                    </Text>

                    {desktop && (
                      <View style={styles.tableHeader}>
                        <Text
                          style={[
                            styles.columnHeading,
                            styles.activityColumn,
                          ]}
                        >
                          Actividad
                        </Text>
                        <Text
                          style={[
                            styles.columnHeading,
                            styles.personColumn,
                          ]}
                        >
                          Responsables
                        </Text>
                        <Text
                          style={[
                            styles.columnHeading,
                            styles.contactColumn,
                          ]}
                        >
                          Contacto
                        </Text>
                        <Text
                          style={[
                            styles.columnHeading,
                            styles.dateColumn,
                          ]}
                        >
                          Fecha del evento
                        </Text>
                        <Text
                          style={[
                            styles.columnHeading,
                            styles.statusColumn,
                          ]}
                        >
                          Estado
                        </Text>
                      </View>
                    )}
                  </View>
                }
                refreshControl={
                  <RefreshControl
                    refreshing={q.isFetching}
                    onRefresh={onRefresh}
                  />
                }
                ListEmptyComponent={
                  <Text style={styles.subtle}>
                    No hay actividades para estos filtros.
                  </Text>
                }
                renderItem={({ item }) => (
                  <TaskCard
                    item={item}
                    desktop={desktop}
                    localEventMap={localEventMap}
                  />
                )}
                contentContainerStyle={{
                  gap: desktop ? 0 : 10,
                  paddingBottom: 20,
                }}
              />
            )}

            {queryEnabled && q.data && !q.isError && (
              <View style={styles.pagination}>
                <Text style={styles.paginationText}>
                  Página {currentPage} de {pageCount}
                  {q.isFetching ? " · Actualizando…" : ""}
                </Text>

                <View style={styles.paginationButtons}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Página anterior"
                    accessibilityState={{
                      disabled: offset === 0 || q.isFetching,
                    }}
                    disabled={offset === 0 || q.isFetching}
                    onPress={() => changePage(-1)}
                    style={[
                      styles.chip,
                      (offset === 0 || q.isFetching) &&
                        styles.disabled,
                    ]}
                  >
                    <Text style={styles.chipText}>
                      ← Anterior
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Página siguiente"
                    accessibilityState={{
                      disabled: !q.data.has_more || q.isFetching,
                    }}
                    disabled={!q.data.has_more || q.isFetching}
                    onPress={() => changePage(1)}
                    style={[
                      styles.chip,
                      (!q.data.has_more || q.isFetching) &&
                        styles.disabled,
                    ]}
                  >
                    <Text style={styles.chipText}>
                      Siguiente →
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          {(sidePanel || showStats) && (
            <ScrollView
              style={{
                flexGrow: sidePanel ? 0 : 1,
                flexShrink: sidePanel ? 0 : 1,
                flexBasis: sidePanel ? statsWidth : 0,
                width: sidePanel ? statsWidth : undefined,
                maxWidth: sidePanel ? statsWidth : undefined,
                minWidth: 0,
                minHeight: 0,
              }}
              contentContainerStyle={{
                paddingBottom: 20,
                width: "100%",
              }}
            >
              {statisticsPanel}
            </ScrollView>
          )}
        </View>
      </View>
    </>
  );
}

function getLastNoteBlock(
  notes?: string | null
): string | null {
  if (!notes) return null;

  const blocks = notes
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.length ? blocks[blocks.length - 1] : null;
}

function getContactLabel(
  activity: ActivityWithCreator
): string | null {
  const name =
    activity.contact_name ||
    activity.contact_title ||
    activity.contact?.name ||
    null;

  return name && String(name).trim()
    ? String(name).trim()
    : null;
}

function parseEventDateToMs(raw: unknown): number | null {
  if (raw == null) return null;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }

  if (typeof raw !== "string") return null;

  const value = raw.trim();
  if (!value) return null;

  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      0,
      0,
      0,
      0
    );

    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatEventLabelFromMs(milliseconds: number): string {
  const date = new Date(milliseconds);

  const hasTime = !(
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0
  );

  return hasTime
    ? date.toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : date.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

function getEventDateLabel(
  activity: ActivityWithCreator
): string | null {
  const raw =
    activity.event_at ??
    activity.event_start ??
    activity.calendar_start ??
    activity.calendar_event_start ??
    activity.due_date ??
    null;

  const milliseconds = parseEventDateToMs(raw);

  return milliseconds === null
    ? null
    : formatEventLabelFromMs(milliseconds);
}

function formatDate(
  value: number | string | null | undefined
): string {
  const milliseconds = parseEventDateToMs(value);
  if (milliseconds === null) return "—";

  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function labelFilter(filter: Filter): string {
  switch (filter) {
    case "open":
      return "Abiertas";
    case "in_progress":
      return "En proceso";
    case "done":
      return "Hechas";
    case "canceled":
      return "Canceladas";
    default:
      return "Todos los estados";
  }
}

function labelTimeFilter(filter: TimeFilter): string {
  switch (filter) {
    case "day":
      return "Día";
    case "week":
      return "Semana";
    case "month":
      return "Mes";
    default:
      return "Cualquier fecha";
  }
}

function TaskCard({
  item,
  desktop,
  localEventMap,
}: {
  item: ActivityWithCreator;
  desktop: boolean;
  localEventMap: Record<string, number>;
}) {
  const isDone = item.status === "done";
  const isInProgress = item.status === "in_progress";

  const statusLabel =
    item.status === "done"
      ? "Realizada"
      : item.status === "in_progress"
        ? "En proceso"
        : item.status === "canceled"
          ? "Cancelada"
          : "Abierta";

  const createdByLabel = item.created_by_name
    ? `por ${item.created_by_name}`
    : "";

  const assignedNames: string[] = [];

  if (item.assigned_to_name) {
    assignedNames.push(item.assigned_to_name);
  } else if (item.assigned_to) {
    assignedNames.push(String(item.assigned_to));
  }

  if (item.assigned_to_2_name) {
    assignedNames.push(item.assigned_to_2_name);
  } else if (item.assigned_to_2) {
    assignedNames.push(String(item.assigned_to_2));
  }

  const assignedInfo = assignedNames.length === 0
    ? " · sin asignar"
    : ` · asignada a ${assignedNames.join(" y ")}`;

  const createdLabel = item.created_at != null
    ? ` · creada el ${formatDate(item.created_at)}`
    : "";

  const lastNoteBlock = getLastNoteBlock(item.notes);
  const contactLabel = getContactLabel(item);

  const eventDateLabel =
    getEventDateLabel(item) ||
    (
      localEventMap[item.id]
        ? formatEventLabelFromMs(localEventMap[item.id])
        : null
    );

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
          {assignedNames.length
            ? assignedNames.join(" y ")
            : "Sin asignar"}
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
              isDone
                ? styles.statusBadgeDone
                : isInProgress
                  ? styles.statusBadgeProgress
                  : styles.statusBadgeOpen,
            ]}
          >
            <Text style={styles.statusBadgeText}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Link
      href={{
        pathname: "/tasks/[id]",
        params: { id: item.id },
      }}
      asChild
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Abrir actividad: ${item.title}`}
        hitSlop={8}
      >
        <View
          style={[
            styles.row,
            isDone && styles.rowDone,
            !isDone && isInProgress && styles.rowInProgress,
          ]}
        >
          <View style={styles.titleRow}>
            <Text
              style={[
                styles.title,
                isDone && styles.titleDone,
                !isDone && isInProgress && styles.titleInProgress,
              ]}
              numberOfLines={1}
            >
              {item.title || "Sin título"}
            </Text>

            <View style={styles.rightMeta}>
              {!!contactLabel && (
                <View style={styles.contactChip}>
                  <Text
                    style={styles.contactChipText}
                    numberOfLines={1}
                  >
                    Contacto: {contactLabel}
                  </Text>
                </View>
              )}

              {!!eventDateLabel && (
                <View style={styles.eventChip}>
                  <Text
                    style={styles.eventChipText}
                    numberOfLines={1}
                  >
                    Evento para: {eventDateLabel}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <Text
            style={[
              styles.sub,
              isDone && styles.subDone,
              !isDone && isInProgress && styles.subInProgress,
            ]}
            numberOfLines={3}
          >
            {(item.type || "task") +
              " · " +
              statusLabel +
              (createdByLabel ? ` · ${createdByLabel}` : "") +
              assignedInfo +
              createdLabel +
              (isDone ? " · tarea completada" : "")}
          </Text>

          {!!lastNoteBlock && (
            <Text style={styles.lastNoteText} numberOfLines={2}>
              {lastNoteBlock}
            </Text>
          )}

          {isDone && (
            <View style={styles.badgeDone}>
              <Text style={styles.badgeDoneText}>
                Tarea completada
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
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
  pageTitle: {
    color: TEXT,
    fontSize: 25,
    fontWeight: "700",
  },
  pageDescription: {
    color: SUBTLE,
    fontSize: 13,
    lineHeight: 20,
  },
  createButton: {
    backgroundColor: PRIMARY,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 42,
    justifyContent: "center",
  },
  createButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  scopeBar: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 10,
    backgroundColor: "#eeedf4",
    alignSelf: "flex-start",
  },
  scopeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  scopeButtonActive: {
    backgroundColor: CARD,
  },
  scopeText: {
    color: SUBTLE,
    fontWeight: "600",
    fontSize: 12,
  },
  scopeTextActive: {
    color: PRIMARY,
  },
  filterCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  filterControls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  filterControl: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 160,
    gap: 6,
  },
  filterCaption: {
    color: SUBTLE,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  filterShortcuts: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
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
  dropdownArrow: {
    color: SUBTLE,
    fontSize: 10,
  },
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
  dropdownOptionActive: {
    backgroundColor: "#f1ecfa",
  },
  dropdownOptionText: {
    color: TEXT,
    fontSize: 12,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 7,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: {
    backgroundColor: "#eee8f8",
    borderColor: "#b49bdc",
  },
  chipText: {
    color: SUBTLE,
    fontWeight: "600",
    fontSize: 12,
  },
  chipTextActive: {
    color: PRIMARY,
  },
  clearFiltersButton: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  clearFiltersText: {
    color: PRIMARY,
    fontSize: 12,
    fontWeight: "600",
  },
  permissionsText: {
    color: SUBTLE,
    fontSize: 11,
  },
  contentColumns: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    flexDirection: "row",
  },
  listColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
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
  columnHeading: {
    color: "#596274",
    fontSize: 11,
    fontWeight: "600",
  },
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
  tableRowHover: {
    backgroundColor: "#faf8fe",
  },
  activityColumn: {
    flex: 3,
    minWidth: 0,
    gap: 5,
  },
  personColumn: {
    flex: 1.7,
    minWidth: 0,
  },
  contactColumn: {
    flex: 1.5,
    minWidth: 0,
  },
  dateColumn: {
    flex: 1.5,
    minWidth: 0,
  },
  statusColumn: {
    width: 100,
  },
  tableTitle: {
    color: TEXT,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  tableSecondary: {
    color: SUBTLE,
    fontSize: 11,
    lineHeight: 17,
  },
  tableCell: {
    color: "#475467",
    fontSize: 12,
    lineHeight: 19,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusBadgeOpen: {
    backgroundColor: "#eef0f5",
  },
  statusBadgeProgress: {
    backgroundColor: "#e8f0ff",
  },
  statusBadgeDone: {
    backgroundColor: "#e3f4e9",
  },
  statusBadgeText: {
    color: "#344054",
    fontSize: 11,
    fontWeight: "500",
  },
  row: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 16,
    gap: 9,
  },
  rowDone: {
    borderColor: "#badfc8",
    backgroundColor: "#f4fbf6",
  },
  rowInProgress: {
    borderColor: "#bed0f1",
    backgroundColor: "#f4f7fe",
  },
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
  titleDone: {
    color: SUCCESS,
  },
  titleInProgress: {
    color: "#2858a5",
  },
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
  contactChipText: {
    color: "#596274",
    fontSize: 11,
    fontWeight: "500",
  },
  eventChip: {
    borderWidth: 1,
    borderColor: "#e2d9f2",
    backgroundColor: "#f1ecfa",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    maxWidth: "100%",
  },
  eventChipText: {
    color: PRIMARY,
    fontSize: 11,
    fontWeight: "500",
  },
  sub: {
    color: SUBTLE,
    fontSize: 12,
    lineHeight: 20,
  },
  subDone: {
    color: "#587a65",
  },
  subInProgress: {
    color: "#526d96",
  },
  subtle: {
    color: SUBTLE,
    textAlign: "center",
    marginTop: 8,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  errorText: {
    color: "#b54738",
    fontSize: 13,
    textAlign: "center",
  },
  badgeDone: {
    alignSelf: "flex-start",
    backgroundColor: "#e3f4e9",
    borderRadius: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  badgeDoneText: {
    color: SUCCESS,
    fontWeight: "600",
    fontSize: 11,
  },
  lastNoteText: {
    color: SUBTLE,
    fontSize: 12,
    lineHeight: 19,
  },
  pagination: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 8,
  },
  paginationText: {
    color: SUBTLE,
    fontSize: 12,
  },
  paginationButtons: {
    flexDirection: "row",
    gap: 8,
  },
  disabled: {
    opacity: 0.45,
  },
});