import { listAccounts } from "@/src/api/accounts";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import { useCallback } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

export default function AccountsList() {
  const q = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const onRefresh = useCallback(() => q.refetch(), [q]);

  return (
    <>
      <Stack.Screen options={{ title: "Cuentas" }} />
      <View style={styles.container}>
        <Link href="/accounts/new" style={styles.newBtn}>+ Nueva Cuenta</Link>

        {q.isLoading ? (
          <Text style={{opacity:0.7}}>Cargando...</Text>
        ) : q.isError ? (
          <Text style={{color:"crimson"}}>Error: {String((q.error as any)?.message || q.error)}</Text>
        ) : (
          <FlatList
            data={q.data ?? []}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={onRefresh} />}
            ListEmptyComponent={<Text style={{opacity:0.7}}>Sin cuentas aún</Text>}
            renderItem={({ item }) => (
              <Link href={{ pathname: "/accounts/[id]", params: { id: item.id } }} asChild>
                <Pressable style={styles.row}>
                  <View style={{flex:1}}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.sub}>{item.website ?? item.phone ?? ""}</Text>
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
  container:{flex:1,padding:16,gap:12},
  newBtn:{alignSelf:"flex-start",paddingVertical:8,paddingHorizontal:12,backgroundColor:"#1e90ff",color:"#fff",borderRadius:8},
  row:{padding:12,borderWidth:1,borderColor:"#e5e5e5",borderRadius:10,flexDirection:"row",alignItems:"center",gap:8,marginBottom:10},
  name:{fontSize:16,fontWeight:"600"},
  sub:{opacity:0.7},
});
