import { listAccountsPaged } from "@/src/api/accounts";
import type { InfiniteData } from "@tanstack/react-query";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
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

const BG = "#0e0e0f";
const CARD = "#151517";
const BORDER = "#2a2a2c";
const TEXT = "#f3f4f6";
const SUBTLE = "rgba(255,255,255,0.7)";
const ORANGE = "#FF6A00";

type Account = {
  id: string;
  name: string;
  website?: string | null;
  phone?: string | null;
};
type AccountsPage = { items: Account[]; nextCursor: string | null };

export default function AccountsList() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  // debounce simple
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeText = (v: string) => {
    setSearch(v);
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setQ(v.trim()), 350);
  };

  const qInf = useInfiniteQuery<
    AccountsPage,
    Error,
    AccountsPage,
    readonly ["accounts.list", string],
    string | null
  >({
    queryKey: ["accounts.list", q] as const,
    queryFn: ({ pageParam }) =>
      listAccountsPaged({
        q,
        cursor: (pageParam as string | null) ?? null,
        limit: 20,
      }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

const pages =
  (qInf.data as InfiniteData<AccountsPage> | undefined)?.pages ?? [];

const data = useMemo(
  () =>
    pages
      .flatMap((p) => p?.items ?? [])   // 👈 si p.items viene undefined, usa []
      .filter(Boolean),                 // 👈 quita posibles null/undefined
  [pages]
);


  const onRefresh = useCallback(() => qInf.refetch(), [qInf]);
  const loadMore = useCallback(() => {
    if (qInf.hasNextPage && !qInf.isFetchingNextPage) {
      qInf.fetchNextPage();
    }
  }, [qInf.hasNextPage, qInf.isFetchingNextPage]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Cuentas",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT },
        }}
      />
      <View style={styles.screen}>
        {/* Buscar + Nueva */}
        <View style={styles.topRow}>
          <TextInput
            placeholder="Buscar cuentas…"
            placeholderTextColor={SUBTLE}
            style={styles.input}
            value={search}
            onChangeText={onChangeText}
          />
          <Link href="/accounts/new" asChild>
            <Pressable
              style={styles.newBtn}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.newBtnText}>＋ Nueva</Text>
            </Pressable>
          </Link>
        </View>

        {qInf.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : qInf.isError ? (
          <Text style={{ color: "#fecaca" }}>
            Error: {String((qInf.error as any)?.message || qInf.error)}
          </Text>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={qInf.isFetching && !qInf.isFetchingNextPage}
                onRefresh={onRefresh}
              />
            }
            ListEmptyComponent={
              <Text style={{ color: SUBTLE }}>Sin cuentas</Text>
            }
            renderItem={({ item }) => (
              <Link
                href={{ pathname: "/accounts/[id]", params: { id: item.id } }}
                asChild
              >
                <Pressable
                  style={styles.row}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.sub}>
                      {item.website ?? item.phone ?? ""}
                    </Text>
                  </View>
                </Pressable>
              </Link>
            )}
            onEndReachedThreshold={0.35}
            onEndReached={loadMore}
            ListFooterComponent={
              qInf.isFetchingNextPage ? (
                <View style={{ paddingVertical: 12 }}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null
            }
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },
  topRow: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    color: TEXT,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  newBtn: {
    backgroundColor: ORANGE,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  newBtnText: { color: "#fff", fontWeight: "900" },

  row: {
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    backgroundColor: CARD,
  },
  name: { fontSize: 16, fontWeight: "700", color: TEXT },
  sub: { color: SUBTLE },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});


// import { listAccounts } from "@/src/api/accounts";
// import { useQuery } from "@tanstack/react-query";
// import { Link, Stack } from "expo-router";
// import { useCallback } from "react";
// import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

// // 🎨 Tema
// const ORANGE = "#FF6A00";
// const BG = "#0e0e0f";
// const CARD = "#151517";
// const BORDER = "#2a2a2c";
// const TEXT = "#f3f4f6";
// const SUBTLE = "rgba(255,255,255,0.7)";

// export default function AccountsList() {
//   const q = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
//   const onRefresh = useCallback(() => q.refetch(), [q]);

//   return (
//     <>
//       <Stack.Screen options={{ title: "Cuentas" }} />
//       <View style={styles.screen}>
//         <View style={styles.headerRow}>
//           <Link href="/accounts/new" asChild>
//             <Pressable style={styles.newBtn}>
//               <Text style={styles.newBtnText}>+ Nueva Cuenta</Text>
//             </Pressable>
//           </Link>
//         </View>

//         <FlatList
//           contentContainerStyle={styles.listContainer}
//           data={q.data ?? []}
//           keyExtractor={(item) => item.id}
//           refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={onRefresh} />}
//           ListEmptyComponent={<Text style={styles.subtle}>Sin cuentas aún</Text>}
//           renderItem={({ item }) => (
//             <Link href={{ pathname: "/accounts/[id]", params: { id: item.id } }} asChild>
//               <Pressable style={styles.row}>
//                 <View style={{ flex: 1 }}>
//                   <Text style={styles.name}>{item.name}</Text>
//                   <Text style={styles.sub}>{item.website ?? item.phone ?? ""}</Text>
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
//   screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },
//   headerRow: { flexDirection: "row", justifyContent: "flex-start" },
//   listContainer: { gap: 10 },

//   newBtn: { backgroundColor: ORANGE, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
//   newBtnText: { color: "#fff", fontWeight: "900" },

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
//   name: { fontSize: 16, fontWeight: "800", color: TEXT },
//   sub: { color: SUBTLE },
//   subtle: { color: SUBTLE, textAlign: "center", marginTop: 8 },
// });


// import { listAccounts } from "@/src/api/accounts";
// import { useQuery } from "@tanstack/react-query";
// import { Link, Stack } from "expo-router";
// import { useCallback } from "react";
// import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

// export default function AccountsList() {
//   const q = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
//   const onRefresh = useCallback(() => q.refetch(), [q]);

//   return (
//     <>
//       <Stack.Screen options={{ title: "Cuentas" }} />
//       <View style={styles.container}>
//         <Link href="/accounts/new" style={styles.newBtn}>+ Nueva Cuenta</Link>

//         {q.isLoading ? (
//           <Text style={{opacity:0.7}}>Cargando...</Text>
//         ) : q.isError ? (
//           <Text style={{color:"crimson"}}>Error: {String((q.error as any)?.message || q.error)}</Text>
//         ) : (
//           <FlatList
//             data={q.data ?? []}
//             keyExtractor={(item) => item.id}
//             refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={onRefresh} />}
//             ListEmptyComponent={<Text style={{opacity:0.7}}>Sin cuentas aún</Text>}
//             renderItem={({ item }) => (
//               <Link href={{ pathname: "/accounts/[id]", params: { id: item.id } }} asChild>
//                 <Pressable style={styles.row}>
//                   <View style={{flex:1}}>
//                     <Text style={styles.name}>{item.name}</Text>
//                     <Text style={styles.sub}>{item.website ?? item.phone ?? ""}</Text>
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
//   container:{flex:1,padding:16,gap:12},
//   newBtn:{alignSelf:"flex-start",paddingVertical:8,paddingHorizontal:12,backgroundColor:"#1e90ff",color:"#fff",borderRadius:8},
//   row:{padding:12,borderWidth:1,borderColor:"#e5e5e5",borderRadius:10,flexDirection:"row",alignItems:"center",gap:8,marginBottom:10},
//   name:{fontSize:16,fontWeight:"600"},
//   sub:{opacity:0.7},
// });
