import { fetchWorkspaceMembers, type WorkspaceMember } from "@/src/api/auth";
import {
  listTimeEntries,
  type TimeEntry,
  type TimeEntryFilters,
  type WorkItem,
  type WorkProject,
} from "@/src/api/timeTracking";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
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

function formatDate(value?: string | null) {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

function formatHours(value: any) {
  const n = Number(value || 0);
  return n.toLocaleString("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatTimeValue(value: any) {
  const totalMinutes = Math.round(Number(value || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
function memberLabel(member?: WorkspaceMember | null) {
  if (!member) return "Todos los usuarios";
  const name = member.name?.trim();
  const email = member.email?.trim();
  if (name && email) return name + "   " + email;
  return name || email || "Usuario";
}

function reportUserLabel(entry: TimeEntry) {
  const anyEntry = entry as any;
  return anyEntry.user_name || anyEntry.user_email || entry.user_id || "Usuario";
}

function entrySearchText(entry: TimeEntry) {
  return [
    reportUserLabel(entry),
    entry.user_id,
    entry.work_date,
    formatDate(entry.work_date),
    entry.project_name,
    entry.item_name,
    entry.hours,
    entry.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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
        <Text style={styles.dropdownButtonText}>
          {selected?.label || placeholder}
        </Text>
        <Text style={styles.dropdownIcon}>{open ? "?" : "?"}</Text>
      </Pressable>

      {open && (
        <View style={styles.dropdownMenu}>
          <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
            <Pressable
              style={[styles.dropdownOption, !value && styles.dropdownOptionActive]}
              onPress={() => onSelect("")}
            >
              <Text
                style={[
                  styles.dropdownOptionText,
                  !value && styles.dropdownOptionTextActive,
                ]}
              >
                {placeholder}
              </Text>
            </Pressable>

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
                >
                  {option.label}
                </Text>
                {!!option.sublabel && (
                  <Text style={styles.dropdownRole}>{option.sublabel}</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export default function AdminReportsPanel({
  projects,
  items,
}: {
  projects: WorkProject[];
  items: WorkItem[];
}) {
  const [draftUserId, setDraftUserId] = useState("");
  const [draftProjectId, setDraftProjectId] = useState("");
  const [draftItemId, setDraftItemId] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [search, setSearch] = useState("");
  const [openDropdown, setOpenDropdown] = useState<"user" | "project" | "item" | null>(null);
  const [filters, setFilters] = useState<TimeEntryFilters>({});

  const qMembers = useQuery({
    queryKey: ["workspace-members"],
    queryFn: fetchWorkspaceMembers,
  });

  const qReports = useQuery({
    queryKey: ["time-entries", "reports", filters],
    queryFn: () => listTimeEntries(filters),
  });

  const rawRows = qReports.data?.rows ?? [];
  const total = qReports.data?.total ?? 0;
  const totalHours = qReports.data?.total_hours ?? 0;
  const members = qMembers.data ?? [];

  const userOptions = useMemo<DropdownOption[]>(
    () =>
      members.map((m) => ({
        id: m.id,
        label: memberLabel(m),
        sublabel: m.role,
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

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rawRows;
    return rawRows.filter((entry) => entrySearchText(entry).includes(q));
  }, [rawRows, search]);

  const visibleHours = useMemo(() => {
    return visibleRows.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
  }, [visibleRows]);

  function toggleDropdown(name: "user" | "project" | "item") {
    setOpenDropdown((current) => (current === name ? null : name));
  }

  function applyFilters() {
    setFilters({
      userId: draftUserId || undefined,
      projectId: draftProjectId || undefined,
      itemId: draftItemId || undefined,
      from: draftFrom.trim() || undefined,
      to: draftTo.trim() || undefined,
    });
    setOpenDropdown(null);
  }

  function clearFilters() {
    setDraftUserId("");
    setDraftProjectId("");
    setDraftItemId("");
    setDraftFrom("");
    setDraftTo("");
    setSearch("");
    setFilters({});
    setOpenDropdown(null);
  }

  return (
    <View>
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Reportes de horas</Text>
        <Text style={styles.help}>
          Consulta las horas por usuario, proyecto, Item y rango de fechas.
        </Text>

        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatHours(totalHours)}</Text>
            <Text style={styles.statLabel}>Horas totales</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statValue}>{total}</Text>
            <Text style={styles.statLabel}>Registros</Text>
          </View>
        </View>

        <Text style={styles.label}>Buscador rApido</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar usuario, proyecto, Item, fecha o comentario"
          placeholderTextColor="#6b7280"
          style={styles.input}
        />

        {!!search.trim() && (
          <Text style={styles.searchHint}>
            Mostrando {visibleRows.length} de {rawRows.length} registros {" "}
            {formatHours(visibleHours)} hrs visibles
          </Text>
        )}

        <SelectDropdown
          label="Usuario"
          value={draftUserId}
          placeholder="Todos los usuarios"
          options={userOptions}
          open={openDropdown === "user"}
          onToggle={() => toggleDropdown("user")}
          onSelect={(id) => {
            setDraftUserId(id);
            setOpenDropdown(null);
          }}
        />

        <SelectDropdown
          label="Proyecto"
          value={draftProjectId}
          placeholder="Todos los proyectos"
          options={projectOptions}
          open={openDropdown === "project"}
          onToggle={() => toggleDropdown("project")}
          onSelect={(id) => {
            setDraftProjectId(id);
            setOpenDropdown(null);
          }}
        />

        <SelectDropdown
          label="Item"
          value={draftItemId}
          placeholder="Todos los Items"
          options={itemOptions}
          open={openDropdown === "item"}
          onToggle={() => toggleDropdown("item")}
          onSelect={(id) => {
            setDraftItemId(id);
            setOpenDropdown(null);
          }}
        />

        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <Text style={styles.label}>Desde</Text>
            <TextInput
              value={draftFrom}
              onChangeText={setDraftFrom}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#6b7280"
              style={styles.input}
            />
          </View>

          <View style={styles.dateField}>
            <Text style={styles.label}>Hasta</Text>
            <TextInput
              value={draftTo}
              onChangeText={setDraftTo}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#6b7280"
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.primaryButton} onPress={applyFilters}>
            <Text style={styles.primaryButtonText}>Aplicar filtros</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={clearFilters}>
            <Text style={styles.secondaryText}>Limpiar</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Horas registradas</Text>
        {qReports.isFetching ? (
          <ActivityIndicator color={ACCENT} />
        ) : (
          <Text style={styles.counter}>{visibleRows.length} visibles</Text>
        )}
      </View>

      {visibleRows.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Sin horas registradas</Text>
          <Text style={styles.emptyText}>
            No hay resultados para los filtros seleccionados.
          </Text>
        </View>
      ) : (
        <View style={styles.resultsBox}>
          <ScrollView style={styles.resultsScroll} nestedScrollEnabled>
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

{visibleRows.map((entry) => (
  <View key={entry.id} style={styles.timeRow}>
    <View style={styles.cellDate}>
      <Text style={styles.cellText} numberOfLines={1}>
        {formatDate(entry.work_date)}
      </Text>
    </View>

    <View style={styles.cellName}>
      <Text style={styles.cellText} numberOfLines={1}>
        {reportUserLabel(entry)}
      </Text>
    </View>

    <View style={styles.cellProject}>
      <Text style={styles.cellText} numberOfLines={1}>
        {entry.project_name}
      </Text>

      {!!entry.description && (
        <Text style={styles.cellMuted} numberOfLines={1}>
          {entry.description}
        </Text>
      )}
    </View>

    <View style={styles.cellItem}>
      <Text style={styles.itemBadgeText} numberOfLines={1}>
        {entry.item_name}
      </Text>
    </View>

    <View style={styles.cellTime}>
      <Text style={styles.timeValue}>
        {formatTimeValue(entry.hours)}
      </Text>
    </View>
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
  sectionTitle: { color: TEXT, fontSize: 18, fontWeight: "900" },
  help: {
    color: SUBTLE,
    marginTop: 6,
    lineHeight: 20,
  },
  statGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: FIELD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  statValue: {
    color: TEXT,
    fontSize: 26,
    fontWeight: "900",
  },
  statLabel: {
    color: SUBTLE,
    fontWeight: "800",
    marginTop: 2,
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
  searchHint: {
    color: ACCENT_2,
    fontWeight: "800",
    marginTop: 8,
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
    backgroundColor: "rgba(124,58,237,0.18)",
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
  dateRow: {
    flexDirection: "row",
    gap: 10,
  },
  dateField: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  primaryButtonText: { color: "#fff", fontWeight: "900" },
  secondaryButton: {
    marginTop: 16,
    backgroundColor: FIELD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  secondaryText: { color: TEXT, fontWeight: "900" },
  listHeader: {
    marginTop: 6,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counter: { color: SUBTLE, fontWeight: "800" },
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
  reportRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomColor: BORDER,
    borderBottomWidth: 1,
    gap: 4,
  },
  compactTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  compactUser: {
    color: TEXT,
    fontWeight: "900",
    fontSize: 14,
    flex: 1,
  },
  compactHours: {
    color: ACCENT_2,
    fontWeight: "900",
    fontSize: 14,
  },
  compactMeta: {
    color: SUBTLE,
    fontWeight: "800",
    fontSize: 12,
  },
  compactDesc: {
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
  borderBottomColor: BORDER,
  borderBottomWidth: 1,
  paddingHorizontal: 10,
  paddingVertical: 9,
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
  borderBottomColor: BORDER,
  borderBottomWidth: 1,
  paddingHorizontal: 10,
  paddingVertical: 9,
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
});
