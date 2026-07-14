import { getRoleNow } from "@/src/api/auth";
import {
  createTimeEntry,
  listMyTimeEntries,
  listWorkItems,
  listWorkProjects,
  type TimeEntry,
  type WorkItem,
  type WorkProject,
} from "@/src/api/timeTracking";
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

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function EntryCard({ item }: { item: TimeEntry }) {
  return (
    <View style={styles.entryCard}>
      <View style={styles.entryTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.entryTitle}>{item.project_name}</Text>
          <Text style={styles.entrySub}>
            {item.item_name} � {moneyDate(item.work_date)}
          </Text>
        </View>

        <View style={styles.hoursBadge}>
          <Text style={styles.hoursText}>{toNumber(item.hours)} h</Text>
        </View>
      </View>

      {!!item.description && (
        <Text style={styles.entryDescription}>{item.description}</Text>
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

  const projects = qProjects.data ?? [];
  const items = qItems.data ?? [];
  const entries = qMine.data?.rows ?? [];
  const totalHours = qMine.data?.total_hours ?? 0;
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


  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId]
  );

  const selectedItem = useMemo(
    () => items.find((i) => i.id === itemId),
    [items, itemId]
  );

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

  const loading = qProjects.isLoading || qItems.isLoading || qMine.isLoading;
  const refreshing =
    qProjects.isFetching || qItems.isFetching || qMine.isFetching;

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
      Alert.alert("Falta �tem", "Selecciona un �tem.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      Alert.alert("Fecha inv�lida", "Usa el formato YYYY-MM-DD.");
      return;
    }

    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      Alert.alert("Horas inv�lidas", "Ingresa un n�mero entre 0 y 24.");
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
            }}
            tintColor={ACCENT}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={{ flex: 1 }}>
  <Text style={styles.kicker}>Registro de horas</Text>
  <Text style={styles.title}>Mis horas</Text>
  <Text style={styles.subtitle}>
    Registra el trabajo realizado por proyecto e ítem.
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
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Nuevo registro</Text>

              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color={ACCENT} />
                  <Text style={styles.loadingText}>Cargando datos...</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.label}>Proyecto</Text>
                  {projects.length === 0 ? (
                    <Text style={styles.emptyText}>
                      No hay proyectos activos. Un admin debe crear proyectos.
                    </Text>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.pillRow}
                    >
                      {projects.map((p: WorkProject) => (
                        <Pill
                          key={p.id}
                          label={p.name}
                          active={p.id === projectId}
                          onPress={() => setProjectId(p.id)}
                        />
                      ))}
                    </ScrollView>
                  )}

                  {!!selectedProject?.client_name && (
                    <Text style={styles.hint}>
                      Cliente: {selectedProject.client_name}
                    </Text>
                  )}

                  <Text style={styles.label}>�tem</Text>
                  {items.length === 0 ? (
                    <Text style={styles.emptyText}>
                      No hay �tems activos. Un admin debe crear �tems.
                    </Text>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.pillRow}
                    >
                      {items.map((it: WorkItem) => (
                        <Pill
                          key={it.id}
                          label={it.name}
                          active={it.id === itemId}
                          onPress={() => setItemId(it.id)}
                        />
                      ))}
                    </ScrollView>
                  )}

                  {!!selectedItem?.description && (
                    <Text style={styles.hint}>{selectedItem.description}</Text>
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
              <Text style={styles.sectionTitle}>Historial</Text>
              <Text style={styles.listCounter}>{entries.length} registros</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => <EntryCard item={item} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Sin registros todav�a</Text>
              <Text style={styles.emptyText}>
                Cuando registres horas, aparecer�n aqu�.
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
  totalCard: {
    minWidth: 96,
    backgroundColor: "rgba(124,58,237,0.12)",
    borderColor: "rgba(124,58,237,0.45)",
    borderWidth: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  totalNumber: {
    color: TEXT,
    fontSize: 24,
    fontWeight: "900",
  },
  totalLabel: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: "800",
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
  pillRow: {
    gap: 8,
    paddingRight: 12,
  },
  pill: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: FIELD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  pillActive: {
    backgroundColor: "rgba(124,58,237,0.16)",
    borderColor: ACCENT,
  },
  pillText: {
    color: SUBTLE,
    fontWeight: "800",
  },
  pillTextActive: {
    color: TEXT,
  },
  hint: {
    color: SUBTLE,
    marginTop: 8,
    fontSize: 12,
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
  entryCard: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  entryTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  entryTitle: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "900",
  },
  entrySub: {
    color: SUBTLE,
    marginTop: 3,
    fontWeight: "700",
  },
  hoursBadge: {
    backgroundColor: "rgba(34,211,238,0.12)",
    borderColor: "rgba(34,211,238,0.38)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  hoursText: {
    color: ACCENT_2,
    fontWeight: "900",
  },
  entryDescription: {
    color: SUBTLE,
    marginTop: 10,
    lineHeight: 19,
  },
  emptyState: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
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
});
