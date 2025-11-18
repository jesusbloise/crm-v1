// src/app/tasks/index.tsx
import { listActivities, type Activity } from "@/src/api/activities";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

/* 🎨 Paleta */
const BG = "#0F1115";
const CARD = "#171923";
const BORDER = "#2B3140";
const TEXT = "#F3F4F6";
const SUBTLE = "#A4ADBD";
const PRIMARY = "#7C3AED";
const SUCCESS = "#16a34a";

/* Maestro de completadas locales */
const MASTER_COMPLETED_KEY = "completedActivities:v1:all";

type Filter = "all" | "open" | "done" | "canceled";

type ActivityWithCreator = Activity & {
  created_by_name?: string | null;
  created_by_email?: string | null;
};

export default function TasksList() {
  const [filter, setFilter] = useState<Filter>("all");
  const [completedMaster, setCompletedMaster] = useState<Set<string>>(new Set());

  // 🔁 Carga inicial y en cada focus (por si marcaste en otra pantalla)
  const loadMaster = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MASTER_COMPLETED_KEY);
      setCompletedMaster(new Set<string>(raw ? JSON.parse(raw) : []));
    } catch {
      setCompletedMaster(new Set());
    }
  }, []);

  useEffect(() => {
    loadMaster();
  }, [loadMaster]);

  useFocusEffect(
    useCallback(() => {
      loadMaster();
    }, [loadMaster])
  );

  // 🔑 Trae TODAS las actividades
  const q = useQuery<ActivityWithCreator[]>({
    queryKey: ["activities-all"],
    queryFn: () => listActivities() as Promise<ActivityWithCreator[]>,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const onRefresh = useCallback(() => {
    loadMaster();
    q.refetch();
  }, [q, loadMaster]);

  const data = useMemo(() => {
    const items = (q.data ?? []).slice().sort(
      (a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0)
    );
    if (filter === "all") return items;
    return items.filter((a) => a.status === filter);
  }, [q.data, filter]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Actividades",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
      <View style={styles.screen}>
        {/* Filtros + Nueva */}
        <View style={styles.filters}>
          {(["all", "open", "done", "canceled"] as Filter[]).map((f) => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {labelFilter(f)}
                </Text>
              </Pressable>
            );
          })}

          <Link href="/tasks/new" asChild>
            <Pressable style={styles.newBtn} accessibilityRole="button">
              <Text style={styles.newBtnText}>＋ Nueva</Text>
            </Pressable>
          </Link>
        </View>

        {q.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={PRIMARY} />
            <Text style={styles.subtle}>Cargando actividades…</Text>
          </View>
        ) : q.isError ? (
          <Text style={{ color: "#fecaca" }}>
            Error: {String((q.error as any)?.message || q.error)}
          </Text>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={q.isFetching} onRefresh={onRefresh} />
            }
            ListEmptyComponent={<Text style={styles.subtle}>No hay actividades</Text>}
            renderItem={({ item }) => (
              <TaskCard item={item} completedMaster={completedMaster} />
            )}
            contentContainerStyle={{ gap: 10 }}
          />
        )}
      </View>
    </>
  );
}

function TaskCard({
  item,
  completedMaster,
}: {
  item: ActivityWithCreator;
  completedMaster: Set<string>;
}) {
  // ✅ Considera COMPLETADA si es done en backend O si está marcada localmente
  const isDoneUI = item.status === "done" || completedMaster.has(item.id);

  return (
    <Link href={{ pathname: "/tasks/[id]", params: { id: item.id } }} asChild>
      <Pressable accessibilityRole="link" hitSlop={8}>
        <View style={[styles.row, isDoneUI && styles.rowDone]}>
          <Text style={[styles.title, isDoneUI && styles.titleDone]} numberOfLines={2}>
            {iconByType(item.type)} {item.title}
          </Text>
          <Text style={[styles.sub, isDoneUI && styles.subDone]} numberOfLines={2}>
            {dateOrDash(item.due_date)} • {isDoneUI ? "Completada" : labelFilter(item.status as any)}
            {item.created_by_name ? ` • ${item.created_by_name}` : ""}
          </Text>
          {isDoneUI && (
            <View style={styles.badgeDone}>
              <Text style={styles.badgeDoneText}>✔ Tarea completada</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

function labelFilter(f: Filter) {
  switch (f) {
    case "all": return "Todas";
    case "open": return "Abiertas";
    case "done": return "Hechas";
    case "canceled": return "Canceladas";
  }
}

function iconByType(t: Activity["type"]) {
  if (t === "call") return "📞";
  if (t === "meeting") return "📅";
  if (t === "note") return "📝";
  return "✅";
}

function dateOrDash(ts?: number | null) {
  if (!ts) return "— sin fecha";
  return new Date(ts).toLocaleDateString();
}

/* Estilos */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },

  filters: { flexDirection: "row", gap: 8, alignItems: "center" },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#1a1b2a",
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: {
    backgroundColor: "rgba(124,58,237,0.20)",
    borderColor: PRIMARY,
  },
  chipText: { color: SUBTLE, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#E9D5FF" },

  newBtn: {
    marginLeft: "auto",
    backgroundColor: PRIMARY,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newBtnText: { color: "#fff", fontWeight: "900" },

  row: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
  },
  rowDone: {
    borderColor: SUCCESS,
    backgroundColor: "rgba(22,163,74,0.08)",
  },
  title: { color: TEXT, fontWeight: "800", fontSize: 15 },
  titleDone: { color: SUCCESS },
  sub: { color: SUBTLE, fontSize: 12, marginTop: 0 },
  subDone: { color: SUCCESS },
  subtle: { color: SUBTLE, textAlign: "center", marginTop: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },

  badgeDone: {
    alignSelf: "flex-start",
    marginTop: 2,
    backgroundColor: SUCCESS,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  badgeDoneText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.3,
  },
});



// import { listActivities, type Activity } from "@/src/api/activities";
// import { useQuery } from "@tanstack/react-query";
// import { Link, Stack } from "expo-router";
// import React, { useCallback, useMemo, useState } from "react";
// import {
//   ActivityIndicator,
//   FlatList,
//   Pressable,
//   RefreshControl,
//   StyleSheet,
//   Text,
//   View,
// } from "react-native";

// /* 🎨 Paleta consistente */
// const BG = "#0F1115";
// const CARD = "#171923";
// const BORDER = "#2B3140";
// const TEXT = "#F3F4F6";
// const SUBTLE = "#A4ADBD";
// const PRIMARY = "#7C3AED";

// type Filter = "all" | "open" | "done" | "canceled";

// export default function TasksList() {
//   const [filter, setFilter] = useState<Filter>("all");

//   const q = useQuery<Activity[]>({
//     queryKey: ["activities"],
//     queryFn: () => listActivities(),
//   });

//   const onRefresh = useCallback(() => q.refetch(), [q]);

//   const data = useMemo(() => {
//     const items = (q.data ?? []).slice().sort(
//       (a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0)
//     );
//     if (filter === "all") return items;
//     return items.filter((a) => a.status === filter);
//   }, [q.data, filter]);

//   return (
//     <>
//       <Stack.Screen
//         options={{
//           title: "Actividades",
//           headerStyle: { backgroundColor: BG },
//           headerTintColor: TEXT,
//           headerTitleStyle: { color: TEXT, fontWeight: "800" },
//         }}
//       />
//       <View style={styles.screen}>
//         {/* Filtros + Nueva */}
//         <View style={styles.filters}>
//           {(["all", "open", "done", "canceled"] as Filter[]).map((f) => {
//             const active = filter === f;
//             return (
//               <Pressable
//                 key={f}
//                 onPress={() => setFilter(f)}
//                 style={[styles.chip, active && styles.chipActive]}
//                 accessibilityRole="button"
//               >
//                 <Text style={[styles.chipText, active && styles.chipTextActive]}>
//                   {labelFilter(f)}
//                 </Text>
//               </Pressable>
//             );
//           })}

//           <Link href="/tasks/new" asChild>
//             <Pressable style={styles.newBtn} accessibilityRole="button">
//               <Text style={styles.newBtnText}>＋ Nueva</Text>
//             </Pressable>
//           </Link>
//         </View>

//         {q.isLoading ? (
//           <View style={styles.center}>
//             <ActivityIndicator />
//             <Text style={styles.subtle}>Cargando…</Text>
//           </View>
//         ) : q.isError ? (
//           <Text style={{ color: "#fecaca" }}>
//             Error: {String((q.error as any)?.message || q.error)}
//           </Text>
//         ) : (
//           <FlatList
//             data={data}
//             keyExtractor={(item) => item.id}
//             refreshControl={
//               <RefreshControl refreshing={q.isFetching} onRefresh={onRefresh} />
//             }
//             ListEmptyComponent={
//               <Text style={styles.subtle}>No hay actividades</Text>
//             }
//             renderItem={({ item }) => (
//               <Link
//                 href={{ pathname: "/tasks/[id]", params: { id: item.id } }}
//                 asChild
//               >
//                 <Pressable style={styles.row} accessibilityRole="link" hitSlop={8}>
//                   <View style={{ flex: 1 }}>
//                     <Text style={styles.title} numberOfLines={2}>
//                       {iconByType(item.type)} {item.title}
//                     </Text>
//                     <Text style={styles.sub} numberOfLines={1}>
//                       {dateOrDash(item.due_date)} • {item.status}
//                     </Text>
//                   </View>
//                 </Pressable>
//               </Link>
//             )}
//             contentContainerStyle={{ gap: 10 }}
//           />
//         )}
//       </View>
//     </>
//   );
// }

// function labelFilter(f: Filter) {
//   switch (f) {
//     case "all": return "Todas";
//     case "open": return "Abiertas";
//     case "done": return "Hechas";
//     case "canceled": return "Canceladas";
//   }
// }

// function iconByType(t: Activity["type"]) {
//   if (t === "call") return "📞";
//   if (t === "meeting") return "📅";
//   return "✅";
// }

// function dateOrDash(ts?: number | null) {
//   if (!ts) return "— sin fecha";
//   return new Date(ts).toLocaleDateString();
// }

// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },

//   filters: { flexDirection: "row", gap: 8, alignItems: "center" },
//   chip: {
//     paddingHorizontal: 10,
//     paddingVertical: 8,
//     borderRadius: 999,
//     backgroundColor: "#1a1b2a",
//     borderWidth: 1,
//     borderColor: BORDER,
//   },
//   chipActive: {
//     backgroundColor: "rgba(124,58,237,0.20)",
//     borderColor: PRIMARY,
//   },
//   chipText: { color: SUBTLE, fontWeight: "700", fontSize: 12 },
//   chipTextActive: { color: "#E9D5FF" },

//   newBtn: {
//     marginLeft: "auto",
//     backgroundColor: PRIMARY,
//     borderRadius: 10,
//     paddingHorizontal: 12,
//     paddingVertical: 8,
//   },
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
//   title: { color: TEXT, fontWeight: "800" },
//   sub: { color: SUBTLE, fontSize: 12 },

//   subtle: { color: SUBTLE, textAlign: "center", marginTop: 8 },
//   center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
// });

