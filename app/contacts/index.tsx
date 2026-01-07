// app/contacts/index.tsx

import {
  importContacts,
  listContacts,
  type ImportContactRow,
} from "@/src/api/contacts";
import { api } from "@/src/api/http";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as DocumentPicker from "expo-document-picker";
// Expo SDK 54: legacy para evitar warning de deprecación
import * as FileSystem from "expo-file-system/legacy";

/* Tema consistente */
const BG = "#0b0c10";
const CARD = "#14151a";
const BORDER = "#272a33";
const FIELD = "#121318";
const TEXT = "#e8ecf1";
const SUBTLE = "#a9b0bd";
const ACCENT = "#7c3aed";
const ACCENT_2 = "#22d3ee";

const PAGE_SIZE = 50;
const MAX_VISIBLE_PAGES = 4;

// clave para recordar último backup (workspace)
const EXPORT_WS_TS_KEY = "contacts:export_ws_ts:v1";

function strip(s?: string | null) {
  return (s ?? "").trim();
}

function normalize(s?: string | null) {
  return strip(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function clientTypeLabel(t?: string | null) {
  if (t === "productora") return "productora";
  if (t === "agencia") return "agencia";
  if (t === "directo") return "cliente directo";
  return "";
}

function matchesContact(term: string, c: any) {
  if (!term) return true;

  const workspaces =
    (c?.workspaces && Array.isArray(c.workspaces)
      ? c.workspaces.map((w: any) => w?.name || w).join(" ")
      : c?.workspace_names || "") ?? "";

  const hay = [
    c?.name,
    c?.email,
    c?.phone,
    c?.company,
    c?.position,
    clientTypeLabel(c?.client_type),
    c?.created_by_name,
    c?.created_by_email,
    workspaces,
  ]
    .filter(Boolean)
    .join(" ");

  const n = normalize(hay);

  return term
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => n.includes(normalize(t)));
}

function positionKey(c: any) {
  return strip(c?.position) || "Sin cargo";
}

/* =========================
   CSV helpers (sin librerías)
   ========================= */

function sanitizePhone(v?: string | null) {
  const s = strip(v);
  if (!s) return null;
  return s.replace(/\s+/g, " ");
}

function toClientType(v?: string | null): ImportContactRow["client_type"] {
  const s = normalize(v);
  if (!s) return null;

  if (s.includes("productora")) return "productora";
  if (s.includes("agencia")) return "agencia";
  if (s.includes("directo") || s.includes("cliente")) return "directo";

  return null;
}

function detectDelimiter(sampleLine: string) {
  const commas = (sampleLine.match(/,/g) || []).length;
  const semis = (sampleLine.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

// Parser CSV con comillas dobles y delimitador configurable
function parseCSV(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '"') {
      if (inQuotes && s[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      row.push(cur);
      cur = "";
      continue;
    }

    if (!inQuotes && ch === "\n") {
      row.push(cur);
      rows.push(row.map((x) => x ?? ""));
      row = [];
      cur = "";
      continue;
    }

    cur += ch;
  }

  row.push(cur);
  rows.push(row.map((x) => x ?? ""));

  return rows
    .map((r) => r.map((c) => (c ?? "").trim()))
    .filter((r) => r.some((c) => strip(c).length > 0));
}

function normalizeHeader(h: string) {
  return normalize(h)
    .replace(/\./g, "")
    .replace(/\-/g, " ")
    .replace(/\_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findCol(headers: string[], candidates: string[]) {
  const H = headers.map(normalizeHeader);

  for (const cand of candidates) {
    const c = normalizeHeader(cand);
    const idx = H.findIndex((h) => h === c);
    if (idx >= 0) return idx;
  }

  for (const cand of candidates) {
    const c = normalizeHeader(cand);
    const idx = H.findIndex((h) => h.includes(c));
    if (idx >= 0) return idx;
  }

  return -1;
}

function csvToImportRows(csvText: string): ImportContactRow[] {
  const firstLine = (csvText.split(/\r?\n/)[0] ?? "").trim();
  const delimiter = detectDelimiter(firstLine);

  const grid = parseCSV(csvText, delimiter);
  if (grid.length === 0) return [];

  const headers = grid[0] ?? [];
  const body = grid.slice(1);

  const idxName = findCol(headers, [
    "name",
    "nombre",
    "contacto",
    "razon social",
    "razón social",
  ]);
  const idxEmail = findCol(headers, ["email", "correo", "mail", "e-mail"]);
  const idxPhone = findCol(headers, [
    "phone",
    "telefono",
    "teléfono",
    "celular",
    "movil",
    "móvil",
    "whatsapp",
  ]);
  const idxCompany = findCol(headers, [
    "company",
    "empresa",
    "compania",
    "compañia",
    "organizacion",
    "organización",
  ]);
  const idxPosition = findCol(headers, ["position", "cargo", "rol", "puesto"]);
  const idxClientType = findCol(headers, [
    "client_type",
    "tipo",
    "tipo cliente",
    "tipo_de_cliente",
    "cliente",
  ]);
  const idxAccountId = findCol(headers, [
    "account_id",
    "cuenta",
    "account",
    "account id",
  ]);

  const rows: ImportContactRow[] = [];

  for (let i = 0; i < body.length; i++) {
    const r = body[i] ?? [];

    const name = idxName >= 0 ? strip(r[idxName]) : "";
    const email = idxEmail >= 0 ? strip(r[idxEmail]) : "";
    const phone = idxPhone >= 0 ? sanitizePhone(r[idxPhone]) : null;
    const company = idxCompany >= 0 ? strip(r[idxCompany]) : "";
    const position = idxPosition >= 0 ? strip(r[idxPosition]) : "";
    const client_type =
      idxClientType >= 0 ? toClientType(r[idxClientType]) : null;
    const account_id = idxAccountId >= 0 ? strip(r[idxAccountId]) : "";

    if (!name) continue;

    rows.push({
      name,
      email: email || undefined,
      phone: phone || undefined,
      company: company || undefined,
      position: position || undefined,
      client_type: client_type ?? null,
      account_id: account_id || undefined,
    });
  }

  return rows;
}

/* =========================
   Export CSV (backup)
   ========================= */

function csvEscape(value: any): string {
  const v = value == null ? "" : String(value);
  const escaped = v.replace(/"/g, '""');
  return `"${escaped}"`;
}

/* =========================
   UI paginación numerada
   ========================= */

function getVisiblePages(page: number, totalPages: number) {
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  let start = Math.max(1, page - Math.floor(MAX_VISIBLE_PAGES / 2));
  let end = start + MAX_VISIBLE_PAGES - 1;

  if (end > totalPages) {
    end = totalPages;
    start = end - MAX_VISIBLE_PAGES + 1;
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export default function ContactsList() {
  const roleQuery = useQuery({
    queryKey: ["tenants-role"],
    queryFn: () => api.get("/tenants/role"),
  });

  const roleData = roleQuery.data as any;
  const role: string | undefined = roleData?.role;
  const isAdmin = role === "admin" || role === "owner";

  const q = useQuery({
    queryKey: ["contacts"],
    queryFn: () => listContacts(), // ✅ trae contactos del workspace actual
  });

  const onRefresh = useCallback(() => {
    q.refetch();
    roleQuery.refetch();
  }, [q, roleQuery]);

  const [search, setSearch] = useState("");
  const [activePos, setActivePos] = useState<string>("Todos");
  const [posMenuOpen, setPosMenuOpen] = useState(false);

  // paginación
  const [page, setPage] = useState(1);

  const [importInfo, setImportInfo] = useState<{
    filename?: string;
    received?: number;
    created?: number;
    skipped?: number;
    errors?: number;
    message?: string;
  } | null>(null);

  const importMut = useMutation({
    mutationFn: async (rows: ImportContactRow[]) => importContacts(rows),
    onSuccess: (res: any) => {
      setImportInfo({
        received: res?.received ?? undefined,
        created: res?.created ?? undefined,
        skipped: res?.skipped ?? undefined,
        errors: res?.errors ?? undefined,
        message: "Importación terminada",
      });
      q.refetch();
      setPage(1);
    },
    onError: (e: any) => {
      setImportInfo({
        message: String(e?.message || e || "Error importando"),
      });
    },
  });

  const onPickCSV = useCallback(async () => {
    setImportInfo(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if ((result as any)?.canceled) return;

      const asset = (result as any)?.assets?.[0];
      const uri: string | undefined = asset?.uri;
      const name: string | undefined = asset?.name;

      const file: File | undefined = asset?.file;

      let csvTextRaw = "";

      if (file && typeof file.text === "function") {
        csvTextRaw = await file.text();
      } else {
        if (!uri) {
          setImportInfo({ message: "No se pudo leer el archivo (sin uri)" });
          return;
        }
        csvTextRaw = await FileSystem.readAsStringAsync(uri, {
          encoding: "utf8",
        });
      }

      const csvText = csvTextRaw.replace(/^\uFEFF/, "");
      const rows = csvToImportRows(csvText);

      if (!rows.length) {
        setImportInfo({
          filename: name,
          message:
            "No encontré filas válidas. Revisa que exista una columna de nombre (name/nombre).",
        });
        return;
      }

      setImportInfo({
        filename: name,
        message: `Archivo listo: ${rows.length} filas detectadas. Importando...`,
        received: rows.length,
      });

      importMut.mutate(rows);
    } catch (e: any) {
      setImportInfo({
        message: String(e?.message || e || "Error seleccionando archivo"),
      });
    }
  }, [importMut]);

  // ✅ blindaje: q.data a veces puede ser objeto, no array
  const data = useMemo(() => {
    const d: any = q.data;

    if (Array.isArray(d)) return d;

    // por si tu api wrapper devolvió algo tipo { rows: [...] }
    if (d && Array.isArray(d.rows)) return d.rows;

    return [];
  }, [q.data]);

  // Backup SOLO del workspace actual (solo admin/owner)
  const handleBackupPress = useCallback(async () => {
    try {
      if (!isAdmin) {
        Alert.alert(
          "Sin permisos",
          "Solo los administradores pueden generar backups."
        );
        return;
      }

      if (!data || data.length === 0) {
        Alert.alert("Sin datos", "No hay contactos para exportar.");
        return;
      }

      const headers = [
        "id",
        "name",
        "email",
        "phone",
        "company",
        "position",
        "client_type",
        "created_at",
        "updated_at",
        "created_by_name",
        "created_by_email",
      ];

      const rows: string[] = [];
      rows.push(headers.map(csvEscape).join(","));

      for (const c of data as any[]) {
        rows.push(
          [
            c.id,
            c.name,
            c.email,
            c.phone,
            c.company,
            c.position,
            (c as any).client_type,
            c.created_at,
            c.updated_at,
            c.created_by_name,
            c.created_by_email,
          ]
            .map(csvEscape)
            .join(",")
        );
      }

      const csv = rows.join("\r\n");

      if (Platform.OS === "web") {
        const g: any = globalThis as any;
        const blob = new g.Blob([csv], { type: "text/csv;charset=utf-8;" });
        const blobUrl = g.URL.createObjectURL(blob);

        const a = g.document.createElement("a");
        a.href = blobUrl;
        a.download = `contacts-workspace-backup-${new Date()
          .toISOString()
          .slice(0, 10)}.csv`;
        g.document.body.appendChild(a);
        a.click();
        a.remove();
        g.URL.revokeObjectURL(blobUrl);
      } else {
        Alert.alert(
          "Backup disponible en web",
          "Por ahora el archivo de backup se puede descargar desde la versión web."
        );
      }

      const maxTs = (data as any[]).reduce((max: number, c: any) => {
        const raw = c.updated_at || c.created_at || "";
        const t = Date.parse(String(raw));
        if (!Number.isFinite(t)) return max;
        return t > max ? t : max;
      }, 0);

      await AsyncStorage.setItem(
        EXPORT_WS_TS_KEY,
        String(maxTs || Date.now())
      );

      Alert.alert(
        "Backup generado",
        "Se ha generado el archivo de contactos del workspace actual."
      );
    } catch (e: any) {
      console.error("Error generando backup:", e);
      Alert.alert(
        "Error",
        String(e?.message ?? "No se pudo generar el backup de contactos.")
      );
    }
  }, [isAdmin, data]);

  const positionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data) {
      const key = positionKey(c);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const entries = Array.from(counts.entries()).sort(([a], [b]) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
    return [
      { label: "Todos", count: data.length },
      ...entries.map(([label, count]) => ({ label, count })),
    ];
  }, [data]);

  const filtered = useMemo(() => {
    const byPos =
      activePos === "Todos"
        ? data
        : data.filter((c: any) => positionKey(c) === activePos);

    const bySearch = search
      ? byPos.filter((c: any) => matchesContact(search, c))
      : byPos;

    return [...bySearch].sort((a: any, b: any) =>
      (a?.name ?? "").localeCompare(b?.name ?? "", "es", {
        sensitivity: "base",
      })
    );
  }, [data, activePos, search]);

  // ✅ cuando cambie el filtro/búsqueda -> volver a página 1 (sin setState en render)
  const key = useMemo(
    () => `${activePos}__${normalize(search)}`,
    [activePos, search]
  );
  useEffect(() => {
    setPage(1);
  }, [key]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = filtered.slice(start, end);

  const visiblePages = getVisiblePages(safePage, totalPages);

  const errorMsg = (q.error as any)?.message || "";

  const activePosOption = positionOptions.find((t) => t.label === activePos);
  const activePosLabel = activePosOption
    ? `${activePosOption.label} (${activePosOption.count})`
    : "Todos";

  return (
    <>
      <Stack.Screen
        options={{
          title: "Contactos",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
      <View style={styles.screen}>
        <View style={styles.headerRow}>
          <Link href="/contacts/new" asChild>
            <Pressable
              style={({ pressed }) => [
                styles.newBtn,
                pressed && { opacity: 0.92 },
              ]}
            >
              <Text style={styles.newBtnText}>+ Nuevo Contacto</Text>
            </Pressable>
          </Link>

          {isAdmin && (
            <View style={{ gap: 8 }}>
              <Link href="/contacts/all" asChild>
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    pressed && { opacity: 0.92 },
                  ]}
                >
                  <Text style={styles.secondaryBtnText}>Ver todos</Text>
                </Pressable>
              </Link>

              <Pressable
                onPress={handleBackupPress}
                style={({ pressed }) => [
                  styles.exportBtn,
                  pressed && { opacity: 0.92 },
                ]}
              >
                <Text style={styles.exportBtnText}>Backup</Text>
              </Pressable>

              <Pressable
                onPress={onPickCSV}
                disabled={importMut.isPending}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && { opacity: 0.92 },
                  importMut.isPending && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.secondaryBtnText}>
                  {importMut.isPending ? "Importando..." : "Importar CSV"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {isAdmin && importInfo?.message && (
          <View style={styles.importInfoBox}>
            <Text style={styles.importInfoTitle}>
              {importInfo.filename
                ? `Importación: ${importInfo.filename}`
                : "Importación"}
            </Text>

            <Text style={styles.importInfoText}>{importInfo.message}</Text>

            {(importInfo.received != null ||
              importInfo.created != null ||
              importInfo.skipped != null ||
              importInfo.errors != null) && (
              <Text style={styles.importInfoMeta}>
                {`recibidos: ${importInfo.received ?? 0} · creados: ${
                  importInfo.created ?? 0
                } · saltados: ${importInfo.skipped ?? 0} · errores: ${
                  importInfo.errors ?? 0
                }`}
              </Text>
            )}
          </View>
        )}

        <View style={styles.searchWrap}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nombre, empresa, cargo, email, teléfono, tipo de cliente, creador o workspace"
            placeholderTextColor={SUBTLE}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={() => setSearch((s) => s.trim())}
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch("")}
              style={styles.clearBtn}
              hitSlop={8}
            >
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.filterRow}>
          <View style={styles.posDropdownWrapper}>
            <Pressable
              style={styles.posDropdownTrigger}
              onPress={() => setPosMenuOpen((v) => !v)}
            >
              <Text style={styles.posDropdownText} numberOfLines={1}>
                {activePosLabel}
              </Text>
              <Text style={styles.posDropdownArrow}>
                {posMenuOpen ? "▲" : "▼"}
              </Text>
            </Pressable>

            {posMenuOpen && (
              <View style={styles.posDropdownMenu}>
                {positionOptions.map((opt) => {
                  const active = opt.label === activePos;
                  return (
                    <Pressable
                      key={opt.label}
                      style={[styles.posOption, active && styles.posOptionActive]}
                      onPress={() => {
                        setActivePos(opt.label);
                        setPosMenuOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.posOptionText,
                          active && styles.posOptionTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {opt.label} ({opt.count})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View style={{ flex: 1 }} />
        </View>

        {q.isLoading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator />
            <Text style={styles.loaderText}>Cargando contactos…</Text>
          </View>
        ) : q.isError ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorTitle}>
              No se pudieron cargar los contactos
            </Text>
            {!!errorMsg && <Text style={styles.errorSub}>{errorMsg}</Text>}
            <Pressable
              onPress={onRefresh}
              style={({ pressed }) => [
                styles.retryBtn,
                pressed && { opacity: 0.92 },
              ]}
            >
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.pagerSummary}>
              <Text style={styles.pagerSummaryText}>
                {total === 0
                  ? "0 resultados"
                  : `Mostrando ${start + 1}-${Math.min(end, total)} de ${total}`}
              </Text>
            </View>

            <FlatList
              contentContainerStyle={[
                styles.listContainer,
                pageItems.length === 0 && { flex: 1 },
              ]}
              data={pageItems}
              keyExtractor={(item: any) => item.id}
              refreshControl={
                <RefreshControl
                  refreshing={q.isFetching || roleQuery.isFetching}
                  onRefresh={onRefresh}
                />
              }
              ListEmptyComponent={
                <View style={{ alignItems: "center", marginTop: 8 }}>
                  {data.length === 0 ? (
                    <Text style={styles.subtle}>Sin contactos aún</Text>
                  ) : (
                    <Text style={styles.subtle}>
                      No hay resultados para “{search.trim()}”
                    </Text>
                  )}
                </View>
              }
              renderItem={({ item }: any) => (
                <Link
                  href={{
                    pathname: "/contacts/[id]",
                    params: { id: item.id },
                  }}
                  asChild
                >
                  <Pressable
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { opacity: 0.96 },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {item.created_by_name && (
                          <Text style={styles.creator} numberOfLines={1}>
                            · {item.created_by_name}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.sub}>
                        {strip(item.position) ||
                          strip(item.company) ||
                          strip(item.email) ||
                          ""}
                      </Text>
                    </View>
                  </Pressable>
                </Link>
              )}
            />

            {totalPages > 1 && (
              <View style={styles.pager}>
                <Pressable
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  style={({ pressed }) => [
                    styles.pagerBtn,
                    pressed && { opacity: 0.92 },
                    safePage <= 1 && { opacity: 0.4 },
                  ]}
                >
                  <Text style={styles.pagerBtnText}>Anterior</Text>
                </Pressable>

                <View style={styles.pageNums}>
                  {safePage > 1 && visiblePages[0] > 1 && (
                    <Text style={styles.dots}>…</Text>
                  )}

                  {visiblePages.map((n) => {
                    const active = n === safePage;
                    return (
                      <Pressable
                        key={n}
                        onPress={() => setPage(n)}
                        style={[styles.pageNum, active && styles.pageNumActive]}
                      >
                        <Text
                          style={[
                            styles.pageNumText,
                            active && styles.pageNumTextActive,
                          ]}
                        >
                          {n}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {safePage < totalPages &&
                    visiblePages[visiblePages.length - 1] < totalPages && (
                      <Text style={styles.dots}>…</Text>
                    )}
                </View>

                <Pressable
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  style={({ pressed }) => [
                    styles.pagerBtn,
                    pressed && { opacity: 0.92 },
                    safePage >= totalPages && { opacity: 0.4 },
                  ]}
                >
                  <Text style={styles.pagerBtnText}>Siguiente</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16 },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  newBtn: {
    backgroundColor: ACCENT,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  newBtnText: { color: "#fff", fontWeight: "900" },

  secondaryBtn: {
    backgroundColor: "transparent",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  secondaryBtnText: { color: TEXT, fontWeight: "700", fontSize: 13 },

  exportBtn: {
    backgroundColor: "transparent",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.9)",
  },
  exportBtnText: { color: "#e0f2fe", fontWeight: "700", fontSize: 13 },

  importInfoBox: {
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 10,
  },
  importInfoTitle: {
    color: TEXT,
    fontWeight: "800",
    marginBottom: 4,
    fontSize: 12,
  },
  importInfoText: { color: SUBTLE, fontSize: 12 },
  importInfoMeta: {
    color: ACCENT_2,
    fontSize: 12,
    marginTop: 6,
    fontWeight: "700",
  },

  searchWrap: {
    position: "relative",
    backgroundColor: FIELD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 6,
  },
  searchInput: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: TEXT,
    fontSize: 14,
  },
  clearBtn: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  clearText: { color: TEXT, fontSize: 18, lineHeight: 18, fontWeight: "700" },

  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    marginTop: 2,
  },
  posDropdownWrapper: { flexShrink: 1 },
  posDropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#232326",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  posDropdownText: {
    color: TEXT,
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 1,
  },
  posDropdownArrow: { color: SUBTLE, marginLeft: 6, fontSize: 10 },
  posDropdownMenu: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  posOption: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1f252f",
  },
  posOptionActive: { backgroundColor: "#1f2937" },
  posOptionText: { fontSize: 12, color: TEXT },
  posOptionTextActive: { fontWeight: "800", color: ACCENT_2 },

  pagerSummary: {
    marginTop: 2,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  pagerSummaryText: { color: SUBTLE, fontSize: 12, fontWeight: "700" },

  listContainer: { gap: 10 },
  row: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "nowrap",
  },
  name: {
    fontSize: 16,
    fontWeight: "800",
    color: TEXT,
    flexShrink: 1,
  },
  sub: { color: SUBTLE },
  creator: {
    color: ACCENT_2,
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 0,
  },
  subtle: { color: SUBTLE, textAlign: "center", marginTop: 8 },

  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loaderText: { color: SUBTLE, marginTop: 8 },

  errorWrap: { alignItems: "center", paddingVertical: 24, gap: 8 },
  errorTitle: { color: "#fecaca", fontWeight: "800" },
  errorSub: {
    color: "#9ca3af",
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  retryBtn: {
    marginTop: 6,
    backgroundColor: ACCENT,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  retryText: { color: "#fff", fontWeight: "900" },

  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 10,
  },
  pagerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  pagerBtnText: { color: TEXT, fontWeight: "900", fontSize: 12 },

  pageNums: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    justifyContent: "center",
  },
  pageNum: {
    minWidth: 34,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.02)",
    alignItems: "center",
    justifyContent: "center",
  },
  pageNumActive: {
    borderColor: "rgba(34,211,238,0.8)",
    backgroundColor: "rgba(34,211,238,0.12)",
  },
  pageNumText: { color: TEXT, fontWeight: "800", fontSize: 12 },
  pageNumTextActive: { color: ACCENT_2 },

  dots: { color: SUBTLE, fontWeight: "900", paddingHorizontal: 4 },
});


// // app/contacts/index.tsx

// import {
//   importContacts,
//   listContacts,
//   type ImportContactRow,
// } from "@/src/api/contacts";
// import { api } from "@/src/api/http";
// import { useMutation, useQuery } from "@tanstack/react-query";
// import { Link, Stack } from "expo-router";
// import { useCallback, useEffect, useMemo, useState } from "react";
// import {
//   ActivityIndicator,
//   FlatList,
//   Pressable,
//   RefreshControl,
//   StyleSheet,
//   Text,
//   TextInput,
//   View,
// } from "react-native";

// import * as DocumentPicker from "expo-document-picker";
// // Expo SDK 54: legacy para evitar warning de deprecación
// import * as FileSystem from "expo-file-system/legacy";

// /* Tema consistente */
// const BG = "#0b0c10";
// const CARD = "#14151a";
// const BORDER = "#272a33";
// const FIELD = "#121318";
// const TEXT = "#e8ecf1";
// const SUBTLE = "#a9b0bd";
// const ACCENT = "#7c3aed";
// const ACCENT_2 = "#22d3ee";

// const PAGE_SIZE = 50;
// const MAX_VISIBLE_PAGES = 4;

// function strip(s?: string | null) {
//   return (s ?? "").trim();
// }

// function normalize(s?: string | null) {
//   return strip(s)
//     .toLowerCase()
//     .normalize("NFD")
//     .replace(/[\u0300-\u036f]/g, "");
// }

// function clientTypeLabel(t?: string | null) {
//   if (t === "productora") return "productora";
//   if (t === "agencia") return "agencia";
//   if (t === "directo") return "cliente directo";
//   return "";
// }

// function matchesContact(term: string, c: any) {
//   if (!term) return true;

//   const workspaces =
//     (c?.workspaces && Array.isArray(c.workspaces)
//       ? c.workspaces.map((w: any) => w?.name || w).join(" ")
//       : c?.workspace_names || "") ?? "";

//   const hay = [
//     c?.name,
//     c?.email,
//     c?.phone,
//     c?.company,
//     c?.position,
//     clientTypeLabel(c?.client_type),
//     c?.created_by_name,
//     c?.created_by_email,
//     workspaces,
//   ]
//     .filter(Boolean)
//     .join(" ");

//   const n = normalize(hay);

//   return term
//     .split(/\s+/)
//     .filter(Boolean)
//     .every((t) => n.includes(normalize(t)));
// }

// function positionKey(c: any) {
//   return strip(c?.position) || "Sin cargo";
// }

// /* =========================
//    CSV helpers (sin librerías)
//    ========================= */

// function sanitizePhone(v?: string | null) {
//   const s = strip(v);
//   if (!s) return null;
//   return s.replace(/\s+/g, " ");
// }

// function toClientType(v?: string | null): ImportContactRow["client_type"] {
//   const s = normalize(v);
//   if (!s) return null;

//   if (s.includes("productora")) return "productora";
//   if (s.includes("agencia")) return "agencia";
//   if (s.includes("directo") || s.includes("cliente")) return "directo";

//   return null;
// }

// function detectDelimiter(sampleLine: string) {
//   const commas = (sampleLine.match(/,/g) || []).length;
//   const semis = (sampleLine.match(/;/g) || []).length;
//   return semis > commas ? ";" : ",";
// }

// // Parser CSV con comillas dobles y delimitador configurable
// function parseCSV(text: string, delimiter: string): string[][] {
//   const rows: string[][] = [];
//   let row: string[] = [];
//   let cur = "";
//   let inQuotes = false;

//   const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

//   for (let i = 0; i < s.length; i++) {
//     const ch = s[i];

//     if (ch === '"') {
//       if (inQuotes && s[i + 1] === '"') {
//         cur += '"';
//         i++;
//       } else {
//         inQuotes = !inQuotes;
//       }
//       continue;
//     }

//     if (!inQuotes && ch === delimiter) {
//       row.push(cur);
//       cur = "";
//       continue;
//     }

//     if (!inQuotes && ch === "\n") {
//       row.push(cur);
//       rows.push(row.map((x) => x ?? ""));
//       row = [];
//       cur = "";
//       continue;
//     }

//     cur += ch;
//   }

//   row.push(cur);
//   rows.push(row.map((x) => x ?? ""));

//   return rows
//     .map((r) => r.map((c) => (c ?? "").trim()))
//     .filter((r) => r.some((c) => strip(c).length > 0));
// }

// function normalizeHeader(h: string) {
//   return normalize(h)
//     .replace(/\./g, "")
//     .replace(/\-/g, " ")
//     .replace(/\_/g, " ")
//     .replace(/\s+/g, " ")
//     .trim();
// }

// function findCol(headers: string[], candidates: string[]) {
//   const H = headers.map(normalizeHeader);

//   for (const cand of candidates) {
//     const c = normalizeHeader(cand);
//     const idx = H.findIndex((h) => h === c);
//     if (idx >= 0) return idx;
//   }

//   for (const cand of candidates) {
//     const c = normalizeHeader(cand);
//     const idx = H.findIndex((h) => h.includes(c));
//     if (idx >= 0) return idx;
//   }

//   return -1;
// }

// function csvToImportRows(csvText: string): ImportContactRow[] {
//   const firstLine = (csvText.split(/\r?\n/)[0] ?? "").trim();
//   const delimiter = detectDelimiter(firstLine);

//   const grid = parseCSV(csvText, delimiter);
//   if (grid.length === 0) return [];

//   const headers = grid[0] ?? [];
//   const body = grid.slice(1);

//   const idxName = findCol(headers, [
//     "name",
//     "nombre",
//     "contacto",
//     "razon social",
//     "razón social",
//   ]);
//   const idxEmail = findCol(headers, ["email", "correo", "mail", "e-mail"]);
//   const idxPhone = findCol(headers, [
//     "phone",
//     "telefono",
//     "teléfono",
//     "celular",
//     "movil",
//     "móvil",
//     "whatsapp",
//   ]);
//   const idxCompany = findCol(headers, [
//     "company",
//     "empresa",
//     "compania",
//     "compañia",
//     "organizacion",
//     "organización",
//   ]);
//   const idxPosition = findCol(headers, ["position", "cargo", "rol", "puesto"]);
//   const idxClientType = findCol(headers, [
//     "client_type",
//     "tipo",
//     "tipo cliente",
//     "tipo_de_cliente",
//     "cliente",
//   ]);
//   const idxAccountId = findCol(headers, [
//     "account_id",
//     "cuenta",
//     "account",
//     "account id",
//   ]);

//   const rows: ImportContactRow[] = [];

//   for (let i = 0; i < body.length; i++) {
//     const r = body[i] ?? [];

//     const name = idxName >= 0 ? strip(r[idxName]) : "";
//     const email = idxEmail >= 0 ? strip(r[idxEmail]) : "";
//     const phone = idxPhone >= 0 ? sanitizePhone(r[idxPhone]) : null;
//     const company = idxCompany >= 0 ? strip(r[idxCompany]) : "";
//     const position = idxPosition >= 0 ? strip(r[idxPosition]) : "";
//     const client_type =
//       idxClientType >= 0 ? toClientType(r[idxClientType]) : null;
//     const account_id = idxAccountId >= 0 ? strip(r[idxAccountId]) : "";

//     if (!name) continue;

//     rows.push({
//       name,
//       email: email || undefined,
//       phone: phone || undefined,
//       company: company || undefined,
//       position: position || undefined,
//       client_type: client_type ?? null,
//       account_id: account_id || undefined,
//     });
//   }

//   return rows;
// }

// /* =========================
//    UI paginación numerada
//    ========================= */

// function getVisiblePages(page: number, totalPages: number) {
//   if (totalPages <= MAX_VISIBLE_PAGES) {
//     return Array.from({ length: totalPages }, (_, i) => i + 1);
//   }

//   let start = Math.max(1, page - Math.floor(MAX_VISIBLE_PAGES / 2));
//   let end = start + MAX_VISIBLE_PAGES - 1;

//   if (end > totalPages) {
//     end = totalPages;
//     start = end - MAX_VISIBLE_PAGES + 1;
//   }

//   return Array.from({ length: end - start + 1 }, (_, i) => start + i);
// }

// export default function ContactsList() {
//   const roleQuery = useQuery({
//     queryKey: ["tenants-role"],
//     queryFn: () => api.get("/tenants/role"),
//   });

//   const roleData = roleQuery.data as any;
//   const role: string | undefined = roleData?.role;
//   const isAdmin = role === "admin" || role === "owner";

//   const q = useQuery({
//     queryKey: ["contacts"],
//     queryFn: () => listContacts(), // ✅ trae TODO
//   });

//   const onRefresh = useCallback(() => {
//     q.refetch();
//     roleQuery.refetch();
//   }, [q, roleQuery]);

//   const [search, setSearch] = useState("");
//   const [activePos, setActivePos] = useState<string>("Todos");
//   const [posMenuOpen, setPosMenuOpen] = useState(false);

//   // paginación
//   const [page, setPage] = useState(1);

//   const [importInfo, setImportInfo] = useState<{
//     filename?: string;
//     received?: number;
//     created?: number;
//     skipped?: number;
//     errors?: number;
//     message?: string;
//   } | null>(null);

//   const importMut = useMutation({
//     mutationFn: async (rows: ImportContactRow[]) => importContacts(rows),
//     onSuccess: (res: any) => {
//       setImportInfo({
//         received: res?.received ?? undefined,
//         created: res?.created ?? undefined,
//         skipped: res?.skipped ?? undefined,
//         errors: res?.errors ?? undefined,
//         message: "Importación terminada",
//       });
//       q.refetch();
//       setPage(1);
//     },
//     onError: (e: any) => {
//       setImportInfo({
//         message: String(e?.message || e || "Error importando"),
//       });
//     },
//   });

//   const onPickCSV = useCallback(async () => {
//     setImportInfo(null);

//     try {
//       const result = await DocumentPicker.getDocumentAsync({
//         type: ["text/csv", "text/comma-separated-values", "*/*"],
//         copyToCacheDirectory: true,
//         multiple: false,
//       });

//       if ((result as any)?.canceled) return;

//       const asset = (result as any)?.assets?.[0];
//       const uri: string | undefined = asset?.uri;
//       const name: string | undefined = asset?.name;

//       const file: File | undefined = asset?.file;

//       let csvTextRaw = "";

//       if (file && typeof file.text === "function") {
//         csvTextRaw = await file.text();
//       } else {
//         if (!uri) {
//           setImportInfo({ message: "No se pudo leer el archivo (sin uri)" });
//           return;
//         }
//         csvTextRaw = await FileSystem.readAsStringAsync(uri, {
//           encoding: "utf8",
//         });
//       }

//       const csvText = csvTextRaw.replace(/^\uFEFF/, "");
//       const rows = csvToImportRows(csvText);

//       if (!rows.length) {
//         setImportInfo({
//           filename: name,
//           message:
//             "No encontré filas válidas. Revisa que exista una columna de nombre (name/nombre).",
//         });
//         return;
//       }

//       setImportInfo({
//         filename: name,
//         message: `Archivo listo: ${rows.length} filas detectadas. Importando...`,
//         received: rows.length,
//       });

//       importMut.mutate(rows);
//     } catch (e: any) {
//       setImportInfo({
//         message: String(e?.message || e || "Error seleccionando archivo"),
//       });
//     }
//   }, [importMut]);

//   // ✅ blindaje: q.data a veces puede ser objeto, no array
//   const data = useMemo(() => {
//     const d: any = q.data;

//     if (Array.isArray(d)) return d;

//     // por si tu api wrapper devolvió algo tipo { rows: [...] }
//     if (d && Array.isArray(d.rows)) return d.rows;

//     return [];
//   }, [q.data]);

//   const positionOptions = useMemo(() => {
//     const counts = new Map<string, number>();
//     for (const c of data) {
//       const key = positionKey(c);
//       counts.set(key, (counts.get(key) ?? 0) + 1);
//     }
//     const entries = Array.from(counts.entries()).sort(([a], [b]) =>
//       a.localeCompare(b, "es", { sensitivity: "base" })
//     );
//     return [
//       { label: "Todos", count: data.length },
//       ...entries.map(([label, count]) => ({ label, count })),
//     ];
//   }, [data]);

//   const filtered = useMemo(() => {
//     const byPos =
//       activePos === "Todos"
//         ? data
//         : data.filter((c: any) => positionKey(c) === activePos);

//     const bySearch = search
//       ? byPos.filter((c: any) => matchesContact(search, c))
//       : byPos;

//     return [...bySearch].sort((a: any, b: any) =>
//       (a?.name ?? "").localeCompare(b?.name ?? "", "es", {
//         sensitivity: "base",
//       })
//     );
//   }, [data, activePos, search]);

//   // ✅ cuando cambie el filtro/búsqueda -> volver a página 1 (sin setState en render)
//   const key = useMemo(() => `${activePos}__${normalize(search)}`, [activePos, search]);
//   useEffect(() => {
//     setPage(1);
//   }, [key]);

//   const total = filtered.length;
//   const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

//   const safePage = Math.min(Math.max(1, page), totalPages);
//   const start = (safePage - 1) * PAGE_SIZE;
//   const end = start + PAGE_SIZE;
//   const pageItems = filtered.slice(start, end);

//   const visiblePages = getVisiblePages(safePage, totalPages);

//   const errorMsg = (q.error as any)?.message || "";

//   const activePosOption = positionOptions.find((t) => t.label === activePos);
//   const activePosLabel = activePosOption
//     ? `${activePosOption.label} (${activePosOption.count})`
//     : "Todos";

//   return (
//     <>
//       <Stack.Screen
//         options={{
//           title: "Contactos",
//           headerStyle: { backgroundColor: BG },
//           headerTintColor: TEXT,
//           headerTitleStyle: { color: TEXT, fontWeight: "800" },
//         }}
//       />
//       <View style={styles.screen}>
//         <View style={styles.headerRow}>
//           <Link href="/contacts/new" asChild>
//             <Pressable
//               style={({ pressed }) => [
//                 styles.newBtn,
//                 pressed && { opacity: 0.92 },
//               ]}
//             >
//               <Text style={styles.newBtnText}>+ Nuevo Contacto</Text>
//             </Pressable>
//           </Link>

//           {isAdmin && (
//             <View style={{ gap: 8 }}>
//               <Link href="/contacts/all" asChild>
//                 <Pressable
//                   style={({ pressed }) => [
//                     styles.secondaryBtn,
//                     pressed && { opacity: 0.92 },
//                   ]}
//                 >
//                   <Text style={styles.secondaryBtnText}>Ver todos</Text>
//                 </Pressable>
//               </Link>

//               <Pressable
//                 onPress={onPickCSV}
//                 disabled={importMut.isPending}
//                 style={({ pressed }) => [
//                   styles.secondaryBtn,
//                   pressed && { opacity: 0.92 },
//                   importMut.isPending && { opacity: 0.6 },
//                 ]}
//               >
//                 <Text style={styles.secondaryBtnText}>
//                   {importMut.isPending ? "Importando..." : "Importar CSV"}
//                 </Text>
//               </Pressable>
//             </View>
//           )}
//         </View>

//         {isAdmin && importInfo?.message && (
//           <View style={styles.importInfoBox}>
//             <Text style={styles.importInfoTitle}>
//               {importInfo.filename
//                 ? `Importación: ${importInfo.filename}`
//                 : "Importación"}
//             </Text>

//             <Text style={styles.importInfoText}>{importInfo.message}</Text>

//             {(importInfo.received != null ||
//               importInfo.created != null ||
//               importInfo.skipped != null ||
//               importInfo.errors != null) && (
//               <Text style={styles.importInfoMeta}>
//                 {`recibidos: ${importInfo.received ?? 0} · creados: ${
//                   importInfo.created ?? 0
//                 } · saltados: ${importInfo.skipped ?? 0} · errores: ${
//                   importInfo.errors ?? 0
//                 }`}
//               </Text>
//             )}
//           </View>
//         )}

//         <View style={styles.searchWrap}>
//           <TextInput
//             value={search}
//             onChangeText={setSearch}
//             placeholder="Buscar por nombre, empresa, cargo, email, teléfono, tipo de cliente, creador o workspace"
//             placeholderTextColor={SUBTLE}
//             style={styles.searchInput}
//             returnKeyType="search"
//             onSubmitEditing={() => setSearch((s) => s.trim())}
//           />
//           {search.length > 0 && (
//             <Pressable
//               onPress={() => setSearch("")}
//               style={styles.clearBtn}
//               hitSlop={8}
//             >
//               <Text style={styles.clearText}>×</Text>
//             </Pressable>
//           )}
//         </View>

//         <View style={styles.filterRow}>
//           <View style={styles.posDropdownWrapper}>
//             <Pressable
//               style={styles.posDropdownTrigger}
//               onPress={() => setPosMenuOpen((v) => !v)}
//             >
//               <Text style={styles.posDropdownText} numberOfLines={1}>
//                 {activePosLabel}
//               </Text>
//               <Text style={styles.posDropdownArrow}>
//                 {posMenuOpen ? "▲" : "▼"}
//               </Text>
//             </Pressable>

//             {posMenuOpen && (
//               <View style={styles.posDropdownMenu}>
//                 {positionOptions.map((opt) => {
//                   const active = opt.label === activePos;
//                   return (
//                     <Pressable
//                       key={opt.label}
//                       style={[styles.posOption, active && styles.posOptionActive]}
//                       onPress={() => {
//                         setActivePos(opt.label);
//                         setPosMenuOpen(false);
//                       }}
//                     >
//                       <Text
//                         style={[
//                           styles.posOptionText,
//                           active && styles.posOptionTextActive,
//                         ]}
//                         numberOfLines={1}
//                       >
//                         {opt.label} ({opt.count})
//                       </Text>
//                     </Pressable>
//                   );
//                 })}
//               </View>
//             )}
//           </View>

//           <View style={{ flex: 1 }} />
//         </View>

//         {q.isLoading ? (
//           <View style={styles.loaderWrap}>
//             <ActivityIndicator />
//             <Text style={styles.loaderText}>Cargando contactos…</Text>
//           </View>
//         ) : q.isError ? (
//           <View style={styles.errorWrap}>
//             <Text style={styles.errorTitle}>
//               No se pudieron cargar los contactos
//             </Text>
//             {!!errorMsg && <Text style={styles.errorSub}>{errorMsg}</Text>}
//             <Pressable
//               onPress={onRefresh}
//               style={({ pressed }) => [
//                 styles.retryBtn,
//                 pressed && { opacity: 0.92 },
//               ]}
//             >
//               <Text style={styles.retryText}>Reintentar</Text>
//             </Pressable>
//           </View>
//         ) : (
//           <>
//             <View style={styles.pagerSummary}>
//               <Text style={styles.pagerSummaryText}>
//                 {total === 0
//                   ? "0 resultados"
//                   : `Mostrando ${start + 1}-${Math.min(end, total)} de ${total}`}
//               </Text>
//             </View>

//             <FlatList
//               contentContainerStyle={[
//                 styles.listContainer,
//                 pageItems.length === 0 && { flex: 1 },
//               ]}
//               data={pageItems}
//               keyExtractor={(item: any) => item.id}
//               refreshControl={
//                 <RefreshControl
//                   refreshing={q.isFetching || roleQuery.isFetching}
//                   onRefresh={onRefresh}
//                 />
//               }
//               ListEmptyComponent={
//                 <View style={{ alignItems: "center", marginTop: 8 }}>
//                   {data.length === 0 ? (
//                     <Text style={styles.subtle}>Sin contactos aún</Text>
//                   ) : (
//                     <Text style={styles.subtle}>
//                       No hay resultados para “{search.trim()}”
//                     </Text>
//                   )}
//                 </View>
//               }
//               renderItem={({ item }: any) => (
//                 <Link
//                   href={{
//                     pathname: "/contacts/[id]",
//                     params: { id: item.id },
//                   }}
//                   asChild
//                 >
//                   <Pressable
//                     style={({ pressed }) => [
//                       styles.row,
//                       pressed && { opacity: 0.96 },
//                     ]}
//                   >
//                     <View style={{ flex: 1 }}>
//                       <View style={styles.nameRow}>
//                         <Text style={styles.name} numberOfLines={1}>
//                           {item.name}
//                         </Text>
//                         {item.created_by_name && (
//                           <Text style={styles.creator} numberOfLines={1}>
//                             · {item.created_by_name}
//                           </Text>
//                         )}
//                       </View>
//                       <Text style={styles.sub}>
//                         {strip(item.position) ||
//                           strip(item.company) ||
//                           strip(item.email) ||
//                           ""}
//                       </Text>
//                     </View>
//                   </Pressable>
//                 </Link>
//               )}
//             />

//             {totalPages > 1 && (
//               <View style={styles.pager}>
//                 <Pressable
//                   onPress={() => setPage((p) => Math.max(1, p - 1))}
//                   disabled={safePage <= 1}
//                   style={({ pressed }) => [
//                     styles.pagerBtn,
//                     pressed && { opacity: 0.92 },
//                     safePage <= 1 && { opacity: 0.4 },
//                   ]}
//                 >
//                   <Text style={styles.pagerBtnText}>Anterior</Text>
//                 </Pressable>

//                 <View style={styles.pageNums}>
//                   {safePage > 1 && visiblePages[0] > 1 && (
//                     <Text style={styles.dots}>…</Text>
//                   )}

//                   {visiblePages.map((n) => {
//                     const active = n === safePage;
//                     return (
//                       <Pressable
//                         key={n}
//                         onPress={() => setPage(n)}
//                         style={[styles.pageNum, active && styles.pageNumActive]}
//                       >
//                         <Text
//                           style={[
//                             styles.pageNumText,
//                             active && styles.pageNumTextActive,
//                           ]}
//                         >
//                           {n}
//                         </Text>
//                       </Pressable>
//                     );
//                   })}

//                   {safePage < totalPages &&
//                     visiblePages[visiblePages.length - 1] < totalPages && (
//                       <Text style={styles.dots}>…</Text>
//                     )}
//                 </View>

//                 <Pressable
//                   onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
//                   disabled={safePage >= totalPages}
//                   style={({ pressed }) => [
//                     styles.pagerBtn,
//                     pressed && { opacity: 0.92 },
//                     safePage >= totalPages && { opacity: 0.4 },
//                   ]}
//                 >
//                   <Text style={styles.pagerBtnText}>Siguiente</Text>
//                 </Pressable>
//               </View>
//             )}
//           </>
//         )}
//       </View>
//     </>
//   );
// }

// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG, padding: 16 },

//   headerRow: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     marginBottom: 10,
//   },

//   newBtn: {
//     backgroundColor: ACCENT,
//     paddingVertical: 10,
//     paddingHorizontal: 14,
//     borderRadius: 12,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.16)",
//   },
//   newBtnText: { color: "#fff", fontWeight: "900" },

//   secondaryBtn: {
//     backgroundColor: "transparent",
//     paddingVertical: 8,
//     paddingHorizontal: 12,
//     borderRadius: 12,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.28)",
//   },
//   secondaryBtnText: { color: TEXT, fontWeight: "700", fontSize: 13 },

//   importInfoBox: {
//     marginBottom: 8,
//     borderRadius: 12,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: "rgba(255,255,255,0.04)",
//     padding: 10,
//   },
//   importInfoTitle: {
//     color: TEXT,
//     fontWeight: "800",
//     marginBottom: 4,
//     fontSize: 12,
//   },
//   importInfoText: { color: SUBTLE, fontSize: 12 },
//   importInfoMeta: {
//     color: ACCENT_2,
//     fontSize: 12,
//     marginTop: 6,
//     fontWeight: "700",
//   },

//   searchWrap: {
//     position: "relative",
//     backgroundColor: FIELD,
//     borderColor: BORDER,
//     borderWidth: 1,
//     borderRadius: 12,
//     marginBottom: 6,
//   },
//   searchInput: {
//     paddingVertical: 10,
//     paddingHorizontal: 14,
//     color: TEXT,
//     fontSize: 14,
//   },
//   clearBtn: {
//     position: "absolute",
//     right: 8,
//     top: 8,
//     width: 28,
//     height: 28,
//     borderRadius: 14,
//     alignItems: "center",
//     justifyContent: "center",
//     backgroundColor: "rgba(255,255,255,0.08)",
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.12)",
//   },
//   clearText: { color: TEXT, fontSize: 18, lineHeight: 18, fontWeight: "700" },

//   filterRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     marginBottom: 6,
//     marginTop: 2,
//   },
//   posDropdownWrapper: { flexShrink: 1 },
//   posDropdownTrigger: {
//     flexDirection: "row",
//     alignItems: "center",
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: "#232326",
//     backgroundColor: "rgba(255,255,255,0.04)",
//     paddingVertical: 6,
//     paddingHorizontal: 10,
//   },
//   posDropdownText: {
//     color: TEXT,
//     fontSize: 11,
//     fontWeight: "700",
//     flexShrink: 1,
//   },
//   posDropdownArrow: { color: SUBTLE, marginLeft: 6, fontSize: 10 },
//   posDropdownMenu: {
//     marginTop: 4,
//     borderRadius: 12,
//     backgroundColor: CARD,
//     borderWidth: 1,
//     borderColor: BORDER,
//     overflow: "hidden",
//   },
//   posOption: {
//     paddingVertical: 6,
//     paddingHorizontal: 10,
//     borderBottomWidth: 1,
//     borderBottomColor: "#1f252f",
//   },
//   posOptionActive: { backgroundColor: "#1f2937" },
//   posOptionText: { fontSize: 12, color: TEXT },
//   posOptionTextActive: { fontWeight: "800", color: ACCENT_2 },

//   pagerSummary: {
//     marginTop: 2,
//     marginBottom: 8,
//     paddingVertical: 6,
//     paddingHorizontal: 10,
//     borderRadius: 10,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: "rgba(255,255,255,0.03)",
//   },
//   pagerSummaryText: { color: SUBTLE, fontSize: 12, fontWeight: "700" },

//   listContainer: { gap: 10 },
//   row: {
//     backgroundColor: CARD,
//     borderWidth: 1,
//     borderColor: BORDER,
//     borderRadius: 12,
//     padding: 12,
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 8,
//   },
//   nameRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 6,
//     flexWrap: "nowrap",
//   },
//   name: {
//     fontSize: 16,
//     fontWeight: "800",
//     color: TEXT,
//     flexShrink: 1,
//   },
//   sub: { color: SUBTLE },
//   creator: {
//     color: ACCENT_2,
//     fontSize: 11,
//     fontWeight: "600",
//     flexShrink: 0,
//   },
//   subtle: { color: SUBTLE, textAlign: "center", marginTop: 8 },

//   loaderWrap: {
//     flex: 1,
//     alignItems: "center",
//     justifyContent: "center",
//     paddingVertical: 40,
//   },
//   loaderText: { color: SUBTLE, marginTop: 8 },

//   errorWrap: { alignItems: "center", paddingVertical: 24, gap: 8 },
//   errorTitle: { color: "#fecaca", fontWeight: "800" },
//   errorSub: {
//     color: "#9ca3af",
//     fontSize: 12,
//     textAlign: "center",
//     paddingHorizontal: 12,
//   },
//   retryBtn: {
//     marginTop: 6,
//     backgroundColor: ACCENT,
//     paddingHorizontal: 14,
//     paddingVertical: 10,
//     borderRadius: 12,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.16)",
//   },
//   retryText: { color: "#fff", fontWeight: "900" },

//   pager: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     marginTop: 10,
//     gap: 10,
//   },
//   pagerBtn: {
//     paddingVertical: 10,
//     paddingHorizontal: 12,
//     borderRadius: 12,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.22)",
//     backgroundColor: "rgba(255,255,255,0.03)",
//   },
//   pagerBtnText: { color: TEXT, fontWeight: "900", fontSize: 12 },

//   pageNums: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 6,
//     flex: 1,
//     justifyContent: "center",
//   },
//   pageNum: {
//     minWidth: 34,
//     paddingVertical: 8,
//     paddingHorizontal: 10,
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.18)",
//     backgroundColor: "rgba(255,255,255,0.02)",
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   pageNumActive: {
//     borderColor: "rgba(34,211,238,0.8)",
//     backgroundColor: "rgba(34,211,238,0.12)",
//   },
//   pageNumText: { color: TEXT, fontWeight: "800", fontSize: 12 },
//   pageNumTextActive: { color: ACCENT_2 },

//   dots: { color: SUBTLE, fontWeight: "900", paddingHorizontal: 4 },
// });


