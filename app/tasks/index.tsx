// app/tasks/index.tsx
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
/* Maestro de EN PROCESO locales (mismo key que en RelatedActivities) */
const MASTER_INPROGRESS_KEY = "inProgressActivities:v1:all";

type Filter = "all" | "open" | "done" | "canceled";

type ActivityWithCreator = Activity & {
  created_by_name?: string | null;
  created_by_email?: string | null;
  assigned_to_name?: string | null;
};

export default function TasksList() {
  const [filter, setFilter] = useState<Filter>("all");
  const [completedMaster, setCompletedMaster] = useState<Set<string>>(new Set());
  const [inProgressMaster, setInProgressMaster] = useState<Set<string>>(
    new Set()
  );

  // 🔁 Carga maestro de COMPLETADAS
  const loadCompletedMaster = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MASTER_COMPLETED_KEY);
      setCompletedMaster(new Set<string>(raw ? JSON.parse(raw) : []));
    } catch {
      setCompletedMaster(new Set());
    }
  }, []);

  // 🔁 Carga maestro de EN PROCESO
  const loadInProgressMaster = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MASTER_INPROGRESS_KEY);
      setInProgressMaster(new Set<string>(raw ? JSON.parse(raw) : []));
    } catch {
      setInProgressMaster(new Set());
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    loadCompletedMaster();
    loadInProgressMaster();
  }, [loadCompletedMaster, loadInProgressMaster]);

  // Y en cada focus (por si marcaste en otra pantalla)
  useFocusEffect(
    useCallback(() => {
      loadCompletedMaster();
      loadInProgressMaster();
    }, [loadCompletedMaster, loadInProgressMaster])
  );

  // 🔑 Trae TODAS las actividades (sin filtros)
  const q = useQuery<ActivityWithCreator[]>({
    queryKey: ["activities-all"],
    queryFn: () => listActivities() as Promise<ActivityWithCreator[]>,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const onRefresh = useCallback(() => {
    loadCompletedMaster();
    loadInProgressMaster();
    q.refetch();
  }, [q, loadCompletedMaster, loadInProgressMaster]);

  const data = useMemo(() => {
    // 👉 Mostrar SIEMPRE todas las actividades, sin importar el status
    return (q.data ?? [])
      .slice()
      .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
  }, [q.data]);

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
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
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
              <RefreshControl
                refreshing={q.isFetching}
                onRefresh={onRefresh}
              />
            }
            ListEmptyComponent={
              <Text style={styles.subtle}>No hay actividades</Text>
            }
            renderItem={({ item }) => (
              <TaskCard
                item={item}
                completedMaster={completedMaster}
                inProgressMaster={inProgressMaster}
              />
            )}
            contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
          />
        )}
      </View>
    </>
  );
}

function TaskCard({
  item,
  completedMaster,
  inProgressMaster,
}: {
  item: ActivityWithCreator;
  completedMaster: Set<string>;
  inProgressMaster: Set<string>;
}) {
  // ✅ Considera COMPLETADA si es done en backend O si está marcada localmente
  const isDoneUI = item.status === "done" || completedMaster.has(item.id);
  // ✅ EN PROCESO si no está done y aparece en el maestro de en proceso
  const isInProgressUI = !isDoneUI && inProgressMaster.has(item.id);

  const statusLabel = isDoneUI
    ? "Realizada"
    : isInProgressUI
    ? "En proceso"
    : "Abierta";

  const createdByLabel = item.created_by_name
    ? `por ${item.created_by_name}`
    : "";

  // Igual que en RelatedActivities
  const assignedInfo =
    item.assigned_to_name && item.assigned_to_name.trim().length > 0
      ? ` · asignada a ${item.assigned_to_name}`
      : item.assigned_to && String(item.assigned_to).trim().length > 0
      ? ` · asignada a ${item.assigned_to}`
      : " · sin asignar";

  const createdLabel =
    item.created_at != null
      ? ` · creada el ${formatDate(item.created_at as any)}`
      : "";

  return (
    <Link href={{ pathname: "/tasks/[id]", params: { id: item.id } }} asChild>
      <Pressable accessibilityRole="link" hitSlop={8}>
        <View
          style={[
            styles.row,
            isDoneUI && styles.rowDone,
            !isDoneUI && isInProgressUI && styles.rowInProgress,
          ]}
        >
          {/* Título */}
          <Text
            style={[
              styles.title,
              isDoneUI && styles.titleDone,
              !isDoneUI && isInProgressUI && styles.titleInProgress,
            ]}
            numberOfLines={2}
          >
            {iconByType(item.type)} {item.title}
          </Text>

          {/* 🔹 Línea de detalle igual al otro componente */}
          <Text
            style={[
              styles.sub,
              isDoneUI && styles.subDone,
              !isDoneUI && isInProgressUI && styles.subInProgress,
            ]}
            numberOfLines={3}
          >
            {(item.type || "task") +
              " · " +
              statusLabel +
              (createdByLabel ? ` · ${createdByLabel}` : "") +
              assignedInfo +
              createdLabel +
              (isDoneUI ? " · tarea completada" : "")}
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
    case "all":
      return "Todas";
    case "open":
      return "Abiertas";
    case "done":
      return "Hechas";
    case "canceled":
      return "Canceladas";
  }
}

function iconByType(t: Activity["type"]) {
  if (t === "call") return "📞";
  if (t === "meeting") return "📅";
  if (t === "note") return "📝";
  return "✅";
}

function dateOrDash(d?: number | null) {
  if (!d) return "Sin fecha";
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "Sin fecha";
    return dt.toLocaleDateString();
  } catch {
    return "Sin fecha";
  }
}

function formatDate(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const dt = new Date(n);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString();
}


const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
    padding: 16,
    gap: 12,
  },
  filters: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
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
  rowInProgress: {
    borderColor: "#3b82f6",
    backgroundColor: "rgba(37,99,235,0.12)",
  },
  title: { color: TEXT, fontWeight: "800", fontSize: 15 },
  titleDone: { color: SUCCESS },
  titleInProgress: { color: "#60a5fa" },
  sub: { color: SUBTLE, fontSize: 12, marginTop: 0 },
  subDone: { color: SUCCESS },
  subInProgress: { color: "#60a5fa" },
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


// // app/tasks/index.tsx
// import { listActivities, type Activity } from "@/src/api/activities";
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { useQuery } from "@tanstack/react-query";
// import { Link, Stack, useFocusEffect } from "expo-router";
// import { useCallback, useEffect, useMemo, useState } from "react";
// import {
//   ActivityIndicator,
//   FlatList,
//   Pressable,
//   RefreshControl,
//   StyleSheet,
//   Text,
//   View,
// } from "react-native";

// /* 🎨 Paleta */
// const BG = "#0F1115";
// const CARD = "#171923";
// const BORDER = "#2B3140";
// const TEXT = "#F3F4F6";
// const SUBTLE = "#A4ADBD";
// const PRIMARY = "#7C3AED";
// const SUCCESS = "#16a34a";

// /* Maestro de completadas locales */
// const MASTER_COMPLETED_KEY = "completedActivities:v1:all";

// type Filter = "all" | "open" | "done" | "canceled";

// type ActivityWithCreator = Activity & {
//   created_by_name?: string | null;
//   created_by_email?: string | null;
//   assigned_to_name?: string | null;
// };

// export default function TasksList() {
//   const [filter, setFilter] = useState<Filter>("all");
//   const [completedMaster, setCompletedMaster] = useState<Set<string>>(new Set());

//   // 🔁 Carga inicial y en cada focus (por si marcaste en otra pantalla)
//   const loadMaster = useCallback(async () => {
//     try {
//       const raw = await AsyncStorage.getItem(MASTER_COMPLETED_KEY);
//       setCompletedMaster(new Set<string>(raw ? JSON.parse(raw) : []));
//     } catch {
//       setCompletedMaster(new Set());
//     }
//   }, []);

//   useEffect(() => {
//     loadMaster();
//   }, [loadMaster]);

//   useFocusEffect(
//     useCallback(() => {
//       loadMaster();
//     }, [loadMaster])
//   );

//   // 🔑 Trae TODAS las actividades (sin filtros)
//   const q = useQuery<ActivityWithCreator[]>({
//     queryKey: ["activities-all"],
//     queryFn: () => listActivities() as Promise<ActivityWithCreator[]>,
//     refetchOnMount: "always",
//     refetchOnWindowFocus: true,
//   });

//   const onRefresh = useCallback(() => {
//     loadMaster();
//     q.refetch();
//   }, [q, loadMaster]);

//   const data = useMemo(() => {
//     // 👉 Mostrar SIEMPRE todas las actividades, sin importar el status
//     return (q.data ?? [])
//       .slice()
//       .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
//   }, [q.data]);

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
//                 <Text
//                   style={[styles.chipText, active && styles.chipTextActive]}
//                 >
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
//             <ActivityIndicator color={PRIMARY} />
//             <Text style={styles.subtle}>Cargando actividades…</Text>
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
//               <RefreshControl
//                 refreshing={q.isFetching}
//                 onRefresh={onRefresh}
//               />
//             }
//             ListEmptyComponent={
//               <Text style={styles.subtle}>No hay actividades</Text>
//             }
//             renderItem={({ item }) => (
//               <TaskCard item={item} completedMaster={completedMaster} />
//             )}
//             contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
//           />
//         )}
//       </View>
//     </>
//   );
// }

// function TaskCard({
//   item,
//   completedMaster,
// }: {
//   item: ActivityWithCreator;
//   completedMaster: Set<string>;
// }) {
//   // ✅ Considera COMPLETADA si es done en backend O si está marcada localmente
//   const isDoneUI = item.status === "done" || completedMaster.has(item.id);

//   const createdLabel = item.created_at
//     ? `Creada el ${formatDate(item.created_at)}`
//     : "";

//   return (
//     <Link href={{ pathname: "/tasks/[id]", params: { id: item.id } }} asChild>
//       <Pressable accessibilityRole="link" hitSlop={8}>
//         <View style={[styles.row, isDoneUI && styles.rowDone]}>
//           <Text
//             style={[styles.title, isDoneUI && styles.titleDone]}
//             numberOfLines={2}
//           >
//             {iconByType(item.type)} {item.title}
//           </Text>

//           <Text
//             style={[styles.sub, isDoneUI && styles.subDone]}
//             numberOfLines={2}
//           >
//             {dateOrDash(item.due_date)} •{" "}
//             {isDoneUI ? "Completada" : labelFilter(item.status as Filter)}
//             {item.created_by_name ? ` • ${item.created_by_name}` : ""}
//           </Text>

//           <Text style={styles.sub}>
//             {item.assigned_to_name
//               ? `Asignada a: ${item.assigned_to_name}`
//               : "Sin asignar"}
//           </Text>

//           {/* 👉 Nueva línea con fecha de creación */}
//           {createdLabel ? (
//             <Text style={styles.sub}>{createdLabel}</Text>
//           ) : null}

//           {isDoneUI && (
//             <View style={styles.badgeDone}>
//               <Text style={styles.badgeDoneText}>✔ Tarea completada</Text>
//             </View>
//           )}
//         </View>
//       </Pressable>
//     </Link>
//   );
// }


// function labelFilter(f: Filter) {
//   switch (f) {
//     case "all":
//       return "Todas";
//     case "open":
//       return "Abiertas";
//     case "done":
//       return "Hechas";
//     case "canceled":
//       return "Canceladas";
//   }
// }

// function iconByType(t: Activity["type"]) {
//   if (t === "call") return "📞";
//   if (t === "meeting") return "📅";
//   if (t === "note") return "📝";
//   return "✅";
// }

// function dateOrDash(d?: number | null) {
//   if (!d) return "Sin fecha";
//   try {
//     const dt = new Date(d);
//     if (isNaN(dt.getTime())) return "Sin fecha";
//     return dt.toLocaleDateString();
//   } catch {
//     return "Sin fecha";
//   }
// }

// function formatDate(ms?: number | null) {
//   if (!ms) return "—";
//   try {
//     const dt = new Date(ms);
//     if (isNaN(dt.getTime())) return "—";
//     return dt.toLocaleDateString();
//   } catch {
//     return "—";
//   }
// }


// const styles = StyleSheet.create({
//   screen: {
//     flex: 1,
//     backgroundColor: BG,
//     padding: 16,
//     gap: 12,
//   },
//   filters: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 8,
//     marginBottom: 8,
//   },
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
//     padding: 14,
//     flexDirection: "column",
//     alignItems: "flex-start",
//     gap: 6,
//   },
//   rowDone: {
//     borderColor: SUCCESS,
//     backgroundColor: "rgba(22,163,74,0.08)",
//   },
//   title: { color: TEXT, fontWeight: "800", fontSize: 15 },
//   titleDone: { color: SUCCESS },
//   sub: { color: SUBTLE, fontSize: 12, marginTop: 0 },
//   subDone: { color: SUCCESS },
//   subtle: { color: SUBTLE, textAlign: "center", marginTop: 8 },
//   center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
//   badgeDone: {
//     alignSelf: "flex-start",
//     marginTop: 2,
//     backgroundColor: SUCCESS,
//     borderRadius: 999,
//     paddingVertical: 3,
//     paddingHorizontal: 8,
//   },
//   badgeDoneText: {
//     color: "#fff",
//     fontWeight: "900",
//     fontSize: 11,
//     letterSpacing: 0.3,
//   },
// });
