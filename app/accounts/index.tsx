// app/accounts/index.tsx
import { listAccountsPaged, type Account, type AccountsPage } from "@/src/api/accounts";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
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

/* 🎨 Tema consistente con Home */
const BG       = "#0F1115";
const CARD     = "#171923";
const BORDER   = "#2B3140";
const TEXT     = "#F3F4F6";
const SUBTLE   = "#A4ADBD";
const PRIMARY  = "#7C3AED"; // morado

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
    getNextPageParam: (last) => last?.nextCursor ?? undefined,
  });

  const pages = (qInf.data as InfiniteData<AccountsPage> | undefined)?.pages ?? [];
  const data: Account[] = useMemo(
    () => pages.flatMap((p) => p?.items ?? []).filter(Boolean),
    [pages]
  );

  const onRefresh = useCallback(() => qInf.refetch(), [qInf]);
  const loadMore = useCallback(() => {
    if (qInf.hasNextPage && !qInf.isFetchingNextPage) qInf.fetchNextPage();
  }, [qInf.hasNextPage, qInf.isFetchingNextPage]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Cuentas",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
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
            returnKeyType="search"
          />
          <Link href="/accounts/new" asChild>
            <Pressable style={styles.newBtn} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.newBtnText}>＋ Nueva</Text>
            </Pressable>
          </Link>
        </View>

        {qInf.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : qInf.isError ? (
          <View style={{ alignItems: "center", gap: 8 }}>
            <Text style={{ color: "#fecaca", fontWeight: "800" }}>
              Error listando cuentas
            </Text>
            <Text style={{ color: SUBTLE, fontSize: 12 }}>
              {String((qInf.error as any)?.message || qInf.error)}
            </Text>
            <Pressable onPress={() => qInf.refetch()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
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
              <Text style={{ color: SUBTLE, textAlign: "center", marginTop: 10 }}>
                Sin cuentas
              </Text>
            }
            renderItem={({ item }) => (
              <Link
                href={{ pathname: "/accounts/[id]", params: { id: item.id } }}
                asChild
              >
                <Pressable style={styles.row} accessibilityRole="button" hitSlop={8}>
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
                  <ActivityIndicator />
                </View>
              ) : null
            }
            contentContainerStyle={{ paddingBottom: 16 }}
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
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  newBtnText: { color: "#fff", fontWeight: "900" },
  row: {
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    backgroundColor: CARD,
  },
  name: { fontSize: 16, fontWeight: "800", color: TEXT },
  sub: { color: SUBTLE },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  retryBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  retryText: { color: "#fff", fontWeight: "900" },
});

