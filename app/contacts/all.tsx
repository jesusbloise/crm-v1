// app/contacts/all.tsx
import { listAllContacts } from "@/src/api/contacts";
import { api } from "@/src/api/http";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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

/* 🎨 Tema consistente (igual que index) */
const BG = "#0b0c10";
const CARD = "#14151a";
const BORDER = "#272a33";
const FIELD = "#121318";
const TEXT = "#e8ecf1";
const SUBTLE = "#a9b0bd";
const ACCENT = "#7c3aed";   // morado
const ACCENT_2 = "#22d3ee"; // cian (detalles pequeños)

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

export default function ContactsAllList() {
  // 🔐 rol global para saber si es admin
  const roleQuery = useQuery({
    queryKey: ["tenants-role"],
    queryFn: () => api.get("/tenants/role"),
  });
  const roleData = roleQuery.data as any;
  const role: string | undefined = roleData?.role;
  const isAdmin = role === "admin" || role === "owner";

  // 👇 OJO: aquí usamos listAllContacts, no listContacts
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

  const data = q.data ?? [];

  const tabs = useMemo(() => {
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
    const byTab =
      activePos === "Todos"
        ? data
        : data.filter((c: any) => positionKey(c) === activePos);
    const bySearch = search
      ? byTab.filter((c: any) => matchesContact(search, c))
      : byTab;
    return [...bySearch].sort((a: any, b: any) =>
      (a?.name ?? "").localeCompare(b?.name ?? "", "es", {
        sensitivity: "base",
      })
    );
  }, [data, activePos, search]);

  const errorMsg = (q.error as any)?.message || "";

  // 🔄 Backup de TODOS los contactos (solo admin/owner)
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

      // 👉 ya no bloqueamos por último backup
      // igual podemos seguir guardando la marca de tiempo solo informativa

      // construimos CSV desde data
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

      // 👉 ahora solo marcamos la fecha del último backup, pero no bloquea
      const maxCreated = data.reduce((max: number, c: any) => {
        const v = c.created_at ? Number(c.created_at) : 0;
        return v > max ? v : max;
      }, 0);
      const toStore = maxCreated || Date.now();
      await AsyncStorage.setItem(EXPORT_TS_KEY, String(toStore));

      Alert.alert(
        "Backup generado",
        "Se ha generado el archivo de contactos."
      );
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
        {/* Acciones: volver a la vista normal + backup (solo admin) */}
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

        {/* Buscador */}
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

        {/* Pestañas — micro chips */}
        <View style={styles.tabsFlow}>
          {tabs.map((t) => {
            const active = activePos === t.label;
            return (
              <Pressable
                key={t.label}
                onPress={() => setActivePos(t.label)}
                style={({ pressed }) => [
                  styles.tabChip,
                  active && styles.tabChipActive,
                  pressed && !active && styles.tabChipPressed,
                ]}
                hitSlop={8}
              >
                <Text
                  style={[styles.tabText, active && styles.tabTextActive]}
                  numberOfLines={1}
                >
                  {t.label}
                </Text>

                <View style={[styles.badge, active && styles.badgeActive]}>
                  <Text
                    style={[
                      styles.badgeText,
                      active && styles.badgeTextActive,
                    ]}
                  >
                    {t.count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Estados: cargando / error / lista */}
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
          <FlatList
            contentContainerStyle={[
              styles.listContainer,
              filtered.length === 0 && { flex: 1 },
            ]}
            data={filtered}
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

  // Buscador
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

  // Tabs micro
  tabsFlow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 6,
    rowGap: 6,
    marginTop: 0,
    marginBottom: 0,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#232326",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 13,
    paddingVertical: 3,
    paddingHorizontal: 8,
    minHeight: 26,
  },
  tabChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  tabChipPressed: { opacity: 0.9 },
  tabText: {
    color: "rgba(243,244,246,0.9)",
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.1,
    maxWidth: 120,
  },
  tabTextActive: { color: "#fff" },
  badge: {
    marginLeft: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  badgeActive: {
    backgroundColor: "rgba(0,0,0,0.18)",
    borderColor: "rgba(0,0,0,0.28)",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(243,244,246,0.9)",
    lineHeight: 12,
  },
  badgeTextActive: { color: "#fff" },

  // Lista / states
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
});

