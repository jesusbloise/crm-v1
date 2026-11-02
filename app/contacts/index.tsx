// app/contacts/index.tsx
import { getAuthStorageScope } from "@/src/api/auth";
import {
  importContacts,
  listContacts,
  type Contact,
  type ImportContactRow,
} from "@/src/api/contacts";
import { api } from "@/src/api/http";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Link, Stack, router, useFocusEffect } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

const C = {
  bg: "#f5f6fa",
  surface: "#ffffff",
  text: "#202536",
  muted: "#737b8e",
  border: "#e7e9f0",
  purple: "#7551c8",
  purpleSoft: "#f0ebfb",
  green: "#24856a",
  greenSoft: "#eaf7f1",
  orange: "#b67720",
  orangeSoft: "#fff5e4",
  red: "#b33e50",
};

const PAGE_SIZE = 50;
const EXPORT_WS_TS_KEY = "contacts:export_ws_ts:v1";

type ContactRow = Contact & {
  workspace_names?: string;
  workspaces?: Array<string | { name?: string }>;
};

type ContactView = "clientes" | "proveedores" | "todos";
type SortField = "name" | "company" | "position" | "updated_at";
type FilterMenu = "position" | "visibility" | null;
type IconName = ComponentProps<typeof Ionicons>["name"];

type ImportInfo = {
  filename?: string;
  message: string;
  received?: number;
  created?: number;
  skipped?: number;
  errors?: number;
};

const strip = (value?: string | null) => (value ?? "").trim();

function normalize(value?: string | null) {
  return strip(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function clientTypeLabel(value?: string | null) {
  switch (value) {
    case "productora":
      return "Productora";
    case "agencia":
      return "Agencia";
    case "directo":
      return "Cliente directo";
    case "proveedor":
      return "Proveedor";
    default:
      return "Sin clasificar";
  }
}

function visibilityLabel(value?: string | null) {
  if (value === "private") return "Solo yo";
  if (value === "selected") return "Seleccionados";
  return "Workspace";
}

function positionKey(contact: ContactRow) {
  return strip(contact.position) || "Sin cargo";
}

function matchesContact(term: string, contact: ContactRow) {
  if (!term.trim()) return true;

  const workspaces = Array.isArray(contact.workspaces)
    ? contact.workspaces
        .map((item) =>
          typeof item === "string" ? item : item.name || ""
        )
        .join(" ")
    : contact.workspace_names || "";

  const haystack = normalize(
    [
      contact.name,
      contact.email,
      contact.phone,
      contact.company,
      contact.position,
      clientTypeLabel(contact.client_type),
      contact.created_by_name,
      contact.created_by_email,
      workspaces,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return normalize(term)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] || "")
    .join("")
    .toUpperCase();
}

function formatDate(value: unknown) {
  if (value == null || value === "") return "—";

  const number = Number(value);
  const date = Number.isFinite(number)
    ? new Date(number)
    : new Date(String(value));

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

async function assertScope(expected: string) {
  const current = await getAuthStorageScope();

  if (!current || current.storageKey !== expected) {
    throw new Error(
      "La sesión o el workspace cambió. Vuelve a abrir Contactos."
    );
  }
}

/* CSV */

function toClientType(value?: string | null): ImportContactRow["client_type"] {
  const text = normalize(value);

  if (text.includes("proveedor")) return "proveedor";
  if (text.includes("productora")) return "productora";
  if (text.includes("agencia")) return "agencia";
  if (text.includes("directo") || text.includes("cliente")) {
    return "directo";
  }

  return null;
}

function parseCSV(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let quoted = false;

  const source = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  for (let index = 0; index < source.length; index++) {
    const character = source[index];

    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        current += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(current.trim());
      current = "";
    } else if (!quoted && character === "\n") {
      row.push(current.trim());
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += character;
    }
  }

  if (quoted) {
    throw new Error("El CSV contiene comillas sin cerrar.");
  }

  row.push(current.trim());
  rows.push(row);

  return rows.filter((cells) => cells.some((cell) => cell.length));
}

function normalizeHeader(value: string) {
  return normalize(value)
    .replace(/\./g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findCol(headers: string[], candidates: string[]) {
  const normalized = headers.map(normalizeHeader);

  for (const candidate of candidates) {
    const index = normalized.indexOf(normalizeHeader(candidate));
    if (index >= 0) return index;
  }

  for (const candidate of candidates) {
    const index = normalized.findIndex((header) =>
      header.includes(normalizeHeader(candidate))
    );
    if (index >= 0) return index;
  }

  return -1;
}

function csvToImportRows(text: string): ImportContactRow[] {
  const source = text.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/)[0] || "";
  const delimiter =
    (firstLine.match(/;/g) || []).length >
    (firstLine.match(/,/g) || []).length
      ? ";"
      : ",";

  const grid = parseCSV(source, delimiter);
  if (!grid.length) return [];

  const headers = grid[0];
  const columns = {
    name: findCol(headers, [
      "name", "nombre", "contacto", "razon social", "razón social",
    ]),
    email: findCol(headers, ["email", "correo", "mail", "e-mail"]),
    phone: findCol(headers, [
      "phone", "telefono", "teléfono", "celular", "movil", "móvil", "whatsapp",
    ]),
    company: findCol(headers, [
      "company", "empresa", "compania", "compañia", "organizacion", "organización",
    ]),
    position: findCol(headers, ["position", "cargo", "rol", "puesto"]),
    client_type: findCol(headers, [
      "client_type", "tipo", "tipo cliente", "tipo_de_cliente", "cliente",
    ]),
    account_id: findCol(headers, [
      "account_id", "cuenta", "account", "account id",
    ]),
  };

  if (columns.name < 0) {
    throw new Error(
      "El CSV necesita una columna de nombre: name, nombre o contacto."
    );
  }

  return grid.slice(1).flatMap((cells) => {
    const read = (index: number) =>
      index >= 0 ? strip(cells[index]) : "";

    const name = read(columns.name);
    if (!name) return [];

    return [{
      name,
      email: read(columns.email) || undefined,
      phone: read(columns.phone).replace(/\s+/g, " ") || undefined,
      company: read(columns.company) || undefined,
      position: read(columns.position) || undefined,
      client_type: toClientType(read(columns.client_type)),
      account_id: read(columns.account_id) || undefined,
    }];
  });
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
function ActionButton({
  label,
  icon,
  onPress,
  disabled = false,
  primary = false,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primaryButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={17}
        color={primary ? "#fff" : C.muted}
      />
      <Text
        style={[
          styles.buttonText,
          primary && styles.primaryText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}


function VisibilityBadge({ value }: { value?: string | null }) {
  const restricted = value === "private";
  const selected = value === "selected";

  return (
    <View
      style={[
        styles.badge,
        restricted
          ? styles.privateBadge
          : selected
            ? styles.selectedBadge
            : styles.workspaceBadge,
      ]}
    >
      <Ionicons
        name={
          restricted
            ? "lock-closed-outline"
            : selected
              ? "people-outline"
              : "globe-outline"
        }
        size={12}
        color={
          restricted ? C.orange : selected ? C.purple : C.green
        }
      />
      <Text
        style={[
          styles.badgeText,
          {
            color: restricted
              ? C.orange
              : selected
                ? C.purple
                : C.green,
          },
        ]}
      >
        {visibilityLabel(value)}
      </Text>
    </View>
  );
}

export default function ContactsList() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 1000;

  const [scopeKey, setScopeKey] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [contactView, setContactView] = useState<ContactView>("clientes");
  const [position, setPosition] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortAscending, setSortAscending] = useState(true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<FilterMenu>(null);
  const [menuSearch, setMenuSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<ImportInfo | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void getAuthStorageScope()
        .then((scope) => {
          if (!active) return;

          setScopeKey(scope?.storageKey || null);
          setSessionError(
            scope ? null : "Inicia sesión para consultar tus contactos."
          );
        })
        .catch(() => {
          if (!active) return;
          setScopeKey(null);
          setSessionError("No se pudo comprobar la sesión.");
        });

      return () => {
        active = false;
      };
    }, [])
  );

  const roleQuery = useQuery({
    queryKey: ["tenants-role", scopeKey],
    enabled: Boolean(scopeKey),
    queryFn: async () => {
      await assertScope(scopeKey!);
      const result = await api.get<{ role?: string }>("/tenants/role");
      await assertScope(scopeKey!);
      return result;
    },
  });

  const isAdmin =
    roleQuery.data?.role === "admin" ||
    roleQuery.data?.role === "owner";

  const contactsQuery = useQuery({
    queryKey: ["contacts", scopeKey],
    enabled: Boolean(scopeKey),
    queryFn: async () => {
      await assertScope(scopeKey!);
      const result = await listContacts();
      await assertScope(scopeKey!);
      return Array.isArray(result) ? result : [];
    },
  });

  const data = (contactsQuery.data || []) as ContactRow[];

  useEffect(() => {
    setSelected(new Set());
    setSearch("");
    setPosition(null);
    setVisibility(null);
    setPage(1);
    setNotice(null);
    setImportInfo(null);
  }, [scopeKey]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [search, contactView, position, visibility, sortField, sortAscending]);

  useEffect(() => {
    if (!contactsQuery.data) return;

    const allowedIds = new Set(contactsQuery.data.map((item) => item.id));

    setSelected((previous) => {
      const next = new Set(
        [...previous].filter((id) => allowedIds.has(id))
      );

      return next.size === previous.size ? previous : next;
    });
  }, [contactsQuery.data]);

  const counts = useMemo(() => {
    const suppliers = data.filter(
      (item) => item.client_type === "proveedor"
    ).length;

    return {
      todos: data.length,
      clientes: data.length - suppliers,
      proveedores: suppliers,
      restricted: data.filter(
        (item) =>
          item.visibility === "private" ||
          item.visibility === "selected"
      ).length,
    };
  }, [data]);

  const positionOptions = useMemo(() => {
    const values = new Map<string, number>();

    for (const item of data) {
      const label = positionKey(item);
      values.set(label, (values.get(label) || 0) + 1);
    }

    return [...values.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([label, count]) => ({
        value: label,
        label,
        count,
      }));
  }, [data]);

  const filtered = useMemo(() => {
    const result = data.filter((item) => {
      if (
        contactView === "clientes" &&
        item.client_type === "proveedor"
      ) return false;

      if (
        contactView === "proveedores" &&
        item.client_type !== "proveedor"
      ) return false;

      if (position && positionKey(item) !== position) return false;
      if (visibility && (item.visibility || "workspace") !== visibility) {
        return false;
      }

      return matchesContact(search, item);
    });

    return result.sort((a, b) => {
      const comparison =
        sortField === "updated_at"
          ? Number(a.updated_at || 0) - Number(b.updated_at || 0)
          : String(a[sortField] || "").localeCompare(
              String(b[sortField] || ""),
              "es",
              { sensitivity: "base" }
            );

      return (
        (sortAscending ? comparison : -comparison) ||
        a.id.localeCompare(b.id)
      );
    });
  }, [data, contactView, position, visibility, search, sortField, sortAscending]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(offset, offset + PAGE_SIZE);

  const selectedContacts = filtered.filter((item) =>
    selected.has(item.id)
  );

  const allPageSelected =
    pageItems.length > 0 &&
    pageItems.every((item) => selected.has(item.id));

  const refresh = () => {
    void contactsQuery.refetch();
    void roleQuery.refetch();
  };

  const importMutation = useMutation({
    mutationFn: async ({
      rows,
      scope,
    }: {
      rows: ImportContactRow[];
      scope: string;
      filename: string;
    }) => {
      await assertScope(scope);
      const result = await importContacts(rows);
      await assertScope(scope);
      return result;
    },
    onSuccess: (result, variables) => {
      setImportInfo({
        filename: variables.filename,
        message: "Importación terminada.",
        received: result.received,
        created: result.created,
        skipped: result.skipped,
        errors: result.errors,
      });
      setPage(1);
      void contactsQuery.refetch();
    },
    onError: (error) => {
      setImportInfo({
        message:
          error instanceof Error
            ? error.message
            : "No se pudo completar la importación.",
      });
    },
  });

  const pickCSV = async () => {
    if (!isAdmin || !scopeKey || importMutation.isPending) return;

    setNotice(null);
    setImportInfo(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      let text: string;

      if (Platform.OS === "web") {
        if (asset.file && typeof asset.file.text === "function") {
          text = await asset.file.text();
        } else {
          const response = await fetch(asset.uri);
          if (!response.ok) throw new Error("No se pudo leer el CSV.");
          text = await response.text();
        }
      } else {
        text = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      const rows = csvToImportRows(text);

      if (!rows.length) {
        throw new Error("El archivo no contiene contactos con nombre.");
      }

      await assertScope(scopeKey);

      setImportInfo({
        filename: asset.name,
        message: `Importando ${rows.length} contactos…`,
        received: rows.length,
      });

      importMutation.mutate({
        rows,
        scope: scopeKey,
        filename: asset.name,
      });
    } catch (error) {
      setImportInfo({
        message:
          error instanceof Error
            ? error.message
            : "No se pudo leer el archivo.",
      });
    }
  };

  const exportCSV = async (items: ContactRow[]) => {
    if (!isAdmin || !scopeKey || contactsQuery.isError) return;

    try {
      await assertScope(scopeKey);

      if (!items.length) {
        setNotice("No hay contactos para exportar.");
        return;
      }

      if (Platform.OS !== "web") {
        Alert.alert(
          "Exportación",
          "Descarga el CSV desde la versión web del CRM."
        );
        return;
      }

      const headers = [
        "id", "name", "email", "phone", "company", "position",
        "client_type", "created_at", "updated_at",
        "created_by_name", "created_by_email", "visibility",
      ] as const;

      const csv = [
        headers.map(csvEscape).join(","),
        ...items.map((item) =>
          headers
            .map((field) =>
              csvEscape(
                field === "visibility"
                  ? item.visibility || "workspace"
                  : item[field]
              )
            )
            .join(",")
        ),
      ].join("\r\n");

      const blob = new Blob(["\uFEFF", csv], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download =
        `contacts-workspace-${new Date().toISOString().slice(0, 10)}.csv`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      const maxTimestamp = items.reduce(
        (max, item) =>
          Math.max(max, Number(item.updated_at || item.created_at) || 0),
        0
      );

      // La referencia de exportación se separa por sesión/workspace.
      await AsyncStorage.setItem(
        `${EXPORT_WS_TS_KEY}:${scopeKey}`,
        String(maxTimestamp || Date.now())
      );

      setNotice(`Se exportaron ${items.length} contactos visibles.`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo completar la exportación."
      );
    }
  };

  const toggleSelection = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelected((previous) => {
      const next = new Set(previous);

      for (const item of pageItems) {
        if (allPageSelected) next.delete(item.id);
        else next.add(item.id);
      }

      return next;
    });
  };

  const changeSort = (field: SortField) => {
    if (field === sortField) setSortAscending((value) => !value);
    else {
      setSortField(field);
      setSortAscending(field !== "updated_at");
    }
  };

  const openMenu = (value: FilterMenu) => {
    setMenuSearch("");
    setMenu(value);
  };

  const menuOptions = menu === "position"
    ? positionOptions
    : [
        { value: "workspace", label: "Todo el workspace" },
        { value: "private", label: "Solo yo" },
        { value: "selected", label: "Usuarios seleccionados" },
      ];

  const menuOptionsFiltered = menuOptions.filter((option) =>
    normalize(option.label).includes(normalize(menuSearch))
  );

  const currentMenuValue = menu === "position" ? position : visibility;
  const loading = !scopeKey && !sessionError || contactsQuery.isLoading;
  const errorMessage =
    sessionError ||
    (contactsQuery.isError
      ? contactsQuery.error instanceof Error
        ? contactsQuery.error.message
        : "No se pudieron cargar los contactos."
      : null);

  const checkBox = (checked: boolean, onPress: () => void, label: string) => (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={[styles.checkbox, checked && styles.checkboxActive]}
    >
      {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
    </Pressable>
  );

  const sortableHeader = (
    label: string,
    field: SortField,
    columnStyle: object
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ordenar por ${label}`}
      onPress={() => changeSort(field)}
      style={[
        styles.cell,
        columnStyle,
        styles.sortHeading,
      ]}
    >
      <Text style={styles.columnHeading}>{label}</Text>
      <Ionicons
        name={
          sortField !== field
            ? "swap-vertical-outline"
            : sortAscending
              ? "arrow-up-outline"
              : "arrow-down-outline"
        }
        size={13}
        color={sortField === field ? C.purple : C.muted}
      />
    </Pressable>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Contactos" }} />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          !desktop && styles.mobileContent,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.breadcrumb}>
          <Text style={styles.breadcrumbText}>CRM</Text>
          <Ionicons name="chevron-forward" size={12} color={C.muted} />
          <Text style={styles.breadcrumbCurrent}>Contactos</Text>
        </View>

        <View style={[styles.pageHeader, !desktop && styles.headerMobile]}>
          <View style={styles.headingBlock}>
            <View style={styles.headingLine}>
              <Text style={styles.title}>Contactos</Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{counts.todos}</Text>
              </View>
            </View>
            <Text style={styles.subtitle}>
              Personas y empresas con las que construyes relaciones.
            </Text>
          </View>

          <View style={styles.actions}>
            {isAdmin && (
              <>
                <ActionButton
                  label="Exportar CSV"
                  icon="download-outline"
                  disabled={!data.length || Boolean(errorMessage)}
                  onPress={() => void exportCSV(data)}
                />
                <ActionButton
                  label={importMutation.isPending ? "Importando…" : "Importar"}
                  icon="cloud-upload-outline"
                  disabled={importMutation.isPending}
                  onPress={() => void pickCSV()}
                />
              </>
            )}

                        <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/contacts/new")}
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="add" size={19} color="#fff" />
              <Text style={styles.primaryText}>
                Nuevo contacto
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.metrics}>
          {[
            {
              label: "Contactos visibles",
              value: counts.todos,
              icon: "people-outline" as IconName,
            },
            {
              label: "Clientes",
              value: counts.clientes,
              icon: "briefcase-outline" as IconName,
            },
            {
              label: "Proveedores",
              value: counts.proveedores,
              icon: "cube-outline" as IconName,
            },
            {
              label: "Acceso restringido",
              value: counts.restricted,
              icon: "shield-checkmark-outline" as IconName,
            },
          ].map((metric) => (
            <View
              key={metric.label}
              style={[styles.metric, !desktop && styles.metricMobile]}
            >
              <View style={styles.metricIcon}>
                <Ionicons name={metric.icon} size={20} color={C.purple} />
              </View>
              <View>
                <Text style={styles.metricValue}>
                  {loading ? "—" : metric.value}
                </Text>
                <Text style={styles.metricLabel}>{metric.label}</Text>
              </View>
            </View>
          ))}
        </View>

        {notice && (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={C.purple} />
            <Text style={styles.noticeText}>{notice}</Text>
            <Pressable
              onPress={() => setNotice(null)}
              accessibilityLabel="Cerrar mensaje"
              hitSlop={8}
            >
              <Ionicons name="close" size={18} color={C.muted} />
            </Pressable>
          </View>
        )}

        {isAdmin && importInfo && (
          <View style={styles.importNotice}>
            <Text style={styles.sectionTitle}>
              {importInfo.filename || "Importación CSV"}
            </Text>
            <Text style={styles.subtitle}>{importInfo.message}</Text>
            {importInfo.created != null && (
              <Text style={styles.subtitle}>
                {importInfo.created} creados · {importInfo.skipped || 0} omitidos
                {" · "}{importInfo.errors || 0} errores
              </Text>
            )}
          </View>
        )}

        <View style={styles.panel}>
          <View style={styles.panelTop}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabs}
            >
              {([
                ["clientes", "Clientes"],
                ["proveedores", "Proveedores"],
                ["todos", "Todos"],
              ] as const).map(([value, label]) => (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: contactView === value }}
                  onPress={() => setContactView(value)}
                  style={[
                    styles.tab,
                    contactView === value && styles.tabActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      contactView === value && styles.tabTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                  <Text style={styles.tabCount}>{counts[value]}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {isAdmin && desktop && (
              <Link href="/contacts/all" asChild>
                <Pressable style={styles.textLink}>
                  <Text style={styles.textLinkText}>Listado ampliado</Text>
                  <Ionicons name="arrow-forward" size={14} color={C.purple} />
                </Pressable>
              </Link>
            )}
          </View>

          <View style={styles.toolbar}>
            <View style={[styles.searchBox, !desktop && styles.searchMobile]}>
              <Ionicons name="search-outline" size={19} color={C.muted} />
              <TextInput
                accessibilityLabel="Buscar contactos"
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar nombre, empresa, correo…"
                placeholderTextColor={C.muted}
                style={styles.searchInput}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {!!search && (
                <Pressable
                  onPress={() => setSearch("")}
                  accessibilityLabel="Limpiar búsqueda"
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={17} color={C.muted} />
                </Pressable>
              )}
            </View>

            <ActionButton
              label={position || "Cargo"}
              icon="filter-outline"
              onPress={() => openMenu("position")}
            />
            <ActionButton
              label={visibility ? visibilityLabel(visibility) : "Visibilidad"}
              icon="eye-outline"
              onPress={() => openMenu("visibility")}
            />
            <ActionButton
              label={contactsQuery.isFetching ? "Actualizando…" : "Actualizar"}
              icon="refresh-outline"
              disabled={contactsQuery.isFetching || !scopeKey}
              onPress={refresh}
            />

            {Boolean(position || visibility || search) && (
              <Pressable
                onPress={() => {
                  setPosition(null);
                  setVisibility(null);
                  setSearch("");
                }}
                style={styles.textLink}
              >
                <Text style={styles.textLinkText}>Limpiar filtros</Text>
              </Pressable>
            )}
          </View>

          {isAdmin && selectedContacts.length > 0 && (
            <View style={styles.selectionBar}>
              <Text style={styles.selectionText}>
                {selectedContacts.length} seleccionados
              </Text>
              <Pressable
                onPress={() => void exportCSV(selectedContacts)}
                style={styles.textLink}
              >
                <Text style={styles.textLinkText}>Exportar seleccionados</Text>
              </Pressable>
              <Pressable
                onPress={() => setSelected(new Set())}
                style={styles.textLink}
              >
                <Text style={styles.textLinkText}>Cancelar selección</Text>
              </Pressable>
            </View>
          )}

          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={C.purple} />
              <Text style={styles.subtitle}>Cargando contactos…</Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={32} color={C.red} />
              <Text style={styles.sectionTitle}>No pudimos cargar el listado</Text>
              <Text style={styles.emptyDescription}>{errorMessage}</Text>
              <ActionButton
                label="Reintentar"
                icon="refresh-outline"
                onPress={refresh}
              />
            </View>
          ) : !filtered.length ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="people-outline" size={32} color={C.purple} />
              </View>
              <Text style={styles.sectionTitle}>
                {data.length ? "No encontramos coincidencias" : "Tus contactos empiezan aquí"}
              </Text>
              <Text style={styles.emptyDescription}>
                {data.length
                  ? "Prueba otra búsqueda o ajusta los filtros."
                  : "Crea tu primer contacto para organizar su información y seguimiento."}
              </Text>
            </View>
          ) : desktop ? (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={styles.table}>
                <View style={styles.tableHeading}>
                  {isAdmin && (
                    <View style={styles.checkCell}>
                      {checkBox(
                        allPageSelected,
                        togglePage,
                        "Seleccionar contactos de esta página"
                      )}
                    </View>
                  )}
                  {sortableHeader("CONTACTO", "name", styles.nameColumn)}
                  {sortableHeader("EMPRESA", "company", styles.companyColumn)}
                  {sortableHeader("CARGO", "position", styles.positionColumn)}
                  <View style={[styles.cell, styles.phoneColumn]}>
                    <Text style={styles.columnHeading}>TELÉFONO</Text>
                  </View>
                  <View style={[styles.cell, styles.visibilityColumn]}>
                    <Text style={styles.columnHeading}>VISIBILIDAD</Text>
                  </View>
                  {sortableHeader("ACTUALIZADO", "updated_at", styles.dateColumn)}
                  <View style={styles.arrowColumn} />
                </View>

                {pageItems.map((item) => (
                  <View
                    key={item.id}
                    style={[
                      styles.tableRow,
                      selected.has(item.id) && styles.selectedRow,
                    ]}
                  >
                    {isAdmin && (
                      <View style={styles.checkCell}>
                        {checkBox(
                          selected.has(item.id),
                          () => toggleSelection(item.id),
                          `Seleccionar ${item.name}`
                        )}
                      </View>
                    )}

                                       <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Abrir contacto ${item.name}`}
                      onPress={() =>
                        router.push({
                          pathname: "/contacts/[id]",
                          params: { id: item.id },
                        })
                      }
                      style={({ pressed, hovered }) => [
                        styles.rowLink,
                        (pressed || hovered) && styles.rowHover,
                      ]}
                    >
                        <View style={[styles.cell, styles.nameColumn, styles.personCell]}>
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{initials(item.name)}</Text>
                          </View>
                          <View style={styles.personText}>
                            <Text style={styles.contactName} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={styles.contactEmail} numberOfLines={1}>
                              {item.email || "Sin correo"}
                            </Text>
                          </View>
                        </View>

                        <View style={[styles.cell, styles.companyColumn]}>
                          <Text style={styles.cellText} numberOfLines={1}>
                            {item.company || "—"}
                          </Text>
                          <Text style={styles.smallText} numberOfLines={1}>
                            {clientTypeLabel(item.client_type)}
                          </Text>
                        </View>

                        <View style={[styles.cell, styles.positionColumn]}>
                          <Text style={styles.cellText} numberOfLines={2}>
                            {item.position || "—"}
                          </Text>
                        </View>

                        <View style={[styles.cell, styles.phoneColumn]}>
                          <Text style={styles.cellText} numberOfLines={1}>
                            {item.phone || "—"}
                          </Text>
                        </View>

                        <View style={[styles.cell, styles.visibilityColumn]}>
                          <VisibilityBadge value={item.visibility} />
                        </View>

                        <View style={[styles.cell, styles.dateColumn]}>
                          <Text style={styles.smallText}>
                            {formatDate(item.updated_at)}
                          </Text>
                        </View>

                        <View style={styles.arrowColumn}>
                          <Ionicons name="chevron-forward" size={16} color="#a5aabb" />
                        </View>
                                       </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.cards}>
              {pageItems.map((item) => (
                <View key={item.id} style={styles.mobileCard}>
                  <View style={styles.mobileCardTop}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials(item.name)}</Text>
                    </View>
                    <View style={styles.personText}>
                      <Link
                        href={{
                          pathname: "/contacts/[id]",
                          params: { id: item.id },
                        }}
                        asChild
                      >
                        <Pressable>
                          <Text style={styles.contactName}>{item.name}</Text>
                          <Text style={styles.smallText}>
                            {[item.company, item.position].filter(Boolean).join(" · ") ||
                              clientTypeLabel(item.client_type)}
                          </Text>
                        </Pressable>
                      </Link>
                    </View>
                    {isAdmin && checkBox(
                      selected.has(item.id),
                      () => toggleSelection(item.id),
                      `Seleccionar ${item.name}`
                    )}
                  </View>

                  {!!item.email && (
                    <Text style={styles.mobileContactLine}>{item.email}</Text>
                  )}
                  {!!item.phone && (
                    <Text style={styles.mobileContactLine}>{item.phone}</Text>
                  )}

                  <View style={styles.mobileCardBottom}>
                    <VisibilityBadge value={item.visibility} />
                    <Link
                      href={{
                        pathname: "/contacts/[id]",
                        params: { id: item.id },
                      }}
                      asChild
                    >
                      <Pressable style={styles.textLink}>
                        <Text style={styles.textLinkText}>Ver contacto</Text>
                        <Ionicons name="arrow-forward" size={14} color={C.purple} />
                      </Pressable>
                    </Link>
                  </View>
                </View>
              ))}
            </View>
          )}

          {!loading && !errorMessage && (
            <View style={styles.pagination}>
              <View>
                <Text style={styles.paginationText}>
                  {filtered.length
                    ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, filtered.length)} de ${filtered.length} contactos`
                    : "0 contactos"}
                </Text>
                <Text style={styles.smallText}>
                  Solo información a la que tienes acceso.
                </Text>
              </View>

              <View style={styles.paginationButtons}>
                <Pressable
                  accessibilityLabel="Página anterior"
                  disabled={safePage <= 1}
                  onPress={() => setPage(safePage - 1)}
                  style={[styles.pageButton, safePage <= 1 && styles.disabled]}
                >
                  <Ionicons name="chevron-back" size={17} color={C.text} />
                </Pressable>

                <Text style={styles.paginationText}>
                  {safePage} / {totalPages}
                </Text>

                <Pressable
                  accessibilityLabel="Página siguiente"
                  disabled={safePage >= totalPages}
                  onPress={() => setPage(safePage + 1)}
                  style={[
                    styles.pageButton,
                    safePage >= totalPages && styles.disabled,
                  ]}
                >
                  <Ionicons name="chevron-forward" size={17} color={C.text} />
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {isAdmin && (
          <Text style={styles.footnote}>
            Las importaciones CSV crean contactos compartidos con el workspace.
            La exportación incluye únicamente contactos visibles para ti.
          </Text>
        )}
      </ScrollView>

      <Modal
        visible={menu !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenu(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Cerrar filtros"
            onPress={() => setMenu(null)}
          />

          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.sectionTitle}>
                {menu === "position" ? "Filtrar por cargo" : "Filtrar por visibilidad"}
              </Text>
              <Pressable
                onPress={() => setMenu(null)}
                accessibilityLabel="Cerrar"
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={C.muted} />
              </Pressable>
            </View>

            {menu === "position" && (
              <TextInput
                autoFocus={Platform.OS === "web"}
                accessibilityLabel="Buscar cargo"
                placeholder="Buscar cargo…"
                placeholderTextColor={C.muted}
                value={menuSearch}
                onChangeText={setMenuSearch}
                style={styles.modalSearch}
              />
            )}

            <ScrollView keyboardShouldPersistTaps="handled">
              <Pressable
                style={styles.menuOption}
                onPress={() => {
                  if (menu === "position") setPosition(null);
                  else setVisibility(null);
                  setMenu(null);
                }}
              >
                <Text style={styles.cellText}>
                  {menu === "position" ? "Todos los cargos" : "Todas las visibilidades"}
                </Text>
                {currentMenuValue === null && (
                  <Ionicons name="checkmark" size={19} color={C.purple} />
                )}
              </Pressable>

              {menuOptionsFiltered.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.menuOption,
                    currentMenuValue === option.value && styles.selectedRow,
                  ]}
                  onPress={() => {
                    if (menu === "position") setPosition(option.value);
                    else setVisibility(option.value);
                    setMenu(null);
                  }}
                >
                  <Text style={styles.cellText}>{option.label}</Text>
                  {currentMenuValue === option.value && (
                    <Ionicons name="checkmark" size={19} color={C.purple} />
                  )}
                </Pressable>
              ))}

              {!menuOptionsFiltered.length && (
                <Text style={styles.emptyDescription}>No hay coincidencias.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 28, paddingBottom: 40, gap: 22 },
  mobileContent: { padding: 16, gap: 18 },
  breadcrumb: { flexDirection: "row", alignItems: "center", gap: 8 },
  breadcrumbText: { fontSize: 12, color: C.muted },
  breadcrumbCurrent: { fontSize: 12, color: C.text, fontWeight: "600" },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    flexWrap: "wrap",
  },
  headerMobile: { alignItems: "flex-start" },
  headingBlock: { gap: 6, flexShrink: 1 },
  headingLine: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: C.text, fontSize: 29, fontWeight: "700", letterSpacing: -0.8 },
  subtitle: { color: C.muted, fontSize: 13, lineHeight: 21 },
  countPill: {
    backgroundColor: C.purpleSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  countPillText: { color: C.purple, fontSize: 13, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  button: {
    minHeight: 39,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  buttonText: { color: C.text, fontSize: 12, fontWeight: "600" },
  primaryButton: { backgroundColor: C.purple, borderColor: C.purple },
  primaryText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: {
    flex: 1,
    minWidth: 170,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 18,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  metricMobile: { flexBasis: "45%", minWidth: 130, padding: 13 },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: C.purpleSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  metricValue: { color: C.text, fontSize: 24, fontWeight: "700" },
  metricLabel: { color: C.muted, fontSize: 11, marginTop: 3 },
  panel: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  panelTop: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 15,
  },
  tabs: { flexDirection: "row", gap: 22 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 17,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: C.purple },
  tabText: { color: C.muted, fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: C.purple },
  tabCount: {
    color: C.muted,
    backgroundColor: C.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    fontSize: 11,
  },
  toolbar: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 9,
  },
  searchBox: {
    flex: 1,
    minWidth: 230,
    maxWidth: 500,
    minHeight: 40,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    backgroundColor: "#fbfcfe",
  },
  searchMobile: { flexBasis: "100%", maxWidth: "100%" },
  searchInput: { flex: 1, color: C.text, fontSize: 13, paddingVertical: 10 },
  textLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 7,
  },
  textLinkText: { color: C.purple, fontSize: 12, fontWeight: "600" },
  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 18,
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: C.purpleSoft,
  },
  selectionText: { color: C.purple, fontSize: 12, fontWeight: "700" },
  table: { minWidth: 1160 },
  tableHeading: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 43,
    backgroundColor: "#f9fafc",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  columnHeading: { color: C.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  sortHeading: { flexDirection: "row", alignItems: "center", gap: 6 },
  cell: { paddingHorizontal: 14, justifyContent: "center" },
  nameColumn: { width: 300 },
  companyColumn: { width: 205 },
  positionColumn: { width: 180 },
  phoneColumn: { width: 150 },
  visibilityColumn: { width: 150 },
  dateColumn: { width: 145 },
  arrowColumn: { width: 30, alignItems: "center", justifyContent: "center" },
  checkCell: { width: 44, alignItems: "center", justifyContent: "center" },
  checkbox: {
    height: 17,
    width: 17,
    borderWidth: 1,
    borderColor: "#cdd2df",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
  },
  checkboxActive: { backgroundColor: C.purple, borderColor: C.purple },
  tableRow: {
    flexDirection: "row",
    minHeight: 73,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f1f5",
  },
  rowLink: { flexDirection: "row", minHeight: 73 },
  rowHover: { backgroundColor: "#faf8ff" },
  selectedRow: { backgroundColor: "#f7f3ff" },
  personCell: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 12 },
  personText: { flex: 1, minWidth: 0, gap: 4 },
  avatar: {
    width: 37,
    height: 37,
    borderRadius: 11,
    backgroundColor: "#eee9f8",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: C.purple, fontWeight: "700", fontSize: 12 },
  contactName: { color: C.text, fontWeight: "600", fontSize: 13 },
  contactEmail: { color: C.muted, fontSize: 12 },
  cellText: { color: C.text, fontSize: 12, lineHeight: 18 },
  smallText: { color: C.muted, fontSize: 11, lineHeight: 18 },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "600" },
  privateBadge: { backgroundColor: C.orangeSoft },
  selectedBadge: { backgroundColor: C.purpleSoft },
  workspaceBadge: { backgroundColor: C.greenSoft },
  cards: { paddingHorizontal: 12, gap: 10, paddingBottom: 12 },
  mobileCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    gap: 10,
  },
  mobileCardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  mobileContactLine: { color: C.muted, fontSize: 12, paddingLeft: 47 },
  mobileCardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  paginationText: { color: C.text, fontSize: 12, fontWeight: "500" },
  paginationButtons: { flexDirection: "row", alignItems: "center", gap: 14 },
  pageButton: {
    height: 32,
    width: 32,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: { minHeight: 280, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  emptyIcon: { padding: 18, borderRadius: 18, backgroundColor: C.purpleSoft },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: "600" },
  emptyDescription: { color: C.muted, fontSize: 13, lineHeight: 21, textAlign: "center" },
  notice: {
    backgroundColor: C.purpleSoft,
    borderRadius: 9,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  noticeText: { flex: 1, fontSize: 12, color: C.purple, lineHeight: 19 },
  importNotice: { backgroundColor: "#eef5ff", borderRadius: 10, padding: 15, gap: 5 },
  footnote: { color: C.muted, fontSize: 11, lineHeight: 19 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(24,28,44,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  modalCard: {
    width: "100%",
    maxWidth: 430,
    maxHeight: "75%",
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 18,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  modalSearch: {
    backgroundColor: C.bg,
    color: C.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 13,
  },
  menuOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderRadius: 7,
  },
});