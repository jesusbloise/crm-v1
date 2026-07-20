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

function displayUserName(item: TimeEntry) {
  return item.user_name || item.user_email || "Sin nombre";
}

function formatAssignmentTime(item: WorkAssignment) {
  if (item.start_time && item.end_time) {
    return `${item.start_time} - ${item.end_time}`;
  }

  if (item.start_time) return item.start_time;

  return "Sin hora";
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

function AssignmentRow({ item }: { item: WorkAssignment }) {
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
  const assignments = qAssignments.data?.rows ?? [];
  const canAdminHours = role === "owner" || role === "admin";

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
        data={entries}
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
                  <AssignmentRow key={item.id} item={item} />
                ))}
              </View>
            )}

            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>Historial</Text>
              <Text style={styles.listCounter}>{entries.length} registros</Text>
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
});