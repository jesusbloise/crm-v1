import { fetchWorkspaceMembers, type WorkspaceMember } from "@/src/api/auth";
import type { WorkItem, WorkProject } from "@/src/api/timeTracking";
import {
    createWorkAssignment,
    listWorkAssignments,
    type WorkAssignment,
} from "@/src/api/workAssignments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

function formatTimeRange(item: WorkAssignment) {
  if (item.start_time && item.end_time) {
    return `${item.start_time} - ${item.end_time}`;
  }

  if (item.start_time) return item.start_time;

  return "Sin hora";
}

function formatHours(value: any) {
  const totalMinutes = Math.round(Number(value || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function memberLabel(member?: WorkspaceMember | null) {
  if (!member) return "Selecciona un usuario";

  const name = member.name?.trim();
  const email = member.email?.trim();

  if (name && email) return name + "   " + email;
  return name || email || "Usuario";
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

export default function AdminAssignmentsPanel({
  projects,
  items,
}: {
  projects: WorkProject[];
  items: WorkItem[];
}) {
  const qc = useQueryClient();

  const [assignedUserId, setAssignedUserId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [itemId, setItemId] = useState("");
  const [assignmentDate, setAssignmentDate] = useState(todayLocal());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [estimatedHours, setEstimatedHours] = useState("4");
  const [description, setDescription] = useState("");
  const [openDropdown, setOpenDropdown] = useState<
    "user" | "project" | "item" | null
  >(null);

  const qMembers = useQuery({
    queryKey: ["workspace-members"],
    queryFn: fetchWorkspaceMembers,
  });

  const qAssignments = useQuery({
    queryKey: ["work-assignments"],
    queryFn: () => listWorkAssignments({ status: "assigned" }),
  });

  const members = qMembers.data ?? [];
  const assignments = qAssignments.data?.rows ?? [];

  const userOptions = useMemo<DropdownOption[]>(
    () =>
      members.map((m) => ({
        id: m.id,
        label: memberLabel(m),
        sublabel: m.email || null,
      })),
    [members]
  );

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

  const createMut = useMutation({
    mutationFn: createWorkAssignment,
    onSuccess: async () => {
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["work-assignments"] });
      Alert.alert("Listo", "Horas asignadas correctamente.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "No se pudo crear la asignacion.");
    },
  });

  function toggleDropdown(name: "user" | "project" | "item") {
    setOpenDropdown((current) => (current === name ? null : name));
  }

  function submit() {
    if (!assignedUserId) {
      Alert.alert("Falta usuario", "Selecciona un usuario.");
      return;
    }

    if (!projectId) {
      Alert.alert("Falta proyecto", "Selecciona un proyecto.");
      return;
    }

    if (!itemId) {
      Alert.alert("Falta item", "Selecciona un item.");
      return;
    }

    if (!assignmentDate.trim()) {
      Alert.alert("Falta fecha", "Ingresa una fecha.");
      return;
    }

    if (!estimatedHours.trim()) {
      Alert.alert("Faltan horas", "Ingresa las horas estimadas.");
      return;
    }

    createMut.mutate({
      assigned_user_id: assignedUserId,
      project_id: projectId,
      item_id: itemId,
      assignment_date: assignmentDate.trim(),
      start_time: startTime.trim() || null,
      end_time: endTime.trim() || null,
      estimated_hours: estimatedHours.trim(),
      description: description.trim() || null,
    });
  }

  return (
    <View>
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Asignar horas</Text>
        <Text style={styles.help}>
          Planifica horas futuras para usuarios del workspace por proyecto,
          item y dia de trabajo.
        </Text>

        <SelectDropdown
          label="Usuario"
          value={assignedUserId}
          placeholder="Selecciona un usuario"
          options={userOptions}
          open={openDropdown === "user"}
          onToggle={() => toggleDropdown("user")}
          onSelect={(id) => {
            setAssignedUserId(id);
            setOpenDropdown(null);
          }}
        />

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

        <Text style={styles.label}>Fecha</Text>
        <TextInput
          value={assignmentDate}
          onChangeText={setAssignmentDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#6b7280"
          style={styles.input}
        />

        <View style={styles.row}>
          <View style={styles.rowField}>
            <Text style={styles.label}>Inicio</Text>
            <TextInput
              value={startTime}
              onChangeText={setStartTime}
              placeholder="09:00"
              placeholderTextColor="#6b7280"
              style={styles.input}
            />
          </View>

          <View style={styles.rowField}>
            <Text style={styles.label}>Fin</Text>
            <TextInput
              value={endTime}
              onChangeText={setEndTime}
              placeholder="13:00"
              placeholderTextColor="#6b7280"
              style={styles.input}
            />
          </View>

          <View style={styles.rowField}>
            <Text style={styles.label}>Horas</Text>
            <TextInput
              value={estimatedHours}
              onChangeText={setEstimatedHours}
              placeholder="4"
              placeholderTextColor="#6b7280"
              style={styles.input}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <Text style={styles.label}>Descripcion</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Detalle del trabajo a realizar"
          placeholderTextColor="#6b7280"
          style={[styles.input, styles.textArea]}
          multiline
        />

        <Pressable
          style={[styles.primaryButton, createMut.isPending && styles.disabled]}
          disabled={createMut.isPending}
          onPress={submit}
        >
          <Text style={styles.primaryButtonText}>
            {createMut.isPending ? "Asignando..." : "Asignar horas"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Asignaciones pendientes</Text>
        {qAssignments.isFetching ? (
          <ActivityIndicator color={ACCENT} />
        ) : (
          <Text style={styles.counter}>{assignments.length} registros</Text>
        )}
      </View>

      {assignments.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Sin asignaciones</Text>
          <Text style={styles.emptyText}>
            Cuando asignes horas, apareceran aqui.
          </Text>
        </View>
      ) : (
        <View style={styles.resultsBox}>
          <ScrollView style={styles.resultsScroll} nestedScrollEnabled>
            {assignments.map((item) => (
              <View key={item.id} style={styles.assignmentRow}>
                <View style={styles.assignmentTop}>
                  <Text style={styles.assignmentUser} numberOfLines={1}>
                    {item.assigned_user_name ||
                      item.assigned_user_email ||
                      item.assigned_user_id}
                  </Text>

                  <Text style={styles.assignmentHours}>
                    {formatHours(item.estimated_hours)}
                  </Text>
                </View>

                <Text style={styles.assignmentMeta} numberOfLines={1}>
                  {formatDate(item.assignment_date)}   {formatTimeRange(item)}
                </Text>

                <Text style={styles.assignmentMeta} numberOfLines={1}>
                  {item.project_name}   {item.item_name}
                </Text>

                {!!item.description && (
                  <Text style={styles.assignmentDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  formCard: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginBottom: 18,
  },
  sectionTitle: {
    color: TEXT,
    fontSize: 18,
    fontWeight: "900",
  },
  help: {
    color: SUBTLE,
    marginTop: 6,
    lineHeight: 20,
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
    minHeight: 90,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  rowField: {
    flex: 1,
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
  primaryButton: {
    marginTop: 16,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.55,
  },
  listHeader: {
    marginTop: 6,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counter: {
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
    textAlign: "center",
  },
  resultsBox: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
  },
  resultsScroll: {
    maxHeight: 620,
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
  assignmentUser: {
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
});