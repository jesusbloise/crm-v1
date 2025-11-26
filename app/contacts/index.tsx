// app/contacts/index.tsx

import { listContacts } from "@/src/api/contacts";
import { api } from "@/src/api/http";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/* 🎨 Tema consistente */
const BG = "#0b0c10";
const CARD = "#14151a";
const BORDER = "#272a33";
const FIELD = "#121318";
const TEXT = "#e8ecf1";
const SUBTLE = "#a9b0bd";
const ACCENT = "#7c3aed"; // morado
const ACCENT_2 = "#22d3ee"; // cian (detalles pequeños)

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

export default function ContactsList() {
  // 🔐 Traemos rol GLOBAL desde /tenants/role
  const roleQuery = useQuery({
    queryKey: ["tenants-role"],
    queryFn: () => api.get("/tenants/role"),
  });

  const roleData = roleQuery.data as any;
  const role: string | undefined = roleData?.role;
  const isAdmin = role === "admin" || role === "owner";

  // 👇 Lista normal de contactos (vista por workspace como ya la tenías)
  const q = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
  const onRefresh = useCallback(() => {
    q.refetch();
    roleQuery.refetch();
  }, [q, roleQuery]);

  const [search, setSearch] = useState("");
  const [activePos, setActivePos] = useState<string>("Todos");

  const data = q.data ?? [];

  // pestañas
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
        {/* Acciones: nuevo contacto + (si es admin) ver todos */}
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

          {/* 👇 Solo admins / owners ven este botón */}
          {isAdmin && (
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
                    {/* Nombre + Creador en la misma línea */}
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

  // Botón nuevo (morado)
  newBtn: {
    backgroundColor: ACCENT,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  newBtnText: { color: "#fff", fontWeight: "900" },

  // Botón "Ver todos" (solo admin)
  secondaryBtn: {
    backgroundColor: "transparent",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  secondaryBtnText: { color: TEXT, fontWeight: "700", fontSize: 13 },

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


// // app/contacts/index.tsx

// import { listContacts } from "@/src/api/contacts";
// import { useQuery } from "@tanstack/react-query";
// import { Link, Stack } from "expo-router";
// import { useCallback, useMemo, useState } from "react";
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

// /* 🎨 Tema consistente (Home/Board/New) */
// const BG       = "#0b0c10";
// const CARD     = "#14151a";
// const BORDER   = "#272a33";
// const FIELD    = "#121318";
// const TEXT     = "#e8ecf1";
// const SUBTLE   = "#a9b0bd";
// const ACCENT   = "#7c3aed";   // morado
// const ACCENT_2 = "#22d3ee";   // cian (detalles pequeños)

// function strip(s?: string) { return (s ?? "").trim(); }
// function normalize(s?: string) {
//   return strip(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
// }
// function matchesContact(term: string, c: any) {
//   if (!term) return true;
//   const hay = `${c?.name ?? ""} ${c?.email ?? ""} ${c?.phone ?? ""} ${c?.company ?? ""} ${c?.position ?? ""}`;
//   const n = normalize(hay);
//   return term.split(/\s+/).filter(Boolean).every((t) => n.includes(normalize(t)));
// }
// function positionKey(c: any) { return strip(c?.position) || "Sin cargo"; }

// export default function ContactsList() {
//   const q = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
//   const onRefresh = useCallback(() => q.refetch(), [q]);

//   const [search, setSearch] = useState("");
//   const [activePos, setActivePos] = useState<string>("Todos");

//   const data = q.data ?? [];

//   // pestañas
//   const tabs = useMemo(() => {
//     const counts = new Map<string, number>();
//     for (const c of data) counts.set(positionKey(c), (counts.get(positionKey(c)) ?? 0) + 1);
//     const entries = Array.from(counts.entries()).sort(([a],[b]) => a.localeCompare(b,"es",{sensitivity:"base"}));
//     return [{ label: "Todos", count: data.length }, ...entries.map(([label,count])=>({label,count}))];
//   }, [data]);

//   const filtered = useMemo(() => {
//     const byTab = activePos === "Todos" ? data : data.filter((c:any)=> positionKey(c) === activePos);
//     const bySearch = search ? byTab.filter((c:any)=> matchesContact(search,c)) : byTab;
//     return [...bySearch].sort((a:any,b:any)=>(a?.name ?? "").localeCompare(b?.name ?? "","es",{sensitivity:"base"}));
//   }, [data, activePos, search]);

//   const errorMsg = (q.error as any)?.message || "";

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
//         {/* Acciones */}
//         <View style={styles.headerRow}>
//           <Link href="/contacts/new" asChild>
//             <Pressable style={({pressed})=>[styles.newBtn, pressed && {opacity:0.92}]}>
//               <Text style={styles.newBtnText}>+ Nuevo Contacto</Text>
//             </Pressable>
//           </Link>
//         </View>

//         {/* Buscador */}
//         <View style={styles.searchWrap}>
//           <TextInput
//             value={search}
//             onChangeText={setSearch}
//             placeholder="Buscar por nombre, empresa, email o teléfono"
//             placeholderTextColor={SUBTLE}
//             style={styles.searchInput}
//             returnKeyType="search"
//             onSubmitEditing={() => setSearch((s) => s.trim())}
//           />
//           {search.length > 0 && (
//             <Pressable onPress={() => setSearch("")} style={styles.clearBtn} hitSlop={8}>
//               <Text style={styles.clearText}>×</Text>
//             </Pressable>
//           )}
//         </View>

//         {/* Pestañas — micro chips */}
//         <View style={styles.tabsFlow}>
//           {tabs.map((t) => {
//             const active = activePos === t.label;
//             return (
//               <Pressable
//                 key={t.label}
//                 onPress={() => setActivePos(t.label)}
//                 style={({ pressed }) => [
//                   styles.tabChip,
//                   active && styles.tabChipActive,
//                   pressed && !active && styles.tabChipPressed,
//                 ]}
//                 hitSlop={8}
//               >
//                 <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
//                   {t.label}
//                 </Text>
                
//                 <View style={[styles.badge, active && styles.badgeActive]}>
//                   <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{t.count}</Text>
//                 </View>
//               </Pressable>
//             );
//           })}
//         </View>

//         {/* Estados: cargando / error / lista */}
//         {q.isLoading ? (
//           <View style={styles.loaderWrap}>
//             <ActivityIndicator />
//             <Text style={styles.loaderText}>Cargando contactos…</Text>
//           </View>
//         ) : q.isError ? (
//           <View style={styles.errorWrap}>
//             <Text style={styles.errorTitle}>No se pudieron cargar los contactos</Text>
//             {!!errorMsg && <Text style={styles.errorSub}>{errorMsg}</Text>}
//             <Pressable onPress={() => q.refetch()} style={({pressed})=>[styles.retryBtn, pressed && {opacity:0.92}]}>
//               <Text style={styles.retryText}>Reintentar</Text>
//             </Pressable>
//           </View>
//         ) : (
//           <FlatList
//             contentContainerStyle={[styles.listContainer, filtered.length === 0 && { flex: 1 }]}
//             data={filtered}
//             keyExtractor={(item: any) => item.id}
//             refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={onRefresh} />}
//             ListEmptyComponent={
//               <View style={{ alignItems: "center", marginTop: 8 }}>
//                 {data.length === 0 ? (
//                   <Text style={styles.subtle}>Sin contactos aún</Text>
//                 ) : (
//                   <Text style={styles.subtle}>No hay resultados para “{search.trim()}”</Text>
//                 )}
//               </View>
//             }
//             renderItem={({ item }: any) => (
//               <Link href={{ pathname: "/contacts/[id]", params: { id: item.id } }} asChild>
//                 <Pressable style={({pressed})=>[styles.row, pressed && {opacity:0.96}]}>
//                   <View style={{ flex: 1 }}>
//                     {/* Nombre + Creador en la misma línea */}
//                     <View style={styles.nameRow}>
//                       <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
//                       {item.created_by_name && (
//                         <Text style={styles.creator} numberOfLines={1}>
//                           · {item.created_by_name}
//                         </Text>
//                       )}
//                     </View>
//                     <Text style={styles.sub}>
//                       {strip(item.position) || strip(item.company) || strip(item.email) || ""}
//                     </Text>
//                   </View>
//                 </Pressable>
//               </Link>
//             )}
//           />
//         )}
//       </View>
//     </>
//   );
// }

// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG, padding: 16 },
//   headerRow: { flexDirection: "row", justifyContent: "flex-start", marginBottom: 10 },

//   // Botón nuevo (morado)
//   newBtn: {
//     backgroundColor: ACCENT,
//     paddingVertical: 10,
//     paddingHorizontal: 14,
//     borderRadius: 12,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.16)",
//   },
//   newBtnText: { color: "#fff", fontWeight: "900" },

//   // Buscador
//   searchWrap: {
//     position: "relative",
//     backgroundColor: FIELD,
//     borderColor: BORDER,
//     borderWidth: 1,
//     borderRadius: 12,
//     marginBottom: 6,
//   },
//   searchInput: { paddingVertical: 10, paddingHorizontal: 14, color: TEXT, fontSize: 14 },
//   clearBtn: {
//     position: "absolute", right: 8, top: 8, width: 28, height: 28,
//     borderRadius: 14, alignItems: "center", justifyContent: "center",
//     backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
//   },
//   clearText: { color: TEXT, fontSize: 18, lineHeight: 18, fontWeight: "700" },

//   // Tabs micro
//   tabsFlow: {
//     flexDirection: "row",
//     flexWrap: "wrap",
//     columnGap: 6,
//     rowGap: 6,
//     marginTop: 0,
//     marginBottom: 0,
//   },
//   tabChip: {
//     flexDirection: "row",
//     alignItems: "center",
//     borderWidth: 1,
//     borderColor: "#232326",
//     backgroundColor: "rgba(255,255,255,0.04)",
//     borderRadius: 13,
//     paddingVertical: 3,
//     paddingHorizontal: 8,
//     minHeight: 26,
//   },
//   tabChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
//   tabChipPressed: { opacity: 0.9 },
//   tabText: {
//     color: "rgba(243,244,246,0.9)",
//     fontWeight: "700",
//     fontSize: 11,
//     letterSpacing: 0.1,
//     maxWidth: 120,
//   },
//   tabTextActive: { color: "#fff" },
//   badge: {
//     marginLeft: 6,
//     width: 16,
//     height: 16,
//     borderRadius: 8,
//     alignItems: "center",
//     justifyContent: "center",
//     backgroundColor: "rgba(255,255,255,0.08)",
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.10)",
//   },
//   badgeActive: { backgroundColor: "rgba(0,0,0,0.18)", borderColor: "rgba(0,0,0,0.28)" },
//   badgeText: { fontSize: 10, fontWeight: "800", color: "rgba(243,244,246,0.9)", lineHeight: 12 },
//   badgeTextActive: { color: "#fff" },

//   // Lista / states
//   listContainer: { gap: 10 },
//   row: {
//     backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12,
//     padding: 12, flexDirection: "row", alignItems: "center", gap: 8,
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

//   loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
//   loaderText: { color: SUBTLE, marginTop: 8 },

//   errorWrap: { alignItems: "center", paddingVertical: 24, gap: 8 },
//   errorTitle: { color: "#fecaca", fontWeight: "800" },
//   errorSub: { color: "#9ca3af", fontSize: 12, textAlign: "center", paddingHorizontal: 12 },
//   retryBtn: {
//     marginTop: 6, backgroundColor: ACCENT, paddingHorizontal: 14, paddingVertical: 10,
//     borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)",
//   },
//   retryText: { color: "#fff", fontWeight: "900" },
// });

