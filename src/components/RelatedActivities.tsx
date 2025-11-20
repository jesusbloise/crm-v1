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

/** Miembros del workspace que se pueden elegir */
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
  // ignoramos status a propósito para no ocultar “done”
  status?: Activity["status"];
};

/* Claves de almacenamiento */
const MASTER_COMPLETED_KEY = "completedActivities:v1:all";
const MASTER_INPROGRESS_KEY = "inProgressActivities:v1:all";

function completedKey(filters: ActivityFilters) {
  const scope =
    filters.contact_id ||
    filters.deal_id ||
    filters.account_id ||
    filters.lead_id ||
    "global";
  return `completedActivities:v1:${scope}`;
}

function inProgressKey(filters: ActivityFilters) {
  const scope =
    filters.contact_id ||
    filters.deal_id ||
    filters.account_id ||
    filters.lead_id ||
    "global";
  return `inProgressActivities:v1:${scope}`;
}

/* Helpers maestro: COMPLETED */
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

/* Helpers maestro: IN PROGRESS */
async function addToMasterInProgress(id: string) {
  try {
    const raw = await AsyncStorage.getItem(MASTER_INPROGRESS_KEY);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    if (!set.has(id)) {
      set.add(id);
      await AsyncStorage.setItem(
        MASTER_INPROGRESS_KEY,
        JSON.stringify([...set])
      );
    }
  } catch {}
}
async function removeFromMasterInProgress(id: string) {
  try {
    const raw = await AsyncStorage.getItem(MASTER_INPROGRESS_KEY);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    if (set.delete(id)) {
      await AsyncStorage.setItem(
        MASTER_INPROGRESS_KEY,
        JSON.stringify([...set])
      );
    }
  } catch {}
}

// Helper para formatear created_at (ms desde epoch)
function formatDate(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export default function RelatedActivities(props: {
  title?: string;
  filters: ActivityFilters;
  createDefaults?: Partial<Activity>;
  /** Opcional: lista de usuarios del workspace para asignar tareas (solo al crear) */
  members?: MemberOption[];
}) {
  const { title = "Actividades", filters, createDefaults, members } = props;
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState("");

  // Asignación de NUEVA actividad (solo al crear)
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);

  // Estado local para "realizada" (persistido)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  // Estado local para "en proceso" (también persistido)
  const [inProgressIds, setInProgressIds] = useState<Set<string>>(new Set());
   // maestros globales (para sync con /tasks y /tasks/[id])
  const [masterCompletedIds, setMasterCompletedIds] = useState<Set<string>>(new Set());
  const [masterInProgressIds, setMasterInProgressIds] = useState<Set<string>>(new Set());

  const storageKeyCompleted = useMemo(() => completedKey(filters), [filters]);
  const storageKeyInProgress = useMemo(() => inProgressKey(filters), [filters]);

  // Fila que tiene abierto el menú de estado
  const [statusRowId, setStatusRowId] = useState<string | null>(null);

  // Quitamos 'status' del filtro base: queremos todo (open + done)
  const baseFilters = useMemo(() => {
    const { status: _omit, ...rest } = (filters ?? {}) as any;
    return rest as Omit<ActivityFilters, "status">;
  }, [filters]);

  // Una sola query: no filtramos por status
  const q = useQuery<ActivityWithCreator[]>({
    queryKey: ["activities", baseFilters],
    queryFn: () => listActivities(baseFilters) as Promise<ActivityWithCreator[]>,
    enabled: Object.keys(baseFilters).length > 0,
    select(rows) {
      const all = [...(rows ?? [])];
      all.sort((a, b) => {
        const ua = a.updated_at ?? 0;
        const ub = b.updated_at ?? 0;
        if (ub !== ua) return ub - ua;
        return String(a.id).localeCompare(String(b.id));
      });
      return all;
    },
  });

  // Cargar COMPLETED desde AsyncStorage al montar / cambiar de scope
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKeyCompleted);
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
  }, [storageKeyCompleted]);

  // Cargar IN PROGRESS desde AsyncStorage al montar / cambiar de scope
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKeyInProgress);
        if (!raw) {
          setInProgressIds(new Set());
          return;
        }
        const arr: string[] = JSON.parse(raw);
        setInProgressIds(new Set(arr));
      } catch {
        setInProgressIds(new Set());
      }
    })();
  }, [storageKeyInProgress]);

    // Cargar los MASTER (globales) para reflejar cambios hechos en /tasks y /tasks/[id]
  useEffect(() => {
    (async () => {
      try {
        const [rawCompleted, rawInProgress] = await Promise.all([
          AsyncStorage.getItem(MASTER_COMPLETED_KEY),
          AsyncStorage.getItem(MASTER_INPROGRESS_KEY),
        ]);

        setMasterCompletedIds(
          new Set<string>(rawCompleted ? JSON.parse(rawCompleted) : [])
        );
        setMasterInProgressIds(
          new Set<string>(rawInProgress ? JSON.parse(rawInProgress) : [])
        );
      } catch {
        setMasterCompletedIds(new Set());
        setMasterInProgressIds(new Set());
      }
    })();
  }, []);


  // Si cambia la lista del servidor, depuramos ids huérfanos en ambos
  useEffect(() => {
    if (!q.data) return;
    const validIds = new Set(q.data.map((a) => a.id));

    // COMPLETED
    let changedCompleted = false;
    const nextCompleted = new Set<string>();
    completedIds.forEach((id) => {
      if (validIds.has(id)) nextCompleted.add(id);
      else changedCompleted = true;
    });
    if (changedCompleted) {
      setCompletedIds(nextCompleted);
      AsyncStorage.setItem(
        storageKeyCompleted,
        JSON.stringify(Array.from(nextCompleted))
      ).catch(() => {});
    }

    // IN PROGRESS
    let changedInProgress = false;
    const nextInProgress = new Set<string>();
    inProgressIds.forEach((id) => {
      if (validIds.has(id)) nextInProgress.add(id);
      else changedInProgress = true;
    });
    if (changedInProgress) {
      setInProgressIds(nextInProgress);
      AsyncStorage.setItem(
        storageKeyInProgress,
        JSON.stringify(Array.from(nextInProgress))
      ).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const persistCompleted = async (setTo: Set<string>) => {
    try {
      await AsyncStorage.setItem(
        storageKeyCompleted,
        JSON.stringify(Array.from(setTo))
      );
    } catch {}
  };

  const persistInProgress = async (setTo: Set<string>) => {
    try {
      await AsyncStorage.setItem(
        storageKeyInProgress,
        JSON.stringify(Array.from(setTo))
      );
    } catch {}
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
        assigned_to: assignedTo ?? undefined,
        ...baseFilters,
        ...(createDefaults ?? {}),
      } as any);
    },
    onSuccess: async () => {
      setNewTitle("");
      await invalidate();
    },
  });

  const mDel = useMutation({
    mutationFn: async (id: string) => deleteActivity(id),
    onSuccess: async (_d, id) => {
      setCompletedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        persistCompleted(next);
        return next;
      });
      setInProgressIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        persistInProgress(next);
        return next;
      });
      await removeFromMasterCompleted(id);
      await removeFromMasterInProgress(id);
      await invalidate();
    },
  });

  // Acción local: marcar visualmente como REALIZADA (igual que antes, pero limpiando "en proceso")
  const markAsCompleted = (id: string) => {
    // quitar de en proceso
    setInProgressIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      persistInProgress(next);
      removeFromMasterInProgress(id);
      return next;
    });

    // agregar a completadas
    setCompletedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persistCompleted(next);
      addToMasterCompleted(id);
      return next;
    });
  };

  // Acción local: marcar como ABIERTA (quita todo)
  const markAsOpen = (id: string) => {
    setCompletedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      persistCompleted(next);
      removeFromMasterCompleted(id);
      return next;
    });
    setInProgressIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      persistInProgress(next);
      removeFromMasterInProgress(id);
      return next;
    });
  };

  // Acción local: marcar EN PROCESO (persistido)
  const markInProgress = (id: string) => {
    // quitar de completadas
    setCompletedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      persistCompleted(next);
      removeFromMasterCompleted(id);
      return next;
    });

    // agregar a en proceso
    setInProgressIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persistInProgress(next);
      addToMasterInProgress(id);
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

      {/* Fila de creación */}
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
                  // Completada si está en el set local O en el master global
          const isCompletedUI =
            completedIds.has(a.id) || masterCompletedIds.has(a.id);

          // En proceso si no está completada y está en el local O en el master global
          const isInProgressUI =
            !isCompletedUI &&
            (inProgressIds.has(a.id) || masterInProgressIds.has(a.id));


            const assignedInfo =
              (a as any).assigned_to_name &&
              (a as any).assigned_to_name.trim().length > 0
                ? ` · asignada a ${(a as any).assigned_to_name}`
                : (a as any).assigned_to &&
                  String((a as any).assigned_to).trim().length > 0
                ? ` · asignada a ${(a as any).assigned_to}`
                : " · sin asignar";

            const createdAtValue = (a as any).created_at as
              | number
              | string
              | null
              | undefined;

            const createdLabel =
              createdAtValue != null
                ? ` · creada el ${formatDate(createdAtValue)}`
                : "";

            const statusLabel = isCompletedUI
              ? "Realizada"
              : isInProgressUI
              ? "En proceso"
              : "Abierta";

            return (
              <View
                key={a.id}
                style={[
                  S.row,
                  isCompletedUI && S.rowDone,
                  !isCompletedUI && isInProgressUI && S.rowInProgress,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      S.itemTitle,
                      isCompletedUI && S.itemTitleDone,
                      !isCompletedUI &&
                        isInProgressUI &&
                        S.itemTitleInProgress,
                    ]}
                  >
                    {a.title}
                  </Text>
                  <Text
                    style={[
                      S.itemSub,
                      isCompletedUI && S.itemSubDone,
                      !isCompletedUI &&
                        isInProgressUI &&
                        S.itemSubInProgress,
                    ]}
                  >
                    {a.type} · {statusLabel}
                    {(a as any).created_by_name
                      ? ` · por ${(a as any).created_by_name}`
                      : ""}
                    {assignedInfo}
                    {createdLabel}
                    {isCompletedUI ? " · tarea completada" : ""}
                  </Text>

                  {isCompletedUI ? (
                    <View style={S.badgeDone}>
                      <Text style={S.badgeDoneText}>Completado</Text>
                    </View>
                  ) : null}
                </View>

                {/* Dropdown local en lugar del botón "Realizada" */}
                <View style={{ marginRight: 4 }}>
                  <Pressable
                    style={[
                      S.statusChip,
                      isCompletedUI
                        ? S.statusDone
                        : isInProgressUI
                        ? S.statusInProgress
                        : S.statusOpen,
                    ]}
                    onPress={() =>
                      setStatusRowId((current) =>
                        current === a.id ? null : a.id
                      )
                    }
                  >
                    <Text style={S.statusChipText}>{statusLabel}</Text>
                  </Pressable>

                  {statusRowId === a.id && (
                    <View style={S.statusList}>
                      {/* Abierta */}
                      <Pressable
                        style={S.statusOption}
                        onPress={() => {
                          markAsOpen(a.id);
                          setStatusRowId(null);
                        }}
                      >
                        <Text style={S.statusOptionText}>Abierta</Text>
                      </Pressable>

                      {/* En proceso */}
                      <Pressable
                        style={S.statusOption}
                        onPress={() => {
                          markInProgress(a.id);
                          setStatusRowId(null);
                        }}
                      >
                        <Text style={S.statusOptionText}>En proceso</Text>
                      </Pressable>

                      {/* Realizada */}
                      <Pressable
                        style={S.statusOption}
                        onPress={() => {
                          markAsCompleted(a.id);
                          setStatusRowId(null);
                        }}
                      >
                        <Text style={S.statusOptionText}>Realizada</Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* Botón borrar */}
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
  // Colores por estado LOCAL
  rowInProgress: {
    backgroundColor: "#DBEAFE", // azul claro
    borderTopColor: "#BFDBFE",
  },
  rowDone: {
    backgroundColor: "#E8F7EE",
    borderTopColor: "#C7E8D2",
  },
  itemTitle: { color: "#0F172A", fontWeight: "800" },
  itemTitleInProgress: { color: "#1d4ed8" },
  itemTitleDone: { color: "#16a34a" },
  itemSub: { color: "#475569", fontSize: 12, marginBottom: 6 },
  itemSubInProgress: { color: "#1d4ed8" },
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
  btnDanger: { backgroundColor: "#EF4444" },

  // selector de asignación global (para creación)
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

  // Dropdown de estado LOCAL
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
  },
  statusOpen: {
    backgroundColor: "#e5e7eb",
    borderColor: "#9ca3af",
  },
  statusInProgress: {
    backgroundColor: "#DBEAFE",
    borderColor: "#3b82f6",
  },
  statusDone: {
    backgroundColor: "#dcfce7",
    borderColor: "#22c55e",
  },
  statusList: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  statusOption: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  statusOptionText: {
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

// /** Miembros del workspace que se pueden elegir para asignar */
// type MemberOption = {
//   id: string;
//   name: string;
//   email?: string | null;
// };

// /** Extiende Activity (ya trae created_by_* y assigned_to_* desde la API) */
// type ActivityWithCreator = Activity;

// /** Filtro genérico por entidad relacionada */
// export type ActivityFilters = {
//   deal_id?: string;
//   account_id?: string;
//   contact_id?: string;
//   lead_id?: string;
//   // ignoramos status a propósito para no ocultar “done”
//   status?: Activity["status"];
// };

// /* Claves de almacenamiento */
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

// /* Helpers maestro */
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
//   /** Opcional: lista de usuarios del workspace para asignar tareas (solo al crear) */
//   members?: MemberOption[];
// }) {
//   const { title = "Actividades", filters, createDefaults, members } = props;
//   const qc = useQueryClient();
//   const [newTitle, setNewTitle] = useState("");

//   // Estado para asignación de NUEVA actividad (solo al crear)
//   const [assignedTo, setAssignedTo] = useState<string | null>(null);
//   const [assignPickerOpen, setAssignPickerOpen] = useState(false);

//   // Estado local para marcar visualmente como "realizada" (persistido por scope)
//   const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
//   const storageKey = useMemo(() => completedKey(filters), [filters]);

//   // Quitamos 'status' del filtro base: queremos todo (open + done)
//   const baseFilters = useMemo(() => {
//     const { status: _omit, ...rest } = (filters ?? {}) as any;
//     return rest as Omit<ActivityFilters, "status">;
//   }, [filters]);

//   // Una sola query: no filtramos por status
//   const q = useQuery<ActivityWithCreator[]>({
//     queryKey: ["activities", baseFilters],
//     queryFn: () => listActivities(baseFilters) as Promise<ActivityWithCreator[]>,
//     enabled: Object.keys(baseFilters).length > 0,
//     select(rows) {
//       const all = [...(rows ?? [])];
//       all.sort((a, b) => {
//         const ua = a.updated_at ?? 0;
//         const ub = b.updated_at ?? 0;
//         if (ub !== ua) return ub - ua;
//         return String(a.id).localeCompare(String(b.id));
//       });
//       return all;
//     },
//   });

//   // Cargar marcas desde AsyncStorage al montar / cambiar de scope
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

//   // Si cambia la lista del servidor, depuramos ids huérfanos y re-guardamos
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
//       AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(next))).catch(
//         () => {}
//       );
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
//         assigned_to: assignedTo ?? undefined,
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
//       setCompletedIds((prev) => {
//         if (!prev.has(id)) return prev;
//         const next = new Set(prev);
//         next.delete(id);
//         persistCompleted(next);
//         return next;
//       });
//       await removeFromMasterCompleted(id);
//       await invalidate();
//     },
//   });

//   // Acción local: marcar visualmente como realizada (y persistir + maestro)
//   const markAsCompleted = (id: string) => {
//     setCompletedIds((prev) => {
//       if (prev.has(id)) return prev;
//       const next = new Set(prev);
//       next.add(id);
//       persistCompleted(next);
//       addToMasterCompleted(id);
//       return next;
//     });
//   };

//   const selectedMember =
//     members && members.length > 0
//       ? members.find((m) => m.id === assignedTo) ?? null
//       : null;

//   const assignedLabel = selectedMember
//     ? `Asignar: ${selectedMember.name}`
//     : "Asignar: sin asignar";

//   return (
//     <View style={S.box}>
//       <Text style={S.title}>{title}</Text>

//       {/* Fila de creación: input + (selector de asignación) + botón Crear */}
//       <View style={[S.row, { gap: 8, flexWrap: "wrap" }]}>
//         <TextInput
//           style={[S.input]}
//           placeholder="Nueva tarea…"
//           placeholderTextColor="#475569"
//           value={newTitle}
//           onChangeText={setNewTitle}
//         />

//         {members && members.length > 0 && (
//           <View style={{ flexDirection: "column" }}>
//             <Pressable
//               style={S.assignChip}
//               onPress={() => setAssignPickerOpen((v) => !v)}
//             >
//               <Text style={S.assignChipText}>{assignedLabel}</Text>
//             </Pressable>

//             {assignPickerOpen && (
//               <View style={S.assignList}>
//                 <Pressable
//                   style={S.assignOption}
//                   onPress={() => {
//                     setAssignedTo(null);
//                     setAssignPickerOpen(false);
//                   }}
//                 >
//                   <Text style={S.assignOptionText}>Sin asignar</Text>
//                 </Pressable>
//                 {members.map((m) => (
//                   <Pressable
//                     key={m.id}
//                     style={S.assignOption}
//                     onPress={() => {
//                       setAssignedTo(m.id);
//                       setAssignPickerOpen(false);
//                     }}
//                   >
//                     <Text style={S.assignOptionText}>
//                       {m.name || m.email || m.id}
//                     </Text>
//                   </Pressable>
//                 ))}
//               </View>
//             )}
//           </View>
//         )}

//         <Pressable
//           style={[S.btn, S.btnPrimary, mCreate.isPending && { opacity: 0.7 }]}
//           onPress={() => mCreate.mutate()}
//           disabled={mCreate.isPending}
//         >
//           <Text style={S.btnText}>Crear</Text>
//         </Pressable>
//       </View>

//       {q.isLoading ? (
//         <Text style={{ color: "#475569", padding: 12 }}>
//           Cargando actividades…
//         </Text>
//       ) : q.isError ? (
//         <Text style={{ color: "#ef4444", padding: 12 }}>
//           Error cargando actividades.
//         </Text>
//       ) : (
//         <View>
//           {(q.data ?? []).map((a) => {
//             const isCompletedUI = completedIds.has(a.id);

//             const assignedInfo =
//               (a as any).assigned_to_name &&
//               (a as any).assigned_to_name.trim().length > 0
//                 ? ` · asignada a ${(a as any).assigned_to_name}`
//                 : (a as any).assigned_to &&
//                   String((a as any).assigned_to).trim().length > 0
//                 ? ` · asignada a ${(a as any).assigned_to}`
//                 : " · sin asignar";

//             const createdAtValue = (a as any).created_at as
//               | number
//               | string
//               | null
//               | undefined;

//             const createdLabel =
//               createdAtValue != null
//                 ? ` · creada el ${formatDate(createdAtValue)}`
//                 : "";

//             return (
//               <View
//                 key={a.id}
//                 style={[S.row, isCompletedUI && S.rowDone]}
//               >
//                 <View style={{ flex: 1 }}>
//                   <Text style={[S.itemTitle, isCompletedUI && S.itemTitleDone]}>
//                     {a.title}
//                   </Text>
//                   <Text style={[S.itemSub, isCompletedUI && S.itemSubDone]}>
//                     {a.type} · {a.status}
//                     {(a as any).created_by_name
//                       ? ` · por ${(a as any).created_by_name}`
//                       : ""}
//                     {assignedInfo}
//                     {createdLabel}
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
//             <Text style={{ color: "#475569", padding: 12 }}>
//               Sin actividades.
//             </Text>
//           )}
//         </View>
//       )}
//     </View>
//   );
// }

// // Helper para formatear created_at (ms desde epoch)
// function formatDate(value: number | string | null | undefined): string {
//   if (value == null) return "—";
//   const n = typeof value === "string" ? Number(value) : value;
//   if (!Number.isFinite(n)) return "—";
//   const d = new Date(n);
//   if (Number.isNaN(d.getTime())) return "—";
//   // Puedes ajustar el locale/formato a lo que prefieras
//   return d.toLocaleDateString();
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
//   badgeDoneText: {
//     color: "#fff",
//     fontWeight: "900",
//     fontSize: 11,
//     letterSpacing: 0.3,
//   },
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

//   // estilos del selector de asignación global (para creación)
//   assignChip: {
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: "#CBD5E1",
//     paddingVertical: 6,
//     paddingHorizontal: 10,
//     backgroundColor: "#f8fafc",
//     marginBottom: 4,
//   },
//   assignChipText: {
//     color: "#0F172A",
//     fontSize: 11,
//     fontWeight: "700",
//   },
//   assignList: {
//     marginTop: 4,
//     borderRadius: 10,
//     borderWidth: 1,
//     borderColor: "#CBD5E1",
//     backgroundColor: "#fff",
//     overflow: "hidden",
//   },
//   assignOption: {
//     paddingVertical: 6,
//     paddingHorizontal: 10,
//     borderBottomWidth: 1,
//     borderBottomColor: "#E2E8F0",
//   },
//   assignOptionText: {
//     fontSize: 12,
//     color: "#0F172A",
//   },
// });
