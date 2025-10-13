import { listContacts } from "@/src/api/contacts";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import { useCallback } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

export default function ContactsList() {
  const q = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
  const onRefresh = useCallback(() => q.refetch(), [q]);

  return (
    <>
      <Stack.Screen options={{ title: "Contactos" }} />
      <View style={styles.container}>
        <Link href="/contacts/new" style={styles.newBtn}>+ Nuevo Contacto</Link>

        <FlatList
          data={q.data ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={{ opacity: 0.7 }}>Sin contactos aún</Text>}
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
  container: { flex: 1, padding: 16, gap: 12 },
  newBtn: { alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#1e90ff", color: "#fff", borderRadius: 8 },
  row: { padding: 12, borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  name: { fontSize: 16, fontWeight: "600" },
  sub: { opacity: 0.7 },
});
