import { listContacts } from "@/src/api/contacts";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import { useCallback } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

// 🎨 Tema
const ORANGE = "#FF6A00";
const BG = "#0e0e0f";
const CARD = "#151517";
const BORDER = "#2a2a2c";
const TEXT = "#f3f4f6";
const SUBTLE = "rgba(255,255,255,0.7)";

export default function ContactsList() {
  const q = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
  const onRefresh = useCallback(() => q.refetch(), [q]);

  return (
    <>
      <Stack.Screen options={{ title: "Contactos" }} />
      <View style={styles.screen}>
        <View style={styles.headerRow}>
          <Link href="/contacts/new" asChild>
            <Pressable style={styles.newBtn}>
              <Text style={styles.newBtnText}>+ Nuevo Contacto</Text>
            </Pressable>
          </Link>
        </View>

        <FlatList
          contentContainerStyle={styles.listContainer}
          data={q.data ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.subtle}>Sin contactos aún</Text>}
          renderItem={({ item }) => (
            <Link href={{ pathname: "/contacts/[id]", params: { id: item.id } }} asChild>
              <Pressable style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.sub}>{item.company ?? item.position ?? item.email ?? ""}</Text>
                </View>
              </Pressable>
            </Link>
          )}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },
  headerRow: { flexDirection: "row", justifyContent: "flex-start" },
  listContainer: { gap: 10 },

  newBtn: { backgroundColor: ORANGE, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  newBtnText: { color: "#fff", fontWeight: "900" },

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
  name: { fontSize: 16, fontWeight: "800", color: TEXT },
  sub: { color: SUBTLE },
  subtle: { color: SUBTLE, textAlign: "center", marginTop: 8 },
});


// import { listContacts } from "@/src/api/contacts";
// import { useQuery } from "@tanstack/react-query";
// import { Link, Stack } from "expo-router";
// import { useCallback } from "react";
// import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

// export default function ContactsList() {
//   const q = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
//   const onRefresh = useCallback(() => q.refetch(), [q]);

//   return (
//     <>
//       <Stack.Screen options={{ title: "Contactos" }} />
//       <View style={styles.container}>
//         <Link href="/contacts/new" style={styles.newBtn}>+ Nuevo Contacto</Link>

//         <FlatList
//           data={q.data ?? []}
//           keyExtractor={(item) => item.id}
//           refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={onRefresh} />}
//           ListEmptyComponent={<Text style={{ opacity: 0.7 }}>Sin contactos aún</Text>}
//           renderItem={({ item }) => (
//             <Link href={{ pathname: "/contacts/[id]", params: { id: item.id } }} asChild>
//               <Pressable style={styles.row}>
//                 <View style={{ flex: 1 }}>
//                   <Text style={styles.name}>{item.name}</Text>
//                   <Text style={styles.sub}>{item.company ?? item.position ?? item.email ?? ""}</Text>
//                 </View>
//               </Pressable>
//             </Link>
//           )}
//         />
//       </View>
//     </>
//   );
// }
// const styles = StyleSheet.create({
//   container: { flex: 1, padding: 16, gap: 12 },
//   newBtn: { alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#1e90ff", color: "#fff", borderRadius: 8 },
//   row: { padding: 12, borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
//   name: { fontSize: 16, fontWeight: "600" },
//   sub: { opacity: 0.7 },
// });
