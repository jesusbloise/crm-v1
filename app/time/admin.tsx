import { getRoleNow } from "@/src/api/auth";
import {
  createWorkItem,
  createWorkProject,
  listWorkItems,
  listWorkProjects,
  updateWorkItem,
  updateWorkProject,
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
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import AdminReportsPanel from "./adminReports";

const BG = "#0b0c10";
const CARD = "#14151a";
const BORDER = "#272a33";
const FIELD = "#121318";
const TEXT = "#e8ecf1";
const SUBTLE = "#a9b0bd";
const ACCENT = "#7c3aed";
const ACCENT_2 = "#22d3ee";
const DANGER = "#ef4444";

type Tab = "projects" | "items" | "reports";

function isActive(v: any) {
  return v === 1 || v === true || v === "1" || v === "true";
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <View style={[styles.badge, active ? styles.badgeOn : styles.badgeOff]}>
      <Text style={[styles.badgeText, active ? styles.badgeTextOn : styles.badgeTextOff]}>
        {active ? "Activo" : "Inactivo"}
      </Text>
    </View>
  );
}

function AdminProjectCard({ item }: { item: WorkProject }) {
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || "");
  const [clientName, setClientName] = useState(item.client_name || "");

  useEffect(() => {
    setName(item.name);
    setDescription(item.description || "");
    setClientName(item.client_name || "");
  }, [item.id, item.name, item.description, item.client_name]);

  const mut = useMutation({
    mutationFn: () =>
      updateWorkProject(item.id, {
        name: name.trim(),
        description: description.trim() || null,
        client_name: clientName.trim() || null,
        is_active: item.is_active,
      }),
    onSuccess: async () => {
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ["work-projects"] });
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "No se pudo actualizar el proyecto.");
    },
  });

  const toggleMut = useMutation({
    mutationFn: () =>
      updateWorkProject(item.id, {
        name: item.name,
        description: item.description || null,
        client_name: item.client_name || null,
        is_active: isActive(item.is_active) ? 0 : 1,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["work-projects"] });
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "No se pudo cambiar el estado.");
    },
  });

  return (
    <View style={styles.listCard}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          {!!item.client_name && <Text style={styles.cardSub}>Cliente: {item.client_name}</Text>}
          {!!item.description && <Text style={styles.cardDescription}>{item.description}</Text>}
        </View>
        <StatusBadge active={isActive(item.is_active)} />
      </View>

      {editing && (
        <View style={styles.editBox}>
          <Text style={styles.label}>Nombre</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor="#6b7280" />

          <Text style={styles.label}>Cliente</Text>
          <TextInput value={clientName} onChangeText={setClientName} style={styles.input} placeholderTextColor="#6b7280" />

          <Text style={styles.label}>Descripción</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={[styles.input, styles.textArea]}
            multiline
            placeholderTextColor="#6b7280"
          />
        </View>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.secondaryButton} onPress={() => setEditing((v) => !v)}>
          <Text style={styles.secondaryText}>{editing ? "Cancelar" : "Editar"}</Text>
        </Pressable>

        {editing && (
          <Pressable
            style={[styles.primarySmallButton, mut.isPending && styles.disabled]}
            disabled={mut.isPending}
            onPress={() => {
              if (!name.trim()) {
                Alert.alert("Falta nombre", "El proyecto necesita un nombre.");
                return;
              }
              mut.mutate();
            }}
          >
            <Text style={styles.primarySmallText}>{mut.isPending ? "Guardando..." : "Guardar"}</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.dangerButton, toggleMut.isPending && styles.disabled]}
          disabled={toggleMut.isPending}
          onPress={() => toggleMut.mutate()}
        >
          <Text style={styles.dangerText}>{isActive(item.is_active) ? "Desactivar" : "Activar"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AdminItemCard({ item }: { item: WorkItem }) {
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || "");

  useEffect(() => {
    setName(item.name);
    setDescription(item.description || "");
  }, [item.id, item.name, item.description]);

  const mut = useMutation({
    mutationFn: () =>
      updateWorkItem(item.id, {
        name: name.trim(),
        description: description.trim() || null,
        is_active: item.is_active,
      }),
    onSuccess: async () => {
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ["work-items"] });
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "No se pudo actualizar el Item.");
    },
  });

  const toggleMut = useMutation({
    mutationFn: () =>
      updateWorkItem(item.id, {
        name: item.name,
        description: item.description || null,
        is_active: isActive(item.is_active) ? 0 : 1,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["work-items"] });
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "No se pudo cambiar el estado.");
    },
  });

  return (
    <View style={styles.listCard}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          {!!item.description && <Text style={styles.cardDescription}>{item.description}</Text>}
        </View>
        <StatusBadge active={isActive(item.is_active)} />
      </View>

      {editing && (
        <View style={styles.editBox}>
          <Text style={styles.label}>Nombre</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor="#6b7280" />

          <Text style={styles.label}>DescripciÓn</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={[styles.input, styles.textArea]}
            multiline
            placeholderTextColor="#6b7280"
          />
        </View>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.secondaryButton} onPress={() => setEditing((v) => !v)}>
          <Text style={styles.secondaryText}>{editing ? "Cancelar" : "Editar"}</Text>
        </Pressable>

        {editing && (
          <Pressable
            style={[styles.primarySmallButton, mut.isPending && styles.disabled]}
            disabled={mut.isPending}
            onPress={() => {
              if (!name.trim()) {
                Alert.alert("Falta nombre", "El item necesita un nombre.");
                return;
              }
              mut.mutate();
            }}
          >
            <Text style={styles.primarySmallText}>{mut.isPending ? "Guardando..." : "Guardar"}</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.dangerButton, toggleMut.isPending && styles.disabled]}
          disabled={toggleMut.isPending}
          onPress={() => toggleMut.mutate()}
        >
          <Text style={styles.dangerText}>{isActive(item.is_active) ? "Desactivar" : "Activar"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function TimeAdminScreen() {
  const qc = useQueryClient();

  const [role, setRole] = useState<string | null>(null);
  const [roleReady, setRoleReady] = useState(false);
  const [tab, setTab] = useState<Tab>("projects");

  const [projectName, setProjectName] = useState("");
  const [projectClient, setProjectClient] = useState("");
  const [projectDescription, setProjectDescription] = useState("");

  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");

  useEffect(() => {
    getRoleNow()
      .then((r) => setRole(r))
      .finally(() => setRoleReady(true));
  }, []);

  const allowed = role === "owner" || role === "admin";

  const qProjects = useQuery({
    queryKey: ["work-projects", "admin"],
    queryFn: () => listWorkProjects({ includeInactive: true }),
    enabled: allowed,
  });

  const qItems = useQuery({
    queryKey: ["work-items", "admin"],
    queryFn: () => listWorkItems({ includeInactive: true }),
    enabled: allowed,
  });

  const createProjectMut = useMutation({
    mutationFn: createWorkProject,
    onSuccess: async () => {
      setProjectName("");
      setProjectClient("");
      setProjectDescription("");
      await qc.invalidateQueries({ queryKey: ["work-projects"] });
      Alert.alert("Listo", "Proyecto creado correctamente.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "No se pudo crear el proyecto.");
    },
  });

  const createItemMut = useMutation({
    mutationFn: createWorkItem,
    onSuccess: async () => {
      setItemName("");
      setItemDescription("");
      await qc.invalidateQueries({ queryKey: ["work-items"] });
      Alert.alert("Listo", "Item creado correctamente.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "No se pudo crear el Item.");
    },
  });

  const projects = qProjects.data ?? [];
  const items = qItems.data ?? [];

  const currentList = useMemo(() => {
    if (tab === "reports") return [];
    return tab === "projects" ? projects : items;
  }, [tab, projects, items]);

  if (!roleReady) {
    return (
      <View style={styles.centerScreen}>
        <Stack.Screen options={{ title: "Administrar horas" }} />
        <ActivityIndicator color={ACCENT} />
        <Text style={styles.loadingText}>Validando permisos...</Text>
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.centerScreen}>
        <Stack.Screen options={{ title: "Administrar horas" }} />
        <Text style={styles.lockTitle}>Sin permisos</Text>
        <Text style={styles.lockText}>
          Solo owner o admin pueden administrar proyectos e Items.
        </Text>
       <Pressable style={styles.primaryButton} onPress={() => router.push("/time" as any)}>
          <Text style={styles.primaryButtonText}>Volver a mis horas</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "Administrar horas" }} />

      <FlatList
        data={currentList as any[]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={qProjects.isFetching || qItems.isFetching}
            onRefresh={() => {
              qProjects.refetch();
              qItems.refetch();
            }}
            tintColor={ACCENT}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>Admin</Text>
                <Text style={styles.title}>Proyectos e items</Text>
                <Text style={styles.subtitle}>
                  Crea y administra las opciones que los usuarios seleccionan al registrar horas.
                </Text>
              </View>

              <Pressable style={styles.backButton} onPress={() => router.push("/time" as any)}>
                <Text style={styles.backText}>Mis horas</Text>
              </Pressable>
            </View>

            <View style={styles.tabs}>
              <Pressable
                onPress={() => setTab("projects")}
                style={[styles.tab, tab === "projects" && styles.tabActive]}
              >
                <Text style={[styles.tabText, tab === "projects" && styles.tabTextActive]}>
                  Proyectos ({projects.length})
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setTab("items")}
                style={[styles.tab, tab === "items" && styles.tabActive]}
              >
                <Text style={[styles.tabText, tab === "items" && styles.tabTextActive]}>
                  Items ({items.length})
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setTab("reports")}
                style={[styles.tab, tab === "reports" && styles.tabActive]}
              >
                <Text style={[styles.tabText, tab === "reports" && styles.tabTextActive]}>
                  Reportes
                </Text>
              </Pressable>
            </View>

            {tab === "reports" ? (
              <AdminReportsPanel projects={projects} items={items} />
            ) : tab === "projects" ? (
              <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Crear proyecto</Text>

                <Text style={styles.label}>Nombre</Text>
                <TextInput
                  value={projectName}
                  onChangeText={setProjectName}
                  placeholder="Ej: Campaña Banco Chile"
                  placeholderTextColor="#6b7280"
                  style={styles.input}
                />

                <Text style={styles.label}>Cliente</Text>
                <TextInput
                  value={projectClient}
                  onChangeText={setProjectClient}
                  placeholder="Ej: Banco Chile"
                  placeholderTextColor="#6b7280"
                  style={styles.input}
                />

                <Text style={styles.label}>Descripción</Text>
                <TextInput
                  value={projectDescription}
                  onChangeText={setProjectDescription}
                  placeholder="Notas internas del proyecto"
                  placeholderTextColor="#6b7280"
                  style={[styles.input, styles.textArea]}
                  multiline
                />

                <Pressable
                  style={[
                    styles.primaryButton,
                    (!projectName.trim() || createProjectMut.isPending) && styles.disabled,
                  ]}
                  disabled={!projectName.trim() || createProjectMut.isPending}
                  onPress={() =>
                    createProjectMut.mutate({
                      name: projectName.trim(),
                      client_name: projectClient.trim() || null,
                      description: projectDescription.trim() || null,
                    })
                  }
                >
                  <Text style={styles.primaryButtonText}>
                    {createProjectMut.isPending ? "Creando..." : "Crear proyecto"}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Crear Item</Text>

                <Text style={styles.label}>Nombre</Text>
                <TextInput
                  value={itemName}
                  onChangeText={setItemName}
                  placeholder="Ej: Edición, Motion, Color"
                  placeholderTextColor="#6b7280"
                  style={styles.input}
                />

                <Text style={styles.label}>Descripcion</Text>
                <TextInput
                  value={itemDescription}
                  onChangeText={setItemDescription}
                  placeholder="Describe cuándo usar este item"
                  placeholderTextColor="#6b7280"
                  style={[styles.input, styles.textArea]}
                  multiline
                />

                <Pressable
                  style={[
                    styles.primaryButton,
                    (!itemName.trim() || createItemMut.isPending) && styles.disabled,
                  ]}
                  disabled={!itemName.trim() || createItemMut.isPending}
                  onPress={() =>
                    createItemMut.mutate({
                      name: itemName.trim(),
                      description: itemDescription.trim() || null,
                    })
                  }
                >
                  <Text style={styles.primaryButtonText}>
                    {createItemMut.isPending ? "Creando..." : "Crear Item"}
                  </Text>
                </Pressable>
              </View>
            )}

            {tab !== "reports" && (
              <View style={styles.listHeader}>
                <Text style={styles.sectionTitle}>
                  {tab === "projects" ? "Proyectos" : "Items"}
                </Text>
                <Text style={styles.counter}>{currentList.length} registros</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) =>
          tab === "reports" ? null : tab === "projects" ? (
            <AdminProjectCard item={item as WorkProject} />
          ) : (
            <AdminItemCard item={item as WorkItem} />
          )
        }
        ListEmptyComponent={
          tab === "reports" ? null : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Sin registros todavia</Text>
              <Text style={styles.emptyText}>
                Crea el primer {tab === "projects" ? "proyecto" : "item"} desde el formulario superior.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  centerScreen: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  content: { padding: 16, paddingBottom: 110 },
  header: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
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
  title: { color: TEXT, fontSize: 28, fontWeight: "900" },
  subtitle: { color: SUBTLE, marginTop: 4, maxWidth: 620 },
  tabs: {
    flexDirection: "row",
    backgroundColor: FIELD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 16,
    padding: 4,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "rgba(124,58,237,0.18)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.42)",
  },
  tabText: { color: SUBTLE, fontWeight: "900" },
  tabTextActive: { color: TEXT },
  formCard: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginBottom: 18,
  },
  sectionTitle: { color: TEXT, fontSize: 18, fontWeight: "900" },
  label: {
    color: SUBTLE,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 14,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
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
  textArea: { minHeight: 78, textAlignVertical: "top" },
  primaryButton: {
    marginTop: 16,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  primaryButtonText: { color: "#fff", fontWeight: "900" },
  primarySmallButton: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  primarySmallText: { color: "#fff", fontWeight: "900" },
  secondaryButton: {
    backgroundColor: FIELD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  secondaryText: { color: TEXT, fontWeight: "900" },
  dangerButton: {
    backgroundColor: "rgba(239,68,68,0.11)",
    borderColor: "rgba(239,68,68,0.35)",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dangerText: { color: DANGER, fontWeight: "900" },
  backButton: {
    backgroundColor: FIELD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  backText: { color: TEXT, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  listHeader: {
    marginTop: 6,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counter: { color: SUBTLE, fontWeight: "800" },
  listCard: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  cardTitle: { color: TEXT, fontWeight: "900", fontSize: 16 },
  cardSub: { color: ACCENT_2, fontWeight: "800", marginTop: 3 },
  cardDescription: { color: SUBTLE, marginTop: 6, lineHeight: 19 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeOn: {
    backgroundColor: "rgba(34,211,238,0.10)",
    borderColor: "rgba(34,211,238,0.35)",
  },
  badgeOff: {
    backgroundColor: "rgba(239,68,68,0.10)",
    borderColor: "rgba(239,68,68,0.35)",
  },
  badgeText: { fontSize: 12, fontWeight: "900" },
  badgeTextOn: { color: ACCENT_2 },
  badgeTextOff: { color: DANGER },
  editBox: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 2,
  },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 12 },
  emptyState: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
  },
  emptyTitle: { color: TEXT, fontWeight: "900", fontSize: 16, marginBottom: 4 },
  emptyText: { color: SUBTLE, lineHeight: 20, textAlign: "center" },
  loadingText: { color: SUBTLE, fontWeight: "700" },
  lockTitle: { color: TEXT, fontSize: 22, fontWeight: "900" },
  lockText: { color: SUBTLE, textAlign: "center", lineHeight: 20 },
});
