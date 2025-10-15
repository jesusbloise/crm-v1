// app/leads/index.tsx
import { LeadStatus, listLeads } from "@/src/api/leads";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import React, { useCallback } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

/* 🎨 Paleta pro morado/cian */
const PRIMARY = "#7C3AED";  // morado acciones
const ACCENT  = "#22D3EE";  // cian detalles
const BG      = "#0F1115";  // fondo
const CARD    = "#171923";  // tarjetas
const BORDER  = "#2B3140";  // bordes
const TEXT    = "#F3F4F6";  // texto principal
const SUBTLE  = "#A4ADBD";  // subtítulos
const DANGER  = "#EF4444";  // rojo suave

export default function LeadsList() {
  const q = useQuery({ queryKey: ["leads"], queryFn: listLeads });
  const onRefresh = useCallback(() => q.refetch(), [q]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Prospectos",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
      <View style={styles.screen}>
        {/* Botón crear */}
        <View style={styles.headerRow}>
          <Link href="/leads/new" asChild>
            <Pressable style={({pressed})=>[styles.newBtn, pressed && {opacity:0.92}]} hitSlop={8}>
              <Text style={styles.newBtnText}>＋ Nuevo prospecto</Text>
            </Pressable>
          </Link>
        </View>

        <FlatList
          contentContainerStyle={[styles.listContainer, (q.data ?? []).length === 0 && { flex: 1 }]}
          data={q.data ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={q.isFetching} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <Text style={styles.subtle}>Sin prospectos aún</Text>
          }
          renderItem={({ item }) => (
            <Link href={`/leads/${item.id}`} asChild>
              <Pressable style={({pressed})=>[styles.row, pressed && {opacity:0.96}]} hitSlop={8}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  {!!item.company && <Text style={styles.sub}>{item.company}</Text>}
                </View>
                <Text style={[styles.badge, badgeByStatus((item.status ?? "nuevo") as LeadStatus)]}>
  {item.status ?? "nuevo"}
</Text>
              </Pressable>
            </Link>
          )}
        />
      </View>
    </>
  );
}

/* ——— UI helpers ——— */
function badgeByStatus(status?: string) {
  const base = {
    borderColor: "#2d3340",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: TEXT,
  };
  const s = (status || "nuevo").toLowerCase();
  if (s === "nuevo")      return { ...base, borderColor: PRIMARY, backgroundColor: "rgba(124,58,237,0.10)" };
  if (s === "contactado") return { ...base, borderColor: ACCENT,  backgroundColor: "rgba(34,211,238,0.10)" };
  if (s === "calificado") return { ...base, borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.12)" };
  if (s === "perdido")    return { ...base, borderColor: DANGER,   backgroundColor: "rgba(239,68,68,0.10)" };
  if (s === "en proceso") return { ...base, borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.10)" };
  return base;
}

/* ——— Estilos ——— */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },

  headerRow: { flexDirection: "row", justifyContent: "flex-start" },
  newBtn: {
    backgroundColor: PRIMARY,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  newBtnText: { color: "#fff", fontWeight: "900" },

  listContainer: { gap: 10 },

  row: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  name: { fontSize: 16, fontWeight: "800", color: TEXT },
  sub: { color: SUBTLE },

  // pill compacto y delicado
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: TEXT,
  } as any,

  subtle: { color: SUBTLE, textAlign: "center", marginTop: 8 },
});


// import { listLeads } from "@/src/api/leads";
// import { useQuery } from "@tanstack/react-query";
// import { Link, Stack } from "expo-router";
// import { useCallback } from "react";
// import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

// export default function LeadsList() {
//   const q = useQuery({ queryKey: ["leads"], queryFn: listLeads });

//   const onRefresh = useCallback(() => q.refetch(), [q]);

//   return (
//     <>
//       <Stack.Screen options={{ title: "Prospectos" }} />
//       <View style={styles.container}>
//         <Link href="/leads/new" style={styles.newBtn}>+ Nuevo Prospecto</Link>

//         <FlatList
//           data={q.data ?? []}
//           keyExtractor={(item) => item.id}
//           refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={onRefresh} />}
//           ListEmptyComponent={<Text style={{opacity:0.7}}>Sin Prospecto aún</Text>}
//           renderItem={({ item }) => (
//             <Link href={`/leads/${item.id}`} asChild>
//               <Pressable style={styles.row}>
//                 <View style={{flex:1}}>
//                   <Text style={styles.name}>{item.name}</Text>
//                   {item.company ? <Text style={styles.sub}>{item.company}</Text> : null}
//                 </View>
//                 <Text style={styles.status}>{item.status ?? "nuevo"}</Text>
//               </Pressable>
//             </Link>
//           )}
//         />
//       </View>
//     </>
//   );
// }

// const styles = StyleSheet.create({
//   container:{flex:1,padding:16,gap:12},
//   newBtn:{alignSelf:"flex-start",paddingVertical:8,paddingHorizontal:12,backgroundColor:"#1e90ff",color:"#fff",borderRadius:8},
//   row:{padding:12,borderWidth:1,borderColor:"#e5e5e5",borderRadius:10,flexDirection:"row",alignItems:"center",gap:8,marginBottom:10},
//   name:{fontSize:16,fontWeight:"600"},
//   sub:{opacity:0.7},
//   status:{fontWeight:"700"}
// });
