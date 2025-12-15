// src/components/RelatedActivities.tsx
import {
  deleteActivity,
  listActivities,
  type Activity,
} from "@/src/api/activities";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

/** Miembros del workspace (no se usan para crear aquí, pero dejamos el tipo) */
type MemberOption = {
  id: string;
  name: string;
  email?: string | null;
};

type ActivityWithCreator = Activity;

export type ActivityFilters = {
  deal_id?: string;
  account_id?: string;
  contact_id?: string;
  lead_id?: string;
  status?: Activity["status"];
};

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

function formatDate(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

/** Último bloque de notas (igual que en TasksList) */
function getLastNoteBlock(notes?: string | null): string | null {
  if (!notes) return null;

  const blocks = notes
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0) return null;
  return blocks[blocks.length - 1];
}

export default function RelatedActivities(props: {
  title?: string;
  filters: ActivityFilters;
  createDefaults?: Partial<Activity>;
  members?: MemberOption[];
}) {
  const { title = "Actividades", filters } = props;
  const qc = useQueryClient();
  const router = useRouter();

  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [inProgressIds, setInProgressIds] = useState<Set<string>>(new Set());
  const [masterCompletedIds, setMasterCompletedIds] = useState<Set<string>>(
    new Set()
  );
  const [masterInProgressIds, setMasterInProgressIds] = useState<Set<string>>(
    new Set()
  );
  const [statusRowId, setStatusRowId] = useState<string | null>(null);

  const storageKeyCompleted = useMemo(() => completedKey(filters), [filters]);
  const storageKeyInProgress = useMemo(() => inProgressKey(filters), [filters]);

  const baseFilters = useMemo(() => {
    const { status: _omit, ...rest } = (filters ?? {}) as any;
    return rest as Omit<ActivityFilters, "status">;
  }, [filters]);

  const q = useQuery<ActivityWithCreator[]>({
    queryKey: ["activities", baseFilters],
    queryFn: () =>
      listActivities(baseFilters) as Promise<ActivityWithCreator[]>,
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

  useEffect(() => {
    if (!q.data) return;
    const validIds = new Set(q.data.map((a) => a.id));

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

  const markAsCompleted = (id: string) => {
    setInProgressIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      persistInProgress(next);
      removeFromMasterInProgress(id);
      return next;
    });

    setCompletedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persistCompleted(next);
      addToMasterCompleted(id);
      return next;
    });
  };

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

  const markInProgress = (id: string) => {
    setCompletedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      persistCompleted(next);
      removeFromMasterCompleted(id);
      return next;
    });

    setInProgressIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persistInProgress(next);
      addToMasterInProgress(id);
      return next;
    });
  };

  const activities = q.data ?? [];

  return (
    <View style={S.box}>
      {/* Cabecera: ver + botón para ir a /tasks/new */}
      <View style={[S.rowHeader]}>
        <Text style={S.title}>{title}</Text>

        <Pressable
          style={[S.btn, S.btnPrimary]}
          onPress={() =>
            router.push({
              pathname: "/tasks/new",
              params: {
                contact_id: filters.contact_id,
                deal_id: filters.deal_id,
                account_id: filters.account_id,
                lead_id: filters.lead_id,
              },
            })
          }
        >
          <Text style={S.btnText}>Crear actividad</Text>
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
      ) : activities.length === 0 ? (
        <Text style={{ color: "#475569", padding: 12 }}>Sin actividades.</Text>
      ) : (
        // 🔽 Contenedor con scroll y altura limitada (aprox. 5 filas)
        <View style={S.listWrapper}>
          <ScrollView
            style={S.scroll}
            nestedScrollEnabled
            contentContainerStyle={S.listContent}
          >
            {activities.map((a) => {
              const isCompletedUI =
                completedIds.has(a.id) || masterCompletedIds.has(a.id);

              const isInProgressUI =
                !isCompletedUI &&
                (inProgressIds.has(a.id) || masterInProgressIds.has(a.id));

              const assignedNames: string[] = [];

              if ((a as any).assigned_to_name) {
                assignedNames.push((a as any).assigned_to_name);
              } else if ((a as any).assigned_to) {
                assignedNames.push(String((a as any).assigned_to));
              }

              if ((a as any).assigned_to_2_name) {
                assignedNames.push((a as any).assigned_to_2_name);
              } else if ((a as any).assigned_to_2) {
                assignedNames.push(String((a as any).assigned_to_2));
              }

              const assignedInfo =
                assignedNames.length > 0
                  ? " · asignada a " + assignedNames.join(" y ")
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

              // 👉 Última nota de esta actividad (si existe)
              const lastNoteBlock = getLastNoteBlock((a as any).notes);

              return (
                <View
                  key={a.id}
                  style={[
                    S.row,
                    isCompletedUI && S.rowDone,
                    !isCompletedUI && isInProgressUI && S.rowInProgress,
                  ]}
                >
                  {/* Bloque principal clicable → abre detalle de la actividad */}
                  <Pressable
                    style={{ flex: 1 }}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: "/tasks/[id]",
                        params: { id: a.id },
                      })
                    }
                  >
                    <Text
                      style={[
                        S.itemTitle,
                        isCompletedUI && S.itemTitleDone,
                        !isCompletedUI &&
                          isInProgressUI &&
                          S.itemTitleInProgress,
                      ]}
                      numberOfLines={2}
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
                      numberOfLines={3}
                    >
                      {a.type} · {statusLabel}
                      {(a as any).created_by_name
                        ? ` · por ${(a as any).created_by_name}`
                        : ""}
                      {assignedInfo}
                      {createdLabel}
                      {isCompletedUI ? " · tarea completada" : ""}
                    </Text>

                    {lastNoteBlock && (
                      <Text style={S.itemSubNote} numberOfLines={2}>
                        {lastNoteBlock}
                      </Text>
                    )}

                    {isCompletedUI ? (
                      <View style={S.badgeDone}>
                        <Text style={S.badgeDoneText}>Completado</Text>
                      </View>
                    ) : null}
                  </Pressable>

                  {/* Columna derecha: estado + borrar (no clican el detalle) */}
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
                        <Pressable
                          style={S.statusOption}
                          onPress={() => {
                            markAsOpen(a.id);
                            setStatusRowId(null);
                          }}
                        >
                          <Text style={S.statusOptionText}>Abierta</Text>
                        </Pressable>

                        <Pressable
                          style={S.statusOption}
                          onPress={() => {
                            markInProgress(a.id);
                            setStatusRowId(null);
                          }}
                        >
                          <Text style={S.statusOptionText}>En proceso</Text>
                        </Pressable>

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

                  <Pressable
                    style={[S.btn, S.btnDanger]}
                    onPress={() => mDel.mutate(a.id)}
                  >
                    <Text style={S.btnText}>Borrar</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
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
  rowHeader: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#CBD5E1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: { color: "#0F172A", fontWeight: "900", fontSize: 16 },

  // 🔽 contenedor con scroll para las actividades
  listWrapper: {
    maxHeight: 380, // aprox. 5 filas; ajusta si lo ves muy alto/bajo
  },
  scroll: {
    maxHeight: 380,
  },
  listContent: {
    paddingBottom: 4,
  },

  row: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#CBD5E1",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowInProgress: {
    backgroundColor: "#DBEAFE",
    borderTopColor: "#BFDBFE",
  },
  rowDone: {
    backgroundColor: "#E8F7EE",
    borderTopColor: "#C7E8D2",
  },
  itemTitle: { color: "#0F172A", fontWeight: "800" },
  itemTitleInProgress: { color: "#1d4ed8" },
  itemTitleDone: { color: "#16a34a" },
  itemSub: { color: "#475569", fontSize: 12, marginBottom: 2 },
  itemSubInProgress: { color: "#1d4ed8" },
  itemSubDone: { color: "#16a34a" },

  // Nota, mismo tono que itemSub
  itemSubNote: {
    color: "#475569",
    fontSize: 11,
    marginBottom: 4,
  },

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
