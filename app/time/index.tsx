import { getRoleNow } from "@/src/api/auth";
import {
  createTimeEntry,
  listMyTimeEntries,
  listWorkItems,
  listWorkProjects,
  type TimeEntry,
} from "@/src/api/timeTracking";
import {
  listMyWorkAssignments,
  updateWorkAssignment,
  type WorkAssignment,
} from "@/src/api/workAssignments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const BG = "#0b0c10";
const CARD = "#14151a";
const BORDER = "#272a33";
const FIELD = "#121318";
const TEXT = "#e8ecf1";
const SUBTLE = "#a9b0bd";
const ACCENT = "#7c3aed";
const ACCENT_2 = "#22d3ee";

type DropdownOption = {
  id: string;
  label: string;
  sublabel?: string | null;
};

type WeeklyDay = {
  key: string;
  label: string;
  value: number;
};

type TopSummary = {
  label: string;
  value: number;
};

function todayLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function moneyDate(date?: string | null) {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

function toNumber(v: string | number | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatHours(v: string | number | null | undefined) {
  const totalMinutes = Math.round(toNumber(v) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
function dateKey(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseLocalDate(value?: string | null) {
  if (!value) return null;

  const parts = value.split("-").map(Number);
  if (parts.length !== 3) return null;

  const [year, month, day] = parts;
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function startOfCurrentWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() + diff);

  return monday;
}

function sameMonth(date: Date, base: Date) {
  return (
    date.getFullYear() === base.getFullYear() &&
    date.getMonth() === base.getMonth()
  );
}

function getTopSummary(
  rows: TimeEntry[],
  field: "project_name" | "item_name"
): TopSummary {
  const map = new Map<string, number>();

  for (const row of rows) {
    const label = String(row[field] || "Sin nombre").trim() || "Sin nombre";
    map.set(label, (map.get(label) || 0) + toNumber(row.hours));
  }

  const [first] = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);

  if (!first) {
    return {
      label: "Sin datos",
      value: 0,
    };
  }

  return {
    label: first[0],
    value: first[1],
  };
}

function displayUserName(item: TimeEntry) {
  return item.user_name || item.user_email || "Sin nombre";
}

function entrySearchText(item: TimeEntry) {
  return [
    displayUserName(item),
    item.work_date,
    moneyDate(item.work_date),
    item.project_name,
    item.item_name,
    item.hours,
    item.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function formatAssignmentTime(item: WorkAssignment) {
  if (item.start_time && item.end_time) {
    return `${item.start_time} - ${item.end_time}`;
  }

  if (item.start_time) return item.start_time;

  return "Sin hora";
}
function SummaryStat({
  label,
  value,
  subvalue,
}: {
  label: string;
  value: string;
  subvalue?: string;
}) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryStatValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.summaryStatLabel} numberOfLines={1}>
        {label}
      </Text>
      {!!subvalue && (
        <Text style={styles.summaryStatSubvalue} numberOfLines={1}>
          {subvalue}
        </Text>
      )}
    </View>
  );
}

function WeeklyChart({ data }: { data: WeeklyDay[] }) {
  const max = Math.max(...data.map((item) => item.value), 0);

  return (
    <View style={styles.weeklyCard}>
      <View style={styles.weeklyHeader}>
        <View>
          <Text style={styles.weeklyTitle}>Horas esta semana</Text>
          <Text style={styles.weeklySubtitle}>Lunes a domingo</Text>
        </View>

        <Text style={styles.weeklyTotal}>
          {formatHours(data.reduce((sum, item) => sum + item.value, 0))}
        </Text>
      </View>

      <View style={styles.weeklyBars}>
        {data.map((item) => {
          const height = max > 0 ? Math.max(8, Math.round((item.value / max) * 78)) : 8;

          return (
            <View key={item.key} style={styles.weeklyDay}>
              <View style={styles.weeklyBarTrack}>
                <View style={[styles.weeklyBarFill, { height }]} />
              </View>

              <Text style={styles.weeklyDayLabel}>{item.label}</Text>
              <Text style={styles.weeklyDayValue}>{formatHours(item.value)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
function PersonalSummary({
  weekTotal,
  monthTotal,
  topProject,
  topItem,
  weeklyDays,
}: {
  weekTotal: number;
  monthTotal: number;
  topProject: TopSummary;
  topItem: TopSummary;
  weeklyDays: WeeklyDay[];
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <View>
          <Text style={styles.summaryTitle}>Mi resumen</Text>
          <Text style={styles.summarySubtitle}>
            Vista rapida de tus horas personales
          </Text>
        </View>
      </View>

      <View style={styles.summaryStatsGrid}>
        <SummaryStat label="Semana actual" value={formatHours(weekTotal)} />
        <SummaryStat label="Mes actual" value={formatHours(monthTotal)} />
        <SummaryStat
          label="Proyecto top"
          value={topProject.label}
          subvalue={formatHours(topProject.value)}
        />
        <SummaryStat
          label="Item top"
          value={topItem.label}
          subvalue={formatHours(topItem.value)}
        />
      </View>

      <View style={styles.weeklyFullWidth}>
        <WeeklyChart data={weeklyDays} />
      </View>
    </View>
  );
}
function SelectDropdown({
  label,
  value,
  placeholder,
  options,
  open,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: DropdownOption[];
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}) {
  const selected = options.find((o) => o.id === value) || null;

  return (
    <View>
      <Text style={styles.label}>{label}</Text>

      <Pressable style={styles.dropdownButton} onPress={onToggle}>
        <Text style={styles.dropdownButtonText} numberOfLines={1}>
          {selected?.label || placeholder}
        </Text>

        <Text style={styles.dropdownIcon}>{open ? "Cerrar" : "Abrir"}</Text>
      </Pressable>

      {open && (
        <View style={styles.dropdownMenu}>
          <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
            {options.map((option) => (
              <Pressable
                key={option.id}
                style={[
                  styles.dropdownOption,
                  value === option.id && styles.dropdownOptionActive,
                ]}
                onPress={() => onSelect(option.id)}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    value === option.id && styles.dropdownOptionTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>

                {!!option.sublabel && (
                  <Text style={styles.dropdownRole} numberOfLines={1}>
                    {option.sublabel}
                  </Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function EntryRow({ item }: { item: TimeEntry }) {
  return (
    <View style={styles.timeRow}>
      <View style={styles.cellDate}>
        <Text style={styles.cellText}>{moneyDate(item.work_date)}</Text>
      </View>

      <View style={styles.cellName}>
        <Text style={styles.cellText} numberOfLines={1}>
          {displayUserName(item)}
        </Text>
      </View>

      <View style={styles.cellProject}>
        <Text style={styles.cellText} numberOfLines={1}>
          {item.project_name}
        </Text>

        {!!item.description && (
          <Text style={styles.cellMuted} numberOfLines={1}>
            {item.description}
          </Text>
        )}
      </View>

      <View style={styles.cellItem}>
        <Text style={styles.itemBadgeText} numberOfLines={1}>
          {item.item_name}
        </Text>
      </View>

      <View style={styles.cellTime}>
        <Text style={styles.timeValue}>{formatHours(item.hours)}</Text>
      </View>
    </View>
  );
}

function AssignmentRow({
  item,
  busy,
  onRegister,
}: {
  item: WorkAssignment;
  busy: boolean;
  onRegister: (item: WorkAssignment) => void;
}) {
  return (
    <View style={styles.assignmentRow}>
      <View style={styles.assignmentTop}>
        <Text style={styles.assignmentTitle} numberOfLines={1}>
          {item.project_name}
        </Text>

        <Text style={styles.assignmentHours}>
          {formatHours(item.estimated_hours)}
        </Text>
      </View>

      <Text style={styles.assignmentMeta} numberOfLines={1}>
        {moneyDate(item.assignment_date)}   {formatAssignmentTime(item)}
      </Text>

      <Text style={styles.assignmentMeta} numberOfLines={1}>
        Item: {item.item_name}
      </Text>

      {!!item.description && (
        <Text style={styles.assignmentDesc} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      <Pressable
        style={[styles.assignmentButton, busy && styles.submitButtonDisabled]}
        disabled={busy}
        onPress={() => onRegister(item)}
      >
        <Text style={styles.assignmentButtonText}>
          {busy ? "Registrando..." : "Registrar como realizada"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function TimeIndexScreen() {
  const qc = useQueryClient();

  const [projectId, setProjectId] = useState("");
  const [itemId, setItemId] = useState("");
  const [workDate, setWorkDate] = useState(todayLocal());
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openDropdown, setOpenDropdown] = useState<"project" | "item" | null>(
    null
  );

  const qProjects = useQuery({
    queryKey: ["work-projects"],
    queryFn: () => listWorkProjects(),
  });

  const qItems = useQuery({
    queryKey: ["work-items"],
    queryFn: () => listWorkItems(),
  });

  const qMine = useQuery({
    queryKey: ["time-entries", "mine"],
    queryFn: () => listMyTimeEntries(),
  });

  const qAssignments = useQuery({
    queryKey: ["work-assignments", "mine"],
    queryFn: () => listMyWorkAssignments(),
  });

  const projects = qProjects.data ?? [];
  const items = qItems.data ?? [];
  const entries = qMine.data?.rows ?? [];
  const visibleEntries = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return entries;

    return entries.filter((item) => entrySearchText(item).includes(q));
  }, [entries, search]);
  const assignments = (qAssignments.data?.rows ?? []).filter(
    (item) => item.status === "assigned"
  );
  const canAdminHours = role === "owner" || role === "admin";
const weeklyDays = useMemo<WeeklyDay[]>(() => {
  const labels = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
  const start = startOfCurrentWeek();

  const days = labels.map((label, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);

    return {
      key: dateKey(d),
      label,
      value: 0,
    };
  });

  const indexByKey = new Map(days.map((day, index) => [day.key, index]));

  for (const entry of entries) {
    const idx = indexByKey.get(entry.work_date);
    if (idx !== undefined) {
      days[idx].value += toNumber(entry.hours);
    }
  }

  return days;
}, [entries]);

const weekTotal = useMemo(() => {
  return weeklyDays.reduce((sum, day) => sum + day.value, 0);
}, [weeklyDays]);

const monthRows = useMemo(() => {
  const now = new Date();

  return entries.filter((entry) => {
    const d = parseLocalDate(entry.work_date);
    return d ? sameMonth(d, now) : false;
  });
}, [entries]);

const monthTotal = useMemo(() => {
  return monthRows.reduce((sum, entry) => sum + toNumber(entry.hours), 0);
}, [monthRows]);

const topProject = useMemo(() => {
  return getTopSummary(monthRows, "project_name");
}, [monthRows]);

const topItem = useMemo(() => {
  return getTopSummary(monthRows, "item_name");
}, [monthRows]);

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [projectId, projects]);

  useEffect(() => {
    if (!itemId && items.length > 0) {
      setItemId(items[0].id);
    }
  }, [itemId, items]);

  useEffect(() => {
    getRoleNow().then((r) => setRole(r));
  }, []);

  const projectOptions = useMemo<DropdownOption[]>(
    () =>
      projects.map((p) => ({
        id: p.id,
        label: p.name,
        sublabel: p.client_name || p.description || null,
      })),
    [projects]
  );

  const itemOptions = useMemo<DropdownOption[]>(
    () =>
      items.map((it) => ({
        id: it.id,
        label: it.name,
        sublabel: it.description || null,
      })),
    [items]
  );

  function toggleDropdown(name: "project" | "item") {
    setOpenDropdown((current) => (current === name ? null : name));
  }

  const createMut = useMutation({
    mutationFn: createTimeEntry,
    onSuccess: async () => {
      setHours("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["time-entries", "mine"] });
      Alert.alert("Listo", "Horas registradas correctamente.");
    },
    onError: (err: any) => {
      Alert.alert(
        "No se pudo registrar",
        err?.message || "Revisa los datos e intenta nuevamente."
      );
    },
  });

  const completeAssignmentMut = useMutation({
    mutationFn: async (assignment: WorkAssignment) => {
      await createTimeEntry({
        project_id: assignment.project_id,
        item_id: assignment.item_id,
        work_date: assignment.assignment_date,
        hours: Number(assignment.estimated_hours || 0),
        description: assignment.description || null,
      });

      await updateWorkAssignment(assignment.id, {
        status: "done",
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["time-entries", "mine"] });
      await qc.invalidateQueries({ queryKey: ["work-assignments", "mine"] });
      await qc.invalidateQueries({ queryKey: ["time-entries"] });
      await qc.invalidateQueries({ queryKey: ["work-assignments"] });

      Alert.alert("Listo", "Asignacion registrada como hora realizada.");
    },
    onError: (err: any) => {
      Alert.alert(
        "No se pudo registrar",
        err?.message || "No se pudo convertir la asignacion en hora realizada."
      );
    },
  });

  const loading =
    qProjects.isLoading ||
    qItems.isLoading ||
    qMine.isLoading ||
    qAssignments.isLoading;

  const refreshing =
    qProjects.isFetching ||
    qItems.isFetching ||
    qMine.isFetching ||
    qAssignments.isFetching;

  const canSubmit =
    !!projectId &&
    !!itemId &&
    !!workDate &&
    !!hours &&
    Number(hours) > 0 &&
    !createMut.isPending;

  const onSubmit = () => {
    const h = Number(hours);

    if (!projectId) {
      Alert.alert("Falta proyecto", "Selecciona un proyecto.");
      return;
    }

    if (!itemId) {
      Alert.alert("Falta item", "Selecciona un item.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      Alert.alert("Fecha invalida", "Usa el formato YYYY-MM-DD.");
      return;
    }

    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      Alert.alert("Horas invalidas", "Ingresa un numero entre 0 y 24.");
      return;
    }

    createMut.mutate({
      project_id: projectId,
      item_id: itemId,
      work_date: workDate,
      hours: h,
      description: description.trim() || null,
    });
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "Mis horas" }} />

      <FlatList
        data={visibleEntries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              qProjects.refetch();
              qItems.refetch();
              qMine.refetch();
              qAssignments.refetch();
            }}
            tintColor={ACCENT}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>Registro de horas</Text>
                <Text style={styles.title}>Mis horas</Text>
                <Text style={styles.subtitle}>
                  Registra el trabajo realizado por proyecto e item.
                </Text>

                {canAdminHours && (
                  <Pressable
                    style={styles.adminButton}
                    onPress={() => router.push("/time/admin" as any)}
                  >
                    <Text style={styles.adminButtonText}>Administrar horas</Text>
                  </Pressable>
                )}
              </View>
            </View>
<PersonalSummary
  weekTotal={weekTotal}
  monthTotal={monthTotal}
  topProject={topProject}
  topItem={topItem}
  weeklyDays={weeklyDays}
/>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Nuevo registro</Text>

              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color={ACCENT} />
                  <Text style={styles.loadingText}>Cargando datos...</Text>
                </View>
              ) : (
                <>
                  {projects.length === 0 ? (
                    <>
                      <Text style={styles.label}>Proyecto</Text>
                      <Text style={styles.emptyText}>
                        No hay proyectos activos. Un admin debe crear proyectos.
                      </Text>
                    </>
                  ) : (
                    <SelectDropdown
                      label="Proyecto"
                      value={projectId}
                      placeholder="Selecciona un proyecto"
                      options={projectOptions}
                      open={openDropdown === "project"}
                      onToggle={() => toggleDropdown("project")}
                      onSelect={(id) => {
                        setProjectId(id);
                        setOpenDropdown(null);
                      }}
                    />
                  )}

                  {items.length === 0 ? (
                    <>
                      <Text style={styles.label}>Item</Text>
                      <Text style={styles.emptyText}>
                        No hay items activos. Un admin debe crear items.
                      </Text>
                    </>
                  ) : (
                    <SelectDropdown
                      label="Item"
                      value={itemId}
                      placeholder="Selecciona un item"
                      options={itemOptions}
                      open={openDropdown === "item"}
                      onToggle={() => toggleDropdown("item")}
                      onSelect={(id) => {
                        setItemId(id);
                        setOpenDropdown(null);
                      }}
                    />
                  )}

                  <View style={styles.row}>
                    <View style={styles.col}>
                      <Text style={styles.label}>Fecha</Text>
                      <TextInput
                        value={workDate}
                        onChangeText={setWorkDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#6b7280"
                        style={styles.input}
                      />
                    </View>

                    <View style={styles.col}>
                      <Text style={styles.label}>Horas</Text>
                      <TextInput
                        value={hours}
                        onChangeText={setHours}
                        placeholder="Ej: 2.5"
                        placeholderTextColor="#6b7280"
                        keyboardType="decimal-pad"
                        style={styles.input}
                      />
                    </View>
                  </View>

                  <Text style={styles.label}>Comentario</Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Describe brevemente lo realizado"
                    placeholderTextColor="#6b7280"
                    style={[styles.input, styles.textArea]}
                    multiline
                  />

                  <Pressable
                    onPress={onSubmit}
                    disabled={!canSubmit}
                    style={[
                      styles.submitButton,
                      !canSubmit && styles.submitButtonDisabled,
                    ]}
                  >
                    <Text style={styles.submitText}>
                      {createMut.isPending ? "Guardando..." : "Registrar horas"}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>

            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>Mis asignaciones futuras</Text>
              <Text style={styles.listCounter}>
                {assignments.length} pendientes
              </Text>
            </View>

            {assignments.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  Sin asignaciones pendientes
                </Text>
                <Text style={styles.emptyText}>
                  Cuando un admin te asigne horas futuras, apareceran aqui.
                </Text>
              </View>
            ) : (
              <View style={styles.assignmentsBox}>
                {assignments.map((item) => (
                  <AssignmentRow
                    key={item.id}
                    item={item}
                    busy={completeAssignmentMut.isPending}
                    onRegister={(assignment) => {
                      completeAssignmentMut.mutate(assignment);
                    }}
                  />
                ))}
              </View>
            )}

            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>Historial</Text>
              <Text style={styles.listCounter}>
                {visibleEntries.length} de {entries.length} registros
              </Text>
            </View>

            <View style={styles.searchBox}>
              <Text style={styles.label}>Buscar en mis horas</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar por proyecto, item, fecha o comentario"
                placeholderTextColor="#6b7280"
                style={styles.input}
              />

              {!!search.trim() && (
                <Pressable style={styles.clearSearchButton} onPress={() => setSearch("")}>
                  <Text style={styles.clearSearchText}>Limpiar busqueda</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.tableHeader}>
              <View style={styles.cellDate}>
                <Text style={styles.headerText}>Fecha</Text>
              </View>

              <View style={styles.cellName}>
                <Text style={styles.headerText}>Nombre</Text>
              </View>

              <View style={styles.cellProject}>
                <Text style={styles.headerText}>Proyecto</Text>
              </View>

              <View style={styles.cellItem}>
                <Text style={styles.headerText}>Item</Text>
              </View>

              <View style={styles.cellTime}>
                <Text style={styles.headerText}>Tiempo</Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => <EntryRow item={item} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Sin registros todavia</Text>
              <Text style={styles.emptyText}>
                Cuando registres horas, apareceran aqui.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 16,
    paddingBottom: 110,
  },
  header: {
    flexDirection: "row",
    gap: 14,
    alignItems: "stretch",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  kicker: {
    color: ACCENT_2,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  title: {
    color: TEXT,
    fontSize: 28,
    fontWeight: "900",
  },
  subtitle: {
    color: SUBTLE,
    marginTop: 4,
    maxWidth: 520,
  },
  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 14,
    marginBottom: 18,
  },
  sectionTitle: {
    color: TEXT,
    fontSize: 18,
    fontWeight: "900",
  },
  label: {
    color: SUBTLE,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 14,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  col: {
    flex: 1,
  },
  input: {
    backgroundColor: FIELD,
    borderWidth: 1,
    borderColor: BORDER,
    color: TEXT,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontWeight: "700",
  },
  textArea: {
    minHeight: 78,
    textAlignVertical: "top",
  },
  submitButton: {
    marginTop: 16,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: "#fff",
    fontWeight: "900",
  },
  loadingBox: {
    paddingVertical: 24,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: SUBTLE,
    fontWeight: "700",
  },
  listHeader: {
    marginTop: 6,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listCounter: {
    color: SUBTLE,
    fontWeight: "800",
  },
  emptyState: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    color: TEXT,
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 4,
  },
  emptyText: {
    color: SUBTLE,
    lineHeight: 20,
  },
  adminButton: {
    alignSelf: "flex-start",
    marginTop: 12,
    backgroundColor: "rgba(124,58,237,0.16)",
    borderColor: "rgba(124,58,237,0.45)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  adminButtonText: {
    color: TEXT,
    fontWeight: "900",
  },

  assignmentsBox: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 18,
  },
  assignmentRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomColor: BORDER,
    borderBottomWidth: 1,
    gap: 4,
  },
  assignmentTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  assignmentTitle: {
    color: TEXT,
    fontWeight: "900",
    fontSize: 14,
    flex: 1,
  },
  assignmentHours: {
    color: ACCENT_2,
    fontWeight: "900",
    fontSize: 14,
  },
  assignmentMeta: {
    color: SUBTLE,
    fontWeight: "800",
    fontSize: 12,
  },
  assignmentDesc: {
    color: TEXT,
    opacity: 0.88,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  assignmentButton: {
    alignSelf: "flex-start",
    marginTop: 8,
    backgroundColor: "rgba(124,58,237,0.18)",
    borderColor: "rgba(124,58,237,0.45)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  assignmentButtonText: {
    color: TEXT,
    fontWeight: "900",
    fontSize: 12,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: FIELD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 6,
  },
  headerText: {
    color: SUBTLE,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 6,
  },
  cellDate: {
    width: 92,
    paddingRight: 8,
  },
  cellName: {
    width: 120,
    paddingRight: 8,
  },
  cellProject: {
    width: 300,
    paddingRight: 8,
  },
  cellItem: {
    width: 86,
    paddingRight: 8,
  },
  cellTime: {
    width: 58,
    alignItems: "flex-end",
  },
  cellText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "800",
  },
  cellMuted: {
    color: SUBTLE,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  itemBadgeText: {
    color: ACCENT_2,
    fontSize: 12,
    fontWeight: "900",
  },
  timeValue: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "900",
  },

  dropdownButton: {
    backgroundColor: FIELD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  dropdownButtonText: {
    color: TEXT,
    fontWeight: "800",
    flex: 1,
  },
  dropdownIcon: {
    color: ACCENT_2,
    fontWeight: "900",
    fontSize: 12,
  },
  dropdownMenu: {
    marginTop: 8,
    backgroundColor: "#1b1d24",
    borderColor: "#3a3f4d",
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  dropdownScroll: {
    maxHeight: 360,
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomColor: "#313543",
    borderBottomWidth: 1,
  },
  dropdownOptionActive: {
    backgroundColor: "rgba(124,58,237,0.22)",
  },
  dropdownOptionText: {
    color: SUBTLE,
    fontWeight: "800",
  },
  dropdownOptionTextActive: {
    color: TEXT,
  },
  dropdownRole: {
    color: ACCENT_2,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  searchBox: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  clearSearchButton: {
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: FIELD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearSearchText: {
    color: TEXT,
    fontWeight: "900",
    fontSize: 12,
  },
  summaryCard: {
  backgroundColor: CARD,
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: 20,
  padding: 14,
  marginBottom: 18,
},
summaryHeader: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 12,
},
summaryTitle: {
  color: TEXT,
  fontSize: 18,
  fontWeight: "900",
},
summarySubtitle: {
  color: SUBTLE,
  marginTop: 4,
  fontWeight: "700",
},
summaryLayout: {
  flexDirection: "row",
  gap: 12,
  flexWrap: "wrap",
},
summaryLeft: {
  flex: 1,
  minWidth: 280,
},
summaryRight: {
  flex: 1.2,
  minWidth: 320,
},
summaryStatsGrid: {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 10,
},
summaryStat: {
  flex: 1,
  minWidth: 160,
  backgroundColor: FIELD,
  borderColor: BORDER,
  borderWidth: 1,
  borderRadius: 16,
  padding: 12,
},
summaryStatValue: {
  color: TEXT,
  fontSize: 17,
  fontWeight: "900",
},
summaryStatLabel: {
  color: SUBTLE,
  fontSize: 11,
  fontWeight: "900",
  marginTop: 4,
  textTransform: "uppercase",
},
summaryStatSubvalue: {
  color: ACCENT_2,
  fontSize: 12,
  fontWeight: "900",
  marginTop: 4,
},
weeklyCard: {
  backgroundColor: FIELD,
  borderColor: BORDER,
  borderWidth: 1,
  borderRadius: 16,
  padding: 12,
},
weeklyHeader: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 12,
},
weeklyTitle: {
  color: TEXT,
  fontWeight: "900",
  fontSize: 14,
},
weeklySubtitle: {
  color: SUBTLE,
  fontWeight: "700",
  fontSize: 11,
  marginTop: 2,
},
weeklyTotal: {
  color: ACCENT_2,
  fontWeight: "900",
  fontSize: 14,
},
weeklyBars: {
  flexDirection: "row",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 8,
  minHeight: 126,
},
weeklyDay: {
  flex: 1,
  alignItems: "center",
  gap: 5,
},
weeklyBarTrack: {
  width: "100%",
  maxWidth: 34,
  height: 82,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.07)",
  overflow: "hidden",
  justifyContent: "flex-end",
},
weeklyBarFill: {
  width: "100%",
  backgroundColor: ACCENT,
  borderRadius: 999,
},
weeklyDayLabel: {
  color: SUBTLE,
  fontWeight: "900",
  fontSize: 11,
},
weeklyDayValue: {
  color: TEXT,
  fontWeight: "900",
  fontSize: 10,
},
weeklyFullWidth: {
  marginTop: 12,
},
});