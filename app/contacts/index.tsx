import { listContacts } from "@/src/api/contacts";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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

const ORANGE = "#FF6A00";
const BG = "#0e0e0f";
const CARD = "#151517";
const BORDER = "#2a2a2c";
const TEXT = "#f3f4f6";
const SUBTLE = "rgba(255,255,255,0.7)";
const INPUT = "#1b1b1e";
const INPUT_BORDER = "#2a2a2c";

function strip(s?: string) { return (s ?? "").trim(); }
function normalize(s?: string) {
  return strip(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function matchesContact(term: string, c: any) {
  if (!term) return true;
  const hay = `${c?.name ?? ""} ${c?.email ?? ""} ${c?.phone ?? ""} ${c?.company ?? ""} ${c?.position ?? ""}`;
  const n = normalize(hay);
  return term.split(/\s+/).filter(Boolean).every((t) => n.includes(normalize(t)));
}
function positionKey(c: any) { return strip(c?.position) || "Sin cargo"; }

export default function ContactsList() {
  const q = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
  const onRefresh = useCallback(() => q.refetch(), [q]);

  const [search, setSearch] = useState("");
  const [activePos, setActivePos] = useState<string>("Todos");

  const data = q.data ?? [];

  // pestañas
  const tabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data) counts.set(positionKey(c), (counts.get(positionKey(c)) ?? 0) + 1);
    const entries = Array.from(counts.entries()).sort(([a],[b]) => a.localeCompare(b,"es",{sensitivity:"base"}));
    return [{ label: "Todos", count: data.length }, ...entries.map(([label,count])=>({label,count}))];
  }, [data]);

  const filtered = useMemo(() => {
    const byTab = activePos === "Todos" ? data : data.filter((c:any)=> positionKey(c) === activePos);
    const bySearch = search ? byTab.filter((c:any)=> matchesContact(search,c)) : byTab;
    return [...bySearch].sort((a:any,b:any)=>(a?.name ?? "").localeCompare(b?.name ?? "","es",{sensitivity:"base"}));
  }, [data, activePos, search]);

  const errorMsg = (q.error as any)?.message || "";

  return (
    <>
      <Stack.Screen options={{ title: "Contactos" }} />
      <View style={styles.screen}>
        {/* Acciones */}
        <View style={styles.headerRow}>
          <Link href="/contacts/new" asChild>
            <Pressable style={styles.newBtn}>
              <Text style={styles.newBtnText}>+ Nuevo Contacto</Text>
            </Pressable>
          </Link>
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
            <Pressable onPress={() => setSearch("")} style={styles.clearBtn} hitSlop={8}>
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          )}
        </View>

        {/* Pestañas — micro chips, sin márgenes verticales */}
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
                <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                  {t.label}
                </Text>
                <View style={[styles.badge, active && styles.badgeActive]}>
                  <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{t.count}</Text>
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
            <Text style={styles.errorTitle}>No se pudieron cargar los contactos</Text>
            {!!errorMsg && <Text style={styles.errorSub}>{errorMsg}</Text>}
            <Pressable onPress={() => q.refetch()} style={({pressed})=>[styles.retryBtn, pressed && {opacity:0.9}]}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={[styles.listContainer, filtered.length === 0 && { flex: 1 }]}
            data={filtered}
            keyExtractor={(item: any) => item.id}
            refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={{ alignItems: "center", marginTop: 8 }}>
                {data.length === 0 ? (
                  <Text style={styles.subtle}>Sin contactos aún</Text>
                ) : (
                  <Text style={styles.subtle}>No hay resultados para “{search.trim()}”</Text>
                )}
              </View>
            }
            renderItem={({ item }: any) => (
              <Link href={{ pathname: "/contacts/[id]", params: { id: item.id } }} asChild>
                <Pressable style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.sub}>
                      {strip(item.position) || strip(item.company) || strip(item.email) || ""}
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
  headerRow: { flexDirection: "row", justifyContent: "flex-start", marginBottom: 10 },

  // Botón nuevo
  newBtn: { backgroundColor: ORANGE, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  newBtnText: { color: "#fff", fontWeight: "900" },

  // Buscador
  searchWrap: {
    position: "relative",
    backgroundColor: INPUT,
    borderColor: INPUT_BORDER,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 6, // pega las tabs al buscador
  },
  searchInput: { paddingVertical: 10, paddingHorizontal: 14, color: TEXT, fontSize: 14 },
  clearBtn: {
    position: "absolute", right: 8, top: 8, width: 28, height: 28,
    borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: BORDER,
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
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 13,
    paddingVertical: 3,
    paddingHorizontal: 8,
    minHeight: 26,
  },
  tabChipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  tabChipPressed: { opacity: 0.9 },
  tabText: {
    color: "rgba(243,244,246,0.9)",
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.1,
    maxWidth: 120,
  },
  tabTextActive: { color: BG },
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
  badgeActive: { backgroundColor: "rgba(0,0,0,0.15)", borderColor: "rgba(0,0,0,0.25)" },
  badgeText: { fontSize: 10, fontWeight: "800", color: "rgba(243,244,246,0.9)", lineHeight: 12 },
  badgeTextActive: { color: "#fff" },

  // Lista / states
  listContainer: { gap: 10 },
  row: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    padding: 12, flexDirection: "row", alignItems: "center", gap: 8,
  },
  name: { fontSize: 16, fontWeight: "800", color: TEXT },
  sub: { color: SUBTLE },
  subtle: { color: SUBTLE, textAlign: "center", marginTop: 8 },

  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  loaderText: { color: SUBTLE, marginTop: 8 },

  errorWrap: { alignItems: "center", paddingVertical: 24, gap: 8 },
  errorTitle: { color: "#fecaca", fontWeight: "800" },
  errorSub: { color: "#9ca3af", fontSize: 12, textAlign: "center", paddingHorizontal: 12 },
  retryBtn: { marginTop: 6, backgroundColor: ORANGE, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: "#fff", fontWeight: "900" },
});


// import { listContacts } from "@/src/api/contacts";
// import { useQuery } from "@tanstack/react-query";
// import { Link, Stack } from "expo-router";
// import React, { useCallback, useMemo, useState } from "react";
// import {
//     ActivityIndicator,
//     FlatList,
//     Pressable,
//     RefreshControl,
//     ScrollView,
//     StyleSheet,
//     Text,
//     TextInput,
//     View
// } from "react-native";

// const ORANGE = "#FF6A00";
// const BG = "#0e0e0f";
// const CARD = "#151517";
// const BORDER = "#2a2a2c";
// const TEXT = "#f3f4f6";
// const SUBTLE = "rgba(255,255,255,0.7)";
// const INPUT = "#1b1b1e";
// const INPUT_BORDER = "#2a2a2c";

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

//   // mensaje de error para iOS (sin cambiar tu API)
//   const errorMsg = (q.error as any)?.message || "";

//   return (
//     <>
//       <Stack.Screen options={{ title: "Contactos" }} />
//       <View style={styles.screen}>
//         {/* Acciones */}
//         <View style={styles.headerRow}>
//           <Link href="/contacts/new" asChild>
//             <Pressable style={styles.newBtn}>
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

//         {/* Pestañas compactas */}
//         <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsWrap}>
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
//         </ScrollView>

//         {/* Estados: cargando / error / lista */}
//         {q.isLoading ? (
//           <View style={styles.loaderWrap}>
//             <ActivityIndicator />
//             <Text style={styles.loaderText}>Cargando contactos…</Text>
//           </View>
//         ) : q.isError ? (
//           <View style={styles.errorWrap}>
//             <Text style={styles.errorTitle}>No se pudieron cargar los contactos</Text>
//             {!!errorMsg && (
//               <Text style={styles.errorSub}>{errorMsg}</Text>
//             )}
//             <Pressable onPress={() => q.refetch()} style={({pressed})=>[styles.retryBtn, pressed && {opacity:0.9}]}>
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
//                 <Pressable style={styles.row}>
//                   <View style={{ flex: 1 }}>
//                     <Text style={styles.name}>{item.name}</Text>
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

//   // Botón nuevo
//   newBtn: { backgroundColor: ORANGE, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
//   newBtnText: { color: "#fff", fontWeight: "900" },

//   // Buscador
//   searchWrap: { position: "relative", backgroundColor: INPUT, borderColor: INPUT_BORDER, borderWidth: 1, borderRadius: 12 },
//   searchInput: { paddingVertical: 10, paddingHorizontal: 14, color: TEXT, fontSize: 14 },
//   clearBtn: { position: "absolute", right: 8, top: 8, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: BORDER },
//   clearText: { color: TEXT, fontSize: 18, lineHeight: 18, fontWeight: "700" },

//   // Pestañas
//   // Después
// tabsWrap: {
//   gap: 6,
//   paddingVertical: 0,
//   alignItems: "center",
//   marginTop: 0,        // 🔻 sin margen arriba
//   marginBottom: 0,     // 🔻 sin margen abajo
// },
// tabChip: {
//   flexDirection: "row",
//   alignItems: "center",
//   gap: 6,
//   backgroundColor: "rgba(255,255,255,0.03)",
//   borderColor: "#232326",
//   borderWidth: 1,
//   borderRadius: 999,
//   paddingVertical: 3,  // 🔻 un poco más fino
//   paddingHorizontal: 10,
//   marginRight: 6,
// },

//   tabChipPressed: { opacity: 0.85 },
//   tabChipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
//   tabText: { color: "rgba(243,244,246,0.9)", fontWeight: "700", fontSize: 12, letterSpacing: 0.2, maxWidth: 140 },
//   tabTextActive: { color: BG },
//   badge: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", minWidth: 18, alignItems: "center" },
//   badgeActive: { backgroundColor: "rgba(0,0,0,0.15)", borderColor: "rgba(0,0,0,0.25)" },
//   badgeText: { color: "rgba(243,244,246,0.9)", fontSize: 10, fontWeight: "800" },
//   badgeTextActive: { color: "#fff" },

//   // Lista / states
//   listContainer: { gap: 10 },
//   row: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
//   name: { fontSize: 16, fontWeight: "800", color: TEXT },
//   sub: { color: SUBTLE },
//   subtle: { color: SUBTLE, textAlign: "center", marginTop: 8 },

//   loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
//   loaderText: { color: SUBTLE, marginTop: 8 },

//   errorWrap: { alignItems: "center", paddingVertical: 24, gap: 8 },
//   errorTitle: { color: "#fecaca", fontWeight: "800" },
//   errorSub: { color: "#9ca3af", fontSize: 12, textAlign: "center", paddingHorizontal: 12 },
//   retryBtn: { marginTop: 6, backgroundColor: ORANGE, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
//   retryText: { color: "#fff", fontWeight: "900" },
// });

