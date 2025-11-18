// src/components/RelatedActivities.tsx
import {
  createActivity,
  deleteActivity,
  listActivities,
  type Activity,
} from "@/src/api/activities";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

/** Miembros del workspace que se pueden elegir para asignar */
type MemberOption = {
  id: string;
  name: string;
  email?: string | null;
};

/** Extiende Activity (ya trae created_by_* y assigned_to_* desde la API) */
type ActivityWithCreator = Activity;

/** Filtro genérico por entidad relacionada */
export type ActivityFilters = {
  deal_id?: string;
  account_id?: string;
  contact_id?: string;
  lead_id?: string;
  // ignoramos status a propósito para NO ocultar “done”
  status?: Activity["status"];
};

/* 🔑 Claves de almacenamiento */
const MASTER_COMPLETED_KEY = "completedActivities:v1:all";
function completedKey(filters: ActivityFilters) {
  const scope =
    filters.contact_id ||
    filters.deal_id ||
    filters.account_id ||
    filters.lead_id ||
    "global";
  return `completedActivities:v1:${scope}`;
}

/* 🧰 Helpers maestro */
async function addToMasterCompleted(id: string) {
  try {
    const raw = await AsyncStorage.getItem(MASTER_COMPLETED_KEY);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    if (!set.has(id)) {
      set.add(id);
      await AsyncStorage.setItem(MASTER_COMPLETED_KEY, JSON.stringify([...set]));
    }
  } catch {}
}
async function removeFromMasterCompleted(id: string) {
  try {
    const raw = await AsyncStorage.getItem(MASTER_COMPLETED_KEY);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    if (set.delete(id)) {
      await AsyncStorage.setItem(MASTER_COMPLETED_KEY, JSON.stringify([...set]));
    }
  } catch {}
}

export default function RelatedActivities(props: {
  title?: string;
  filters: ActivityFilters;
  createDefaults?: Partial<Activity>;
  /** 👇 Opcional: lista de usuarios del workspace para asignar tareas */
  members?: MemberOption[];
}) {
  const { title = "Actividades", filters, createDefaults, members } = props;
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState("");

  // Estado para asignación de NUEVA actividad
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);

  // ✅ Estado local para marcar visualmente como "realizada" (persistido por scope)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const storageKey = useMemo(() => completedKey(filters), [filters]);

  // Quitamos 'status' del filtro base: queremos TODO (open + done)
  const baseFilters = useMemo(() => {
    const { status: _omit, ...rest } = (filters ?? {}) as any;
    return rest as Omit<ActivityFilters, "status">;
  }, [filters]);

  // 🔁 UNA sola query: no filtramos por status (para no ocultar “done”)
  const q = useQuery<ActivityWithCreator[]>({
    queryKey: ["activities", baseFilters],
    queryFn: () => listActivities(baseFilters) as Promise<ActivityWithCreator[]>,
    enabled: Object.keys(baseFilters).length > 0,
    select(rows) {
      const all = [...(rows ?? [])];
      // Orden igual que el backend
      all.sort((a, b) => {
        const ua = a.updated_at ?? 0;
        const ub = b.updated_at ?? 0;
        if (ub !== ua) return ub - ua;
        return String(a.id).localeCompare(String(b.id));
      });
      return all;
    },
  });

  // 🔄 Cargar marcas desde AsyncStorage al montar / cambiar de scope
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) {
          setCompletedIds(new Set());
          return;
        }
        const arr: string[] = JSON.parse(raw);
        setCompletedIds(new Set(arr));
      } catch {
        setCompletedIds(new Set());
      }
    })();
  }, [storageKey]);

  // 🧹 Si cambia la lista del servidor, depuramos ids huérfanos y re-guardamos
  useEffect(() => {
    if (!q.data) return;
    const validIds = new Set(q.data.map((a) => a.id));
    let changed = false;
    const next = new Set<string>();
    completedIds.forEach((id) => {
      if (validIds.has(id)) next.add(id);
      else changed = true;
    });
    if (changed) {
      setCompletedIds(next);
      AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(next))).catch(
        () => {}
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const persistCompleted = async (setTo: Set<string>) => {
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(setTo)));
    } catch {
      // silencioso
    }
  };

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["activities", baseFilters] });
  };

  const mCreate = useMutation({
    mutationFn: async () => {
      const t = newTitle.trim();
      if (!t) return;
      await createActivity({
        type: "task",
        title: t,
        status: "open",
        assigned_to: assignedTo ?? undefined, // 👈 aquí mandamos la asignación (o nada)
        ...baseFilters,
        ...(createDefaults ?? {}),
      } as any);
    },
    onSuccess: async () => {
      setNewTitle("");
      // mantenemos la asignación seleccionada (útil para crear varias seguidas al mismo usuario)
      await invalidate();
    },
  });

  const mDel = useMutation({
    mutationFn: async (id: string) => deleteActivity(id),
    onSuccess: async (_d, id) => {
      // si estaba marcada localmente, la limpiamos y persistimos
      setCompletedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        persistCompleted(next);
        return next;
      });
      // quitar también del maestro
      await removeFromMasterCompleted(id);
      await invalidate();
    },
  });

  // Acción local: marcar visualmente como realizada (y persistir + maestro)
  const markAsCompleted = (id: string) => {
    setCompletedIds((prev) => {
      if (prev.has(id)) return prev; // idempotente
      const next = new Set(prev);
      next.add(id);
      persistCompleted(next);
      // maestro global para que /tasks pueda pintarlas
      addToMasterCompleted(id);
      return next;
    });
  };

  const selectedMember =
    members && members.length > 0
      ? members.find((m) => m.id === assignedTo) ?? null
      : null;

  const assignedLabel = selectedMember
    ? `Asignar: ${selectedMember.name}`
    : "Asignar: sin asignar";

  return (
    <View style={S.box}>
      <Text style={S.title}>{title}</Text>

      {/* Fila de creación: input + (selector de asignación) + botón Crear */}
      <View style={[S.row, { gap: 8, flexWrap: "wrap" }]}>
        <TextInput
          style={[S.input]}
          placeholder="Nueva tarea…"
          placeholderTextColor="#475569"
          value={newTitle}
          onChangeText={setNewTitle}
        />

        {members && members.length > 0 && (
          <View style={{ flexDirection: "column" }}>
            <Pressable
              style={S.assignChip}
              onPress={() => setAssignPickerOpen((v) => !v)}
            >
              <Text style={S.assignChipText}>{assignedLabel}</Text>
            </Pressable>

            {assignPickerOpen && (
              <View style={S.assignList}>
                <Pressable
                  style={S.assignOption}
                  onPress={() => {
                    setAssignedTo(null);
                    setAssignPickerOpen(false);
                  }}
                >
                  <Text style={S.assignOptionText}>Sin asignar</Text>
                </Pressable>
                {members.map((m) => (
                  <Pressable
                    key={m.id}
                    style={S.assignOption}
                    onPress={() => {
                      setAssignedTo(m.id);
                      setAssignPickerOpen(false);
                    }}
                  >
                    <Text style={S.assignOptionText}>
                      {m.name || m.email || m.id}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        <Pressable
          style={[S.btn, S.btnPrimary, mCreate.isPending && { opacity: 0.7 }]}
          onPress={() => mCreate.mutate()}
          disabled={mCreate.isPending}
        >
          <Text style={S.btnText}>Crear</Text>
        </Pressable>
      </View>

      {q.isLoading ? (
        <Text style={{ color: "#475569", padding: 12 }}>
          Cargando actividades…
        </Text>
      ) : q.isError ? (
        <Text style={{ color: "#ef4444", padding: 12 }}>
          Error cargando actividades.
        </Text>
      ) : (
        <View>
          {(q.data ?? []).map((a) => {
            const isCompletedUI = completedIds.has(a.id); // 👈 persistido por scope

   const assignedInfo =
  a.assigned_to_name && a.assigned_to_name.trim().length > 0
    ? ` · asignada a ${a.assigned_to_name}`
    : a.assigned_to && String(a.assigned_to).trim().length > 0
    ? ` · asignada a ${a.assigned_to}`
    : " · sin asignar";



            return (
              <View
                key={a.id}
                style={[
                  S.row,
                  isCompletedUI && S.rowDone, // fondo suave cuando está marcada
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[S.itemTitle, isCompletedUI && S.itemTitleDone]}>
                    {a.title}
                  </Text>
                  <Text style={[S.itemSub, isCompletedUI && S.itemSubDone]}>
                    {a.type} · {a.status}
                    {a.created_by_name ? ` · por ${a.created_by_name}` : ""}
                    {assignedInfo}
                    {isCompletedUI ? " · tarea completada" : ""}
                  </Text>
                  {isCompletedUI ? (
                    <View style={S.badgeDone}>
                      <Text style={S.badgeDoneText}>Completado</Text>
                    </View>
                  ) : null}
                </View>

                {!isCompletedUI && (
                  <Pressable
                    style={[S.btn, S.btnSuccess]}
                    onPress={() => markAsCompleted(a.id)}
                  >
                    <Text style={S.btnText}>Realizada</Text>
                  </Pressable>
                )}

                <Pressable
                  style={[S.btn, S.btnDanger]}
                  onPress={() => mDel.mutate(a.id)}
                >
                  <Text style={S.btnText}>Borrar</Text>
                </Pressable>
              </View>
            );
          })}

          {(q.data ?? []).length === 0 && (
            <Text style={{ color: "#475569", padding: 12 }}>
              Sin actividades.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#ECEFF4",
    borderRadius: 12,
    overflow: "hidden",
  },
  title: { color: "#0F172A", fontWeight: "900", fontSize: 16, padding: 12 },
  row: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#CBD5E1",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowDone: {
    backgroundColor: "#E8F7EE",
    borderTopColor: "#C7E8D2",
  },
  itemTitle: { color: "#0F172A", fontWeight: "800" },
  itemTitleDone: { color: "#16a34a" },
  itemSub: { color: "#475569", fontSize: 12, marginBottom: 6 },
  itemSubDone: { color: "#16a34a" },
  badgeDone: {
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "#22C55E",
  },
  badgeDoneText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
    color: "#0F172A",
    borderRadius: 10,
    padding: 10,
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  btnPrimary: { backgroundColor: "#7C3AED" },
  btnSuccess: { backgroundColor: "#16a34a" },
  btnDanger: { backgroundColor: "#EF4444" },

  // 💠 estilos del selector de asignación
  assignChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#f8fafc",
    marginBottom: 4,
  },
  assignChipText: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "700",
  },
  assignList: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  assignOption: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  assignOptionText: {
    fontSize: 12,
    color: "#0F172A",
  },
});


// // src/components/RelatedActivities.tsx
// import {
//   createActivity,
//   deleteActivity,
//   listActivities,
//   type Activity,
// } from "@/src/api/activities";
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { useEffect, useMemo, useState } from "react";
// import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

// /** Extiende Activity con campos enriquecidos del backend */
// type ActivityWithCreator = Activity & {
//   created_by_name?: string | null;
//   created_by_email?: string | null;
// };

// /** Filtro genérico por entidad relacionada */
// export type ActivityFilters = {
//   deal_id?: string;
//   account_id?: string;
//   contact_id?: string;
//   lead_id?: string;
//   // ignoramos status a propósito para NO ocultar “done”
//   status?: Activity["status"];
// };

// /* 🔑 Claves de almacenamiento */
// const MASTER_COMPLETED_KEY = "completedActivities:v1:all";
// function completedKey(filters: ActivityFilters) {
//   const scope =
//     filters.contact_id ||
//     filters.deal_id ||
//     filters.account_id ||
//     filters.lead_id ||
//     "global";
//   return `completedActivities:v1:${scope}`;
// }

// /* 🧰 Helpers maestro */
// async function addToMasterCompleted(id: string) {
//   try {
//     const raw = await AsyncStorage.getItem(MASTER_COMPLETED_KEY);
//     const set = new Set<string>(raw ? JSON.parse(raw) : []);
//     if (!set.has(id)) {
//       set.add(id);
//       await AsyncStorage.setItem(MASTER_COMPLETED_KEY, JSON.stringify([...set]));
//     }
//   } catch {}
// }
// async function removeFromMasterCompleted(id: string) {
//   try {
//     const raw = await AsyncStorage.getItem(MASTER_COMPLETED_KEY);
//     const set = new Set<string>(raw ? JSON.parse(raw) : []);
//     if (set.delete(id)) {
//       await AsyncStorage.setItem(MASTER_COMPLETED_KEY, JSON.stringify([...set]));
//     }
//   } catch {}
// }

// export default function RelatedActivities(props: {
//   title?: string;
//   filters: ActivityFilters;
//   createDefaults?: Partial<Activity>;
// }) {
//   const { title = "Actividades", filters, createDefaults } = props;
//   const qc = useQueryClient();
//   const [newTitle, setNewTitle] = useState("");

//   // ✅ Estado local para marcar visualmente como "realizada" (persistido por scope)
//   const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
//   const storageKey = useMemo(() => completedKey(filters), [filters]);

//   // Quitamos 'status' del filtro base: queremos TODO (open + done)
//   const baseFilters = useMemo(() => {
//     const { status: _omit, ...rest } = (filters ?? {}) as any;
//     return rest as Omit<ActivityFilters, "status">;
//   }, [filters]);

//   // 🔁 UNA sola query: no filtramos por status (para no ocultar “done”)
//   const q = useQuery<ActivityWithCreator[]>({
//     queryKey: ["activities", baseFilters],
//     queryFn: () => listActivities(baseFilters) as Promise<ActivityWithCreator[]>,
//     enabled: Object.keys(baseFilters).length > 0,
//     select(rows) {
//       const all = [...(rows ?? [])];
//       // Orden igual que el backend
//       all.sort((a, b) => {
//         const ua = a.updated_at ?? 0;
//         const ub = b.updated_at ?? 0;
//         if (ub !== ua) return ub - ua;
//         return String(a.id).localeCompare(String(b.id));
//       });
//       return all;
//     },
//   });

//   // 🔄 Cargar marcas desde AsyncStorage al montar / cambiar de scope
//   useEffect(() => {
//     (async () => {
//       try {
//         const raw = await AsyncStorage.getItem(storageKey);
//         if (!raw) {
//           setCompletedIds(new Set());
//           return;
//         }
//         const arr: string[] = JSON.parse(raw);
//         setCompletedIds(new Set(arr));
//       } catch {
//         setCompletedIds(new Set());
//       }
//     })();
//   }, [storageKey]);

//   // 🧹 Si cambia la lista del servidor, depuramos ids huérfanos y re-guardamos
//   useEffect(() => {
//     if (!q.data) return;
//     const validIds = new Set(q.data.map((a) => a.id));
//     let changed = false;
//     const next = new Set<string>();
//     completedIds.forEach((id) => {
//       if (validIds.has(id)) next.add(id);
//       else changed = true;
//     });
//     if (changed) {
//       setCompletedIds(next);
//       AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(next))).catch(() => {});
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [q.data]);

//   const persistCompleted = async (setTo: Set<string>) => {
//     try {
//       await AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(setTo)));
//     } catch {
//       // silencioso
//     }
//   };

//   const invalidate = async () => {
//     await qc.invalidateQueries({ queryKey: ["activities", baseFilters] });
//   };

//   const mCreate = useMutation({
//     mutationFn: async () => {
//       const t = newTitle.trim();
//       if (!t) return;
//       await createActivity({
//         type: "task",
//         title: t,
//         status: "open",
//         ...baseFilters,
//         ...(createDefaults ?? {}),
//       } as any);
//     },
//     onSuccess: async () => {
//       setNewTitle("");
//       await invalidate();
//     },
//   });

//   const mDel = useMutation({
//     mutationFn: async (id: string) => deleteActivity(id),
//     onSuccess: async (_d, id) => {
//       // si estaba marcada localmente, la limpiamos y persistimos
//       setCompletedIds((prev) => {
//         if (!prev.has(id)) return prev;
//         const next = new Set(prev);
//         next.delete(id);
//         persistCompleted(next);
//         return next;
//       });
//       // quitar también del maestro
//       await removeFromMasterCompleted(id);
//       await invalidate();
//     },
//   });

//   // Acción local: marcar visualmente como realizada (y persistir + maestro)
//   const markAsCompleted = (id: string) => {
//     setCompletedIds((prev) => {
//       if (prev.has(id)) return prev; // idempotente
//       const next = new Set(prev);
//       next.add(id);
//       persistCompleted(next);
//       // maestro global para que /tasks pueda pintarlas
//       addToMasterCompleted(id);
//       return next;
//     });
//   };

//   return (
//     <View style={S.box}>
//       <Text style={S.title}>{title}</Text>

//       <View style={[S.row, { gap: 8 }]}>
//         <TextInput
//           style={[S.input]}
//           placeholder="Nueva tarea…"
//           placeholderTextColor="#475569"
//           value={newTitle}
//           onChangeText={setNewTitle}
//         />
//         <Pressable
//           style={[S.btn, S.btnPrimary, mCreate.isPending && { opacity: 0.7 }]}
//           onPress={() => mCreate.mutate()}
//           disabled={mCreate.isPending}
//         >
//           <Text style={S.btnText}>Crear</Text>
//         </Pressable>
//       </View>

//       {q.isLoading ? (
//         <Text style={{ color: "#475569", padding: 12 }}>Cargando actividades…</Text>
//       ) : q.isError ? (
//         <Text style={{ color: "#ef4444", padding: 12 }}>Error cargando actividades.</Text>
//       ) : (
//         <View>
//           {(q.data ?? []).map((a) => {
//             const isCompletedUI = completedIds.has(a.id); // 👈 persistido por scope
//             return (
//               <View
//                 key={a.id}
//                 style={[
//                   S.row,
//                   isCompletedUI && S.rowDone, // fondo suave cuando está marcada
//                 ]}
//               >
//                 <View style={{ flex: 1 }}>
//                   <Text style={[S.itemTitle, isCompletedUI && S.itemTitleDone]}>
//                     {a.title}
//                   </Text>
//                   <Text style={[S.itemSub, isCompletedUI && S.itemSubDone]}>
//                     {a.type} · {a.status}
//                     {a.created_by_name ? ` · por ${a.created_by_name}` : ""}
//                     {isCompletedUI ? " · tarea completada" : ""}
//                   </Text>
//                   {isCompletedUI ? (
//                     <View style={S.badgeDone}>
//                       <Text style={S.badgeDoneText}>Completado</Text>
//                     </View>
//                   ) : null}
//                 </View>

//                 {!isCompletedUI && (
//                   <Pressable
//                     style={[S.btn, S.btnSuccess]}
//                     onPress={() => markAsCompleted(a.id)}
//                   >
//                     <Text style={S.btnText}>Realizada</Text>
//                   </Pressable>
//                 )}

//                 <Pressable
//                   style={[S.btn, S.btnDanger]}
//                   onPress={() => mDel.mutate(a.id)}
//                 >
//                   <Text style={S.btnText}>Borrar</Text>
//                 </Pressable>
//               </View>
//             );
//           })}

//           {(q.data ?? []).length === 0 && (
//             <Text style={{ color: "#475569", padding: 12 }}>Sin actividades.</Text>
//           )}
//         </View>
//       )}
//     </View>
//   );
// }

// const S = StyleSheet.create({
//   box: {
//     borderWidth: 1,
//     borderColor: "#CBD5E1",
//     backgroundColor: "#ECEFF4",
//     borderRadius: 12,
//     overflow: "hidden",
//   },
//   title: { color: "#0F172A", fontWeight: "900", fontSize: 16, padding: 12 },
//   row: {
//     padding: 12,
//     borderTopWidth: 1,
//     borderTopColor: "#CBD5E1",
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 8,
//   },
//   rowDone: {
//     backgroundColor: "#E8F7EE",
//     borderTopColor: "#C7E8D2",
//   },
//   itemTitle: { color: "#0F172A", fontWeight: "800" },
//   itemTitleDone: { color: "#16a34a" },
//   itemSub: { color: "#475569", fontSize: 12, marginBottom: 6 },
//   itemSubDone: { color: "#16a34a" },
//   badgeDone: {
//     alignSelf: "flex-start",
//     paddingVertical: 3,
//     paddingHorizontal: 8,
//     borderRadius: 999,
//     backgroundColor: "#22C55E",
//   },
//   badgeDoneText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },
//   input: {
//     flex: 1,
//     borderWidth: 1,
//     borderColor: "#CBD5E1",
//     backgroundColor: "#fff",
//     color: "#0F172A",
//     borderRadius: 10,
//     padding: 10,
//   },
//   btn: {
//     paddingVertical: 8,
//     paddingHorizontal: 12,
//     borderRadius: 10,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   btnText: { color: "#fff", fontWeight: "800" },
//   btnPrimary: { backgroundColor: "#7C3AED" },
//   btnSuccess: { backgroundColor: "#16a34a" },
//   btnDanger: { backgroundColor: "#EF4444" },
// });

