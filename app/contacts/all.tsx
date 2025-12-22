// app/contacts/all.tsx
import { listAllContacts } from "@/src/api/contacts";
import { api } from "@/src/api/http";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
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

/* Tema consistente (igual que index) */
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

// clave para recordar último backup
const EXPORT_TS_KEY = "contacts:export_ts:v1";

function strip(s?: string | null) {
  return (s ?? "").trim();
}
function normalize(s?: string | null) {
  return strip(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function matchesContact(term: string, c: any) {
  if (!term) return true;
  const hay = `${c?.name ?? ""} ${c?.email ?? ""} ${c?.phone ?? ""} ${
    c?.company ?? ""
  } ${c?.position ?? ""}`;
  const n = normalize(hay);
  return term
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => n.includes(normalize(t)));
}
function positionKey(c: any) {
  return strip(c?.position) || "Sin cargo";
}

// util simple para CSV
function csvEscape(value: any): string {
  const v = value == null ? "" : String(value);
  const escaped = v.replace(/"/g, '""');
  return `"${escaped}"`;
}

/* UI paginación numerada */
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

export default function ContactsAllList() {
  // rol global para saber si es admin
  const roleQuery = useQuery({
    queryKey: ["tenants-role"],
    queryFn: () => api.get("/tenants/role"),
  });
  const roleData = roleQuery.data as any;
  const role: string | undefined = roleData?.role;
  const isAdmin = role === "admin" || role === "owner";

  // aquí usamos listAllContacts
  const q = useQuery({
    queryKey: ["contacts-all"],
    queryFn: listAllContacts,
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

  // blindaje: q.data a veces puede venir como objeto
  const data = useMemo(() => {
    const d: any = q.data;

    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.rows)) return d.rows;

    return [];
  }, [q.data]);

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
    // 1) filtro por cargo
    const byPos =
      activePos === "Todos"
        ? data
        : data.filter((c: any) => positionKey(c) === activePos);

    // 2) filtro por search
    const bySearch = search
      ? byPos.filter((c: any) => matchesContact(search, c))
      : byPos;

    // 3) agrupar por persona para no duplicar en UI (misma lógica tuya)
    const map = new Map<string, any>();

    for (const c of bySearch as any[]) {
      const key =
        normalize(c.name || "") +
        "|" +
        (c.email || "").toLowerCase() +
        "|" +
        (c.phone || "").trim();

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          ...c,
          tenant_count: 1,
        });
      } else {
        existing.tenant_count = (existing.tenant_count || 1) + 1;
      }
    }

    const arr = Array.from(map.values());

    // 4) ordenar
    return arr.sort((a: any, b: any) =>
      (a?.name ?? "").localeCompare(b?.name ?? "", "es", {
        sensitivity: "base",
      })
    );
  }, [data, activePos, search]);

  // si cambia filtro o búsqueda => página 1
  const key = useMemo(() => `${activePos}__${normalize(search)}`, [activePos, search]);
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

  // Backup de TODOS los contactos (solo admin/owner)
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
        "tenant_id",
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
            c.tenant_id,
          ]
            .map(csvEscape)
            .join(",")
        );
      }

      const csv = rows.join("\r\n");

      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `contacts-backup-${new Date()
          .toISOString()
          .slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
      } else {
        Alert.alert(
          "Backup disponible en web",
          "Por ahora el archivo de backup se puede descargar desde la versión web."
        );
      }

      const maxCreated = data.reduce((max: number, c: any) => {
        const v = c.created_at ? Number(c.created_at) : 0;
        return v > max ? v : max;
      }, 0);
      const toStore = maxCreated || Date.now();
      await AsyncStorage.setItem(EXPORT_TS_KEY, String(toStore));

      Alert.alert("Backup generado", "Se ha generado el archivo de contactos.");
    } catch (e: any) {
      console.error("Error generando backup:", e);
      Alert.alert(
        "Error",
        String(e?.message ?? "No se pudo generar el backup de contactos.")
      );
    }
  }, [isAdmin, data]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Contactos (todos)",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
      <View style={styles.screen}>
        {/* acciones */}
        <View style={styles.headerRow}>
          <Link href="/contacts" asChild>
            <Pressable
              style={({ pressed }) => [
                styles.backBtn,
                pressed && { opacity: 0.92 },
              ]}
            >
              <Text style={styles.backBtnText}>← Workspace actual</Text>
            </Pressable>
          </Link>

          {isAdmin && (
            <Pressable
              onPress={handleBackupPress}
              style={({ pressed }) => [
                styles.exportBtn,
                pressed && { opacity: 0.92 },
              ]}
            >
              <Text style={styles.exportBtnText}>Backup</Text>
            </Pressable>
          )}
        </View>

        {/* buscador */}
        <View style={styles.searchWrap}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nombre, empresa, email o teléfono"
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

        {/* ✅ dropdown (igual que /contacts) */}
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

        {/* estados */}
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
              onPress={() => q.refetch()}
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
            {/* resumen paginación */}
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

                        {item.tenant_count > 1 && (
                          <Text style={styles.wsTag} numberOfLines={1}>
                            · {item.tenant_count} WS
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

            {/* controles numerados */}
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

  backBtn: {
    backgroundColor: "transparent",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  backBtnText: { color: TEXT, fontWeight: "700", fontSize: 13 },

  exportBtn: {
    backgroundColor: "transparent",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.9)",
  },
  exportBtnText: { color: "#e0f2fe", fontWeight: "700", fontSize: 13 },

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
  wsTag: {
    color: ACCENT_2,
    fontSize: 11,
    fontWeight: "700",
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

