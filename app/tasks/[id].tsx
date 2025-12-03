// app/tasks/[id].tsx
import { updateActivity } from "@/src/api/activities";
import {
  listTenantMembers,
  type TenantMember,
} from "@/src/api/tenants";

import { listAccounts } from "@/src/api/accounts";
import {
  deleteActivity,
  getActivity,
  listActivities,
  type Activity,
  type ActivityStatus,
} from "@/src/api/activities";
import { listContacts } from "@/src/api/contacts";
import { listDeals } from "@/src/api/deals";
import { listLeads } from "@/src/api/leads";
import Confirm from "@/src/ui/Confirm";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

/* 🎨 Paleta */
const PRIMARY = "#7C3AED";
const ACCENT = "#22D3EE";
const BG = "#0F1115";
const CARD = "#171923";
const BORDER = "#2B3140";
const TEXT = "#F3F4F6";
const SUBTLE = "#A4ADBD";
const DANGER = "#EF4444";
const SUCCESS = "#16a34a";

/** Estados permitidos */
type Status = ActivityStatus; // "open" | "done" | "canceled"

/** Activity enriquecida */
type ActivityWithCreator = Activity & {
  created_by_name?: string | null;
  created_by_email?: string | null;
  assigned_to_name?: string | null;
  assigned_to_2_name?: string | null;
};

/** Maestro global de completadas por UI */
const MASTER_COMPLETED_KEY = "completedActivities:v1:all";
const MASTER_INPROGRESS_KEY = "inProgressActivities:v1:all";

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [completedMaster, setCompletedMaster] = useState<Set<string>>(new Set());
  const [inProgressMaster, setInProgressMaster] = useState<Set<string>>(new Set());

  // dropdown de estado
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  // 👇 Estado LOCAL solo visual para el dropdown (lo dejamos por si luego vuelves a usar badges)
  const [localStatus, setLocalStatus] = useState<Status | null>(null);

  // Cargar maestro UI
  useEffect(() => {
    (async () => {
      try {
        const [rawCompleted, rawInProgress] = await Promise.all([
          AsyncStorage.getItem(MASTER_COMPLETED_KEY),
          AsyncStorage.getItem(MASTER_INPROGRESS_KEY),
        ]);

        setCompletedMaster(new Set(rawCompleted ? JSON.parse(rawCompleted) : []));
        setInProgressMaster(new Set(rawInProgress ? JSON.parse(rawInProgress) : []));
      } catch {
        setCompletedMaster(new Set());
        setInProgressMaster(new Set());
      }
    })();
  }, []);

  // Detalle
  const qAct = useQuery<ActivityWithCreator>({
    queryKey: ["activity", id],
    queryFn: () => getActivity(id!),
    enabled: !!id,
  });

  // Lista completa (para rellenar datos que vienen en index)
  useQuery<ActivityWithCreator[]>({
    queryKey: ["activities-all"],
    queryFn: () => listActivities() as Promise<ActivityWithCreator[]>,
    enabled: false,
  });

  // Catálogos
  const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
  const qDeal = useQuery({ queryKey: ["deals"], queryFn: listDeals });
  const qLead = useQuery({ queryKey: ["leads"], queryFn: listLeads });

  // Miembros del workspace actual (para reasignar)
  const qMembers = useQuery<TenantMember[]>({
    queryKey: ["tenant-members"],
    queryFn: listTenantMembers,
  });

  // Helpers UI maestro: solo visual, sin tocar backend
  const markAsOpen = (actId: string) => {
    // quitar de completadas
    setCompletedMaster((prev) => {
      if (!prev.has(actId)) return prev;
      const next = new Set(prev);
      next.delete(actId);
      AsyncStorage.setItem(
        MASTER_COMPLETED_KEY,
        JSON.stringify(Array.from(next))
      ).catch(() => {});
      return next;
    });
    // quitar de en proceso
    setInProgressMaster((prev) => {
      if (!prev.has(actId)) return prev;
      const next = new Set(prev);
      next.delete(actId);
      AsyncStorage.setItem(
        MASTER_INPROGRESS_KEY,
        JSON.stringify(Array.from(next))
      ).catch(() => {});
      return next;
    });
  };

  const markAsCompleted = (actId: string) => {
    // quitar de en proceso
    setInProgressMaster((prev) => {
      if (!prev.has(actId)) return prev;
      const next = new Set(prev);
      next.delete(actId);
      AsyncStorage.setItem(
        MASTER_INPROGRESS_KEY,
        JSON.stringify(Array.from(next))
      ).catch(() => {});
      return next;
    });
    // agregar a completadas
    setCompletedMaster((prev) => {
      if (prev.has(actId)) return prev;
      const next = new Set(prev);
      next.add(actId);
      AsyncStorage.setItem(
        MASTER_COMPLETED_KEY,
        JSON.stringify(Array.from(next))
      ).catch(() => {});
      return next;
    });
  };

  const markInProgress = (actId: string) => {
    // quitar de completadas
    setCompletedMaster((prev) => {
      if (!prev.has(actId)) return prev;
      const next = new Set(prev);
      next.delete(actId);
      AsyncStorage.setItem(
        MASTER_COMPLETED_KEY,
        JSON.stringify(Array.from(next))
      ).catch(() => {});
      return next;
    });
    // ✅ agregar a en proceso (aquí estaba el bug: antes no agregaba si no existía)
    setInProgressMaster((prev) => {
      if (prev.has(actId)) return prev;
      const next = new Set(prev);
      next.add(actId);
      AsyncStorage.setItem(
        MASTER_INPROGRESS_KEY,
        JSON.stringify(Array.from(next))
      ).catch(() => {});
      return next;
    });
  };

  const mDelete = useMutation({
    mutationFn: async () => deleteActivity(id!),
    onSuccess: async () => {
      const next = new Set(completedMaster);
      if (next.delete(id!)) {
        setCompletedMaster(next);
        try {
          await AsyncStorage.setItem(
            MASTER_COMPLETED_KEY,
            JSON.stringify([...next])
          );
        } catch {}
      }
      await qc.invalidateQueries({ queryKey: ["activities-all"] });
      await qc.invalidateQueries({ queryKey: ["activities"] });
      router.back();
    },
    onError: () =>
      alert("No se pudo eliminar la actividad. Intenta nuevamente."),
  });

    // 🔁 Reasignar (0, 1 o 2 personas)
  const mReassign = useMutation({
    // Ahora mandamos también notas y relaciones para que NO se pierdan
    mutationFn: async (payload: {
      assigned_to: string | null;
      assigned_to_2: string | null;
      title?: string | null;
      notes?: string | null;
      account_id?: string | null;
      contact_id?: string | null;
      deal_id?: string | null;
      lead_id?: string | null;
    }) => {
      if (!id) throw new Error("Missing activity id");
      // 👇 Aquí forzamos el tipo para que TS no moleste
      await updateActivity(id, payload as any);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["activity", id] });
      await qc.invalidateQueries({ queryKey: ["activities"] });
      await qc.invalidateQueries({ queryKey: ["activities-all"] });
    },
    onError: (err) => {
      alert(
        "No se pudo reasignar la actividad. Intenta nuevamente.\n\n" +
          String((err as any)?.message ?? err)
      );
    },
  });


  // Buscar en cache de la lista para rellenar
  const listAll =
    (qc.getQueryData<ActivityWithCreator[]>(["activities-all"]) ?? []) as
      | ActivityWithCreator[]
      | [];
  const fromList = listAll.find((a) => a.id === id);

  const activity: ActivityWithCreator | undefined = qAct.data
    ? ({ ...(fromList || {}), ...qAct.data } as ActivityWithCreator)
    : fromList;

  // Toggle de asignación para un miembro (máx. 2 personas)
  const toggleAssignedMember = (memberId: string) => {
    if (!activity) return;

    let primary = activity.assigned_to ?? null;
    let secondary = activity.assigned_to_2 ?? null;

    const isPrimary = primary === memberId;
    const isSecondary = secondary === memberId;

    if (isPrimary) {
      // Si ya es primary → quitarlo
      primary = null;
    } else if (isSecondary) {
      // Si ya es secondary → quitarlo
      secondary = null;
    } else {
      // No está asignado aún
      if (!primary) {
        primary = memberId;
      } else if (!secondary) {
        secondary = memberId;
      } else {
        // Ya hay 2 asignados → reemplazamos el secundario
        secondary = memberId;
      }
    }

    // ✅ Mandamos también notas y relaciones actuales para no perderlas
    mReassign.mutate({
      assigned_to: primary,
      assigned_to_2: secondary,
      title: activity.title ?? null,
      notes: activity.notes ?? null,
      account_id: activity.account_id ?? null,
      contact_id: activity.contact_id ?? null,
      deal_id: activity.deal_id ?? null,
      lead_id: activity.lead_id ?? null,
    });
  };

  // Chips “Relacionado con…”
  const contextChips = useMemo(() => {
    if (!activity) return [];
    const cs: { label: string; href: string }[] = [];
    if (activity.account_id) {
      const name =
        (qAcc.data ?? []).find((x) => x.id === activity.account_id)?.name ??
        activity.account_id;
      cs.push({
        label: `Cuenta: ${name}`,
        href: `/accounts/${activity.account_id}`,
      });
    }
    if (activity.contact_id) {
      const name =
        (qCon.data ?? []).find((x) => x.id === activity.contact_id)?.name ??
        activity.contact_id;
      cs.push({
        label: `Contacto: ${name}`,
        href: `/contacts/${activity.contact_id}`,
      });
    }
    if (activity.deal_id) {
      const name =
        (qDeal.data ?? []).find((x) => x.id === activity.deal_id)?.title ??
        activity.deal_id;
      cs.push({
        label: `Oportunidad: ${name}`,
        href: `/deals/${activity.deal_id}`,
      });
    }
    if (activity.lead_id) {
      const name =
        (qLead.data ?? []).find((x) => x.id === activity.lead_id)?.name ??
        activity.lead_id;
      cs.push({
        label: `Lead: ${name}`,
        href: `/leads/${activity.lead_id}`,
      });
    }
    return cs;
  }, [activity, qAcc.data, qCon.data, qDeal.data, qLead.data]);

  // ✅ done si viene del backend o si está marcado en UI
  const isDoneUI =
    activity?.status === "done" || completedMaster.has(activity?.id ?? "");

  // ✅ EN PROCESO si el backend dice "canceled" (tu significado)
  // o si la UI lo marcó
  const isInProgressUI =
    (!isDoneUI && activity?.status === "canceled") ||
    inProgressMaster.has(activity?.id ?? "");

  const statusLabel = isDoneUI
    ? "Realizada"
    : isInProgressUI
    ? "En proceso"
    : "Abierta";

  // ——— Render ———
  return (
    <>
      <Stack.Screen
        options={{
          title: "Detalle Actividad",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
          headerRight: () => (
            <Pressable
              onPress={() => setShowConfirm(true)}
              hitSlop={8}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ color: DANGER, fontWeight: "900" }}>
                Eliminar
              </Text>
            </Pressable>
          ),
        }}
      />

      <View style={styles.screen}>
        {qAct.isLoading && !activity ? (
          <View style={{ alignItems: "center", paddingTop: 12 }}>
            <ActivityIndicator color={PRIMARY} />
            <Text style={styles.subtle}>Cargando…</Text>
          </View>
        ) : qAct.isError && !activity ? (
          <Text style={styles.error}>
            Error: {String((qAct.error as any)?.message || qAct.error)}
          </Text>
        ) : !activity ? (
          <Text style={styles.subtle}>No encontrado</Text>
        ) : (
          <>
            <View style={[styles.card, isDoneUI && styles.cardDone]}>
              {/* Título igual que en index */}
              <Text style={[styles.title, isDoneUI && styles.titleDone]}>
                {iconByType(activity.type)}{" "}
                {activity.title && activity.title.length > 0
                  ? activity.title
                  : "Sin título"}
              </Text>

              {/* Línea resumen: tipo, estado, creador, asignados, fecha de creación */}
              {(() => {
                const a = activity;
                const statusText = statusLabel;

                // Construimos lista de nombres asignados (1 o 2)
                const assignedNames: string[] = [];

                if (a.assigned_to_name) {
                  assignedNames.push(a.assigned_to_name);
                } else if (a.assigned_to) {
                  assignedNames.push(String(a.assigned_to));
                }

                if (a.assigned_to_2_name) {
                  assignedNames.push(a.assigned_to_2_name);
                } else if ((a as any).assigned_to_2) {
                  assignedNames.push(String((a as any).assigned_to_2));
                }

                const assignedInfo =
                  assignedNames.length === 0
                    ? " · sin asignar"
                    : assignedNames.length === 1
                    ? ` · asignada a ${assignedNames[0]}`
                    : ` · asignada a ${assignedNames[0]} y ${assignedNames[1]}`;

                const createdLabel = a.created_at
                  ? ` · creada el ${formatDateShort(a.created_at)}`
                  : "";

                return (
                  <Text
                    style={[styles.summary, isDoneUI && styles.summaryDone]}
                  >
                    {a.type} · {statusText}
                    {a.created_by_name ? ` · por ${a.created_by_name}` : ""}
                    {assignedInfo}
                    {createdLabel}
                    {isDoneUI ? " · tarea completada" : ""}
                  </Text>
                );
              })()}

              {/* Asignada a (detalle), mostrando 1 o 2 personas */}
              <Text style={styles.item}>
                <Text style={styles.itemLabel}>Asignada a: </Text>
                <Text style={styles.itemValue}>
                  {(() => {
                    const names: string[] = [];

                    if (activity.assigned_to_name) {
                      names.push(activity.assigned_to_name);
                    } else if (activity.assigned_to) {
                      names.push(String(activity.assigned_to));
                    }

                    if (activity.assigned_to_2_name) {
                      names.push(activity.assigned_to_2_name);
                    } else if ((activity as any).assigned_to_2) {
                      names.push(String((activity as any).assigned_to_2));
                    }

                    if (names.length === 0) return "Sin asignar";
                    if (names.length === 1) return names[0];
                    return `${names[0]} y ${names[1]}`;
                  })()}
                </Text>
              </Text>

              {/* Reasignar actividad: una sola sección, máx. 2 personas */}
              <View style={{ marginTop: 8, gap: 6 }}>
                <Text style={styles.itemLabel}>
                  Personas asignadas (máx. 2)
                </Text>

                {qMembers.isLoading && (
                  <Text style={styles.subtle}>Cargando miembros…</Text>
                )}

                {qMembers.isError && (
                  <Text style={styles.error}>
                    No se pudieron cargar los miembros.
                  </Text>
                )}

                {qMembers.data && qMembers.data.length > 0 && (
                  <View style={styles.membersRow}>
                    {qMembers.data.map((m) => {
                      const isAssigned =
                        activity.assigned_to === m.id ||
                        activity.assigned_to_2 === m.id;

                      return (
                        <Pressable
                          key={m.id}
                          style={[
                            styles.memberChip,
                            isAssigned && styles.memberChipActive,
                          ]}
                          onPress={() => toggleAssignedMember(m.id)}
                          disabled={mReassign.isPending}
                        >
                          <Text style={styles.memberChipText}>
                            {m.name || m.email || m.id}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {mReassign.isPending && (
                  <Text style={styles.subtleSmall}>Reasignando…</Text>
                )}
              </View>

              {/* Estado + dropdown (solo front) */}
              <View style={styles.stateRow}>
                <Text style={styles.itemLabel}>Estado: </Text>

                <View>
                  <Pressable
                    style={[
                      styles.statusChip,
                      isDoneUI
                        ? styles.statusDone
                        : isInProgressUI
                        ? styles.statusInProgress
                        : styles.statusOpen,
                    ]}
                    onPress={() => setStatusMenuOpen((v) => !v)}
                  >
                    <Text style={styles.statusChipText}>{statusLabel}</Text>
                  </Pressable>

                  {statusMenuOpen && (
                    <View style={styles.statusList}>
                      {/* Abierta */}
                      <Pressable
                        style={styles.statusOption}
                        onPress={() => {
                          if (!activity) return;
                          markAsOpen(activity.id);
                          setLocalStatus("open");
                          setStatusMenuOpen(false);
                        }}
                      >
                        <Text style={styles.statusOptionText}>Abierta</Text>
                      </Pressable>

                      {/* En proceso */}
                      <Pressable
                        style={styles.statusOption}
                        onPress={() => {
                          if (!activity) return;
                          markInProgress(activity.id);
                          setLocalStatus("canceled");
                          setStatusMenuOpen(false);
                        }}
                      >
                        <Text style={styles.statusOptionText}>En proceso</Text>
                      </Pressable>

                      {/* Realizada */}
                      <Pressable
                        style={styles.statusOption}
                        onPress={() => {
                          if (!activity) return;
                          markAsCompleted(activity.id);
                          setLocalStatus("done");
                          setStatusMenuOpen(false);
                        }}
                      >
                        <Text style={styles.statusOptionText}>Realizada</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>

              {/* Notas */}
              {!!activity.notes && (
                <Text style={styles.item}>
                  <Text style={styles.itemLabel}>Notas: </Text>
                  <Text style={styles.itemValue}>{activity.notes}</Text>
                </Text>
              )}

              {/* Relacionados */}
              {contextChips.length > 0 && (
                <View style={{ marginTop: 6, gap: 6 }}>
                  <Text style={[styles.itemLabel, { marginBottom: 2 }]}>
                    Relacionado con
                  </Text>
                  <View style={styles.chipsRow}>
                    {contextChips.map((c) => (
                      <Link key={c.href} href={c.href as any} asChild>
                        <Pressable
                          style={styles.chip}
                          accessibilityRole="link"
                          hitSlop={8}
                        >
                          <Text style={styles.chipText}>{c.label}</Text>
                        </Pressable>
                      </Link>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Solo botón eliminar abajo */}
            <Pressable
              style={[
                styles.btn,
                styles.btnDanger,
                mDelete.isPending && { opacity: 0.9 },
              ]}
              onPress={() => setShowConfirm(true)}
              disabled={mDelete.isPending}
            >
              <Text style={styles.btnText}>
                {mDelete.isPending ? "Eliminando…" : "Eliminar"}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      <Confirm
        visible={showConfirm}
        title="Eliminar actividad"
        message="¿Seguro que deseas eliminar esta actividad?"
        confirmText="Eliminar"
        cancelText="Cancelar"
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          mDelete.mutate();
        }}
      />
    </>
  );
}

/* ——— Helpers ——— */
function iconByType(t: "task" | "call" | "meeting" | "note") {
  if (t === "call") return "📞";
  if (t === "meeting") return "📅";
  if (t === "note") return "📝";
  return "✅";
}
function labelByType(t: "task" | "call" | "meeting" | "note") {
  if (t === "call") return "Llamada";
  if (t === "meeting") return "Reunión";
  if (t === "note") return "Nota>";
  return "Tarea";
}

function labelStatus(s?: Status): string {
  if (!s || s === "open") return "Abierta";
  if (s === "done") return "Realizada";
  if (s === "canceled") return "En proceso";
  return String(s);
}

function labelByStatus(s: Status, isDoneUI: boolean) {
  if (isDoneUI || s === "done") return "Realizada";
  if (s === "open") return "Abierta";
  if (s === "canceled") return "En proceso";
  return "Abierta";
}

function badgeByType(
  t: "task" | "call" | "meeting" | "note",
  isDoneUI: boolean
) {
  const base = {
    borderColor: "#2d3340",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: TEXT,
  };
  if (isDoneUI)
    return {
      ...base,
      borderColor: SUCCESS,
      backgroundColor: "rgba(22,163,74,0.12)",
    };
  if (t === "call")
    return {
      ...base,
      borderColor: ACCENT,
      backgroundColor: "rgba(34,211,238,0.10)",
    };
  if (t === "meeting")
    return {
      ...base,
      borderColor: "#10b981",
      backgroundColor: "rgba(16,185,129,0.12)",
    };
  if (t === "note")
    return {
      ...base,
      borderColor: "#f59e0b",
      backgroundColor: "rgba(245,158,11,0.10)",
    };
  return {
    ...base,
    borderColor: PRIMARY,
    backgroundColor: "rgba(124,58,237,0.10)",
  };
}

function badgeByStatus(s: Status, isDoneUI: boolean) {
  const base = {
    borderColor: "#2d3340",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: TEXT,
  };
  if (isDoneUI || s === "done")
    return {
      ...base,
      borderColor: SUCCESS,
      backgroundColor: "rgba(22,163,74,0.12)",
    };
  if (s === "canceled")
    return {
      ...base,
      borderColor: "#3b82f6",
      backgroundColor: "rgba(37,99,235,0.12)",
    }; // azul “En proceso”
  return {
    ...base,
    borderColor: PRIMARY,
    backgroundColor: "rgba(124,58,237,0.10)",
  };
}

function formatDateTime(ms?: number | null) {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatDateShort(
  value?: number | string | null
): string {
  if (value == null) return "—";

  // Si es número o string numérico (timestamp)
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "—";
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString();
  }

  // Si es un string tipo "2025-12-03T15:20:00Z"
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}


/* ——— Estilos ——— */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },

  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  cardDone: {
    borderColor: SUCCESS,
    backgroundColor: "rgba(22,163,74,0.08)",
  },

  title: { fontSize: 20, fontWeight: "900", color: TEXT },
  titleDone: { color: SUCCESS },

  summary: { color: SUBTLE, fontSize: 12 },
  summaryDone: { color: SUCCESS },

  creator: { color: SUBTLE, fontSize: 12 },
  creatorDone: { color: SUCCESS },

  meta: { color: SUBTLE, fontSize: 12 },
  metaDone: { color: SUCCESS },

  label: { color: SUBTLE, fontWeight: "700" },
  labelStrong: { color: TEXT, fontWeight: "900" },

  rowWrap: { flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" },

  item: { color: SUBTLE },
  itemLabel: { color: SUBTLE, fontWeight: "700" },
  itemValue: { color: TEXT, fontWeight: "700" },

  // Fila de estado
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },

  // Dropdown de estado
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

  badgeSoft: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: TEXT,
  } as any,

  badgeSolidDone: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: SUCCESS,
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
  } as any,

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#1a1b2a",
  },
  chipText: { color: "#E5E7EB", fontWeight: "800", fontSize: 12 },

  btn: { padding: 12, borderRadius: 12, alignItems: "center" },
  btnDanger: { backgroundColor: DANGER },

  btnText: { color: "#fff", fontWeight: "900" },

  subtle: { color: SUBTLE },
  subtleSmall: { color: SUBTLE, fontSize: 11 },
  error: { color: "#fecaca" },

  membersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  memberChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#1F2937",
  },
  memberChipActive: {
    borderColor: PRIMARY,
    backgroundColor: "rgba(124,58,237,0.25)",
  },
  memberChipText: {
    color: TEXT,
    fontWeight: "700",
    fontSize: 12,
  },
});



// // app/tasks/[id].tsx
// import { updateActivity } from "@/src/api/activities";
// import {
//   listTenantMembers,
//   type TenantMember,
// } from "@/src/api/tenants";

// import { listAccounts } from "@/src/api/accounts";
// import {
//   deleteActivity,
//   getActivity,
//   listActivities,
//   type Activity,
//   type ActivityStatus,
// } from "@/src/api/activities";
// import { listContacts } from "@/src/api/contacts";
// import { listDeals } from "@/src/api/deals";
// import { listLeads } from "@/src/api/leads";
// import Confirm from "@/src/ui/Confirm";
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { Link, router, Stack, useLocalSearchParams } from "expo-router";
// import { useEffect, useMemo, useState } from "react";
// import {
//   ActivityIndicator,
//   Pressable,
//   StyleSheet,
//   Text,
//   View,
// } from "react-native";

// /* 🎨 Paleta */
// const PRIMARY = "#7C3AED";
// const ACCENT = "#22D3EE";
// const BG = "#0F1115";
// const CARD = "#171923";
// const BORDER = "#2B3140";
// const TEXT = "#F3F4F6";
// const SUBTLE = "#A4ADBD";
// const DANGER = "#EF4444";
// const SUCCESS = "#16a34a";

// /** Estados permitidos */
// type Status = ActivityStatus; // "open" | "done" | "canceled"

// /** Activity enriquecida */
// type ActivityWithCreator = Activity & {
//   created_by_name?: string | null;
//   created_by_email?: string | null;
//   assigned_to_name?: string | null;
//   assigned_to_2_name?: string | null;
// };

// /** Maestro global de completadas por UI */
// const MASTER_COMPLETED_KEY = "completedActivities:v1:all";
// const MASTER_INPROGRESS_KEY = "inProgressActivities:v1:all";

// export default function TaskDetail() {
//   const { id } = useLocalSearchParams<{ id: string }>();
//   const qc = useQueryClient();
//   const [showConfirm, setShowConfirm] = useState(false);
//   const [completedMaster, setCompletedMaster] = useState<Set<string>>(new Set());
//   const [inProgressMaster, setInProgressMaster] = useState<Set<string>>(new Set());

//   // dropdown de estado
//   const [statusMenuOpen, setStatusMenuOpen] = useState(false);

//   // 👇 Estado LOCAL solo visual para el dropdown
//   const [localStatus, setLocalStatus] = useState<Status | null>(null);

//   // Cargar maestro UI
//   useEffect(() => {
//     (async () => {
//       try {
//         const [rawCompleted, rawInProgress] = await Promise.all([
//           AsyncStorage.getItem(MASTER_COMPLETED_KEY),
//           AsyncStorage.getItem(MASTER_INPROGRESS_KEY),
//         ]);

//         setCompletedMaster(new Set(rawCompleted ? JSON.parse(rawCompleted) : []));
//         setInProgressMaster(new Set(rawInProgress ? JSON.parse(rawInProgress) : []));
//       } catch {
//         setCompletedMaster(new Set());
//         setInProgressMaster(new Set());
//       }
//     })();
//   }, []);

//   // Detalle
//   const qAct = useQuery<ActivityWithCreator>({
//     queryKey: ["activity", id],
//     queryFn: () => getActivity(id!),
//     enabled: !!id,
//   });

//   // Lista completa (para rellenar datos que vienen en index)
//   useQuery<ActivityWithCreator[]>({
//     queryKey: ["activities-all"],
//     queryFn: () => listActivities() as Promise<ActivityWithCreator[]>,
//     enabled: false,
//   });

//   // Catálogos
//   const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
//   const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
//   const qDeal = useQuery({ queryKey: ["deals"], queryFn: listDeals });
//   const qLead = useQuery({ queryKey: ["leads"], queryFn: listLeads });

//   // Miembros del workspace actual (para reasignar)
//   const qMembers = useQuery<TenantMember[]>({
//     queryKey: ["tenant-members"],
//     queryFn: listTenantMembers,
//   });

//   // Helpers UI maestro: solo visual, sin tocar backend
//   const markAsOpen = (actId: string) => {
//     // quitar de completadas
//     setCompletedMaster((prev) => {
//       if (!prev.has(actId)) return prev;
//       const next = new Set(prev);
//       next.delete(actId);
//       AsyncStorage.setItem(
//         MASTER_COMPLETED_KEY,
//         JSON.stringify(Array.from(next))
//       ).catch(() => {});
//       return next;
//     });
//     // quitar de en proceso
//     setInProgressMaster((prev) => {
//       if (!prev.has(actId)) return prev;
//       const next = new Set(prev);
//       next.delete(actId);
//       AsyncStorage.setItem(
//         MASTER_INPROGRESS_KEY,
//         JSON.stringify(Array.from(next))
//       ).catch(() => {});
//       return next;
//     });
//   };

//   const markAsCompleted = (actId: string) => {
//     // quitar de en proceso
//     setInProgressMaster((prev) => {
//       if (!prev.has(actId)) return prev;
//       const next = new Set(prev);
//       next.delete(actId);
//       AsyncStorage.setItem(
//         MASTER_INPROGRESS_KEY,
//         JSON.stringify(Array.from(next))
//       ).catch(() => {});
//       return next;
//     });
//     // agregar a completadas
//     setCompletedMaster((prev) => {
//       if (prev.has(actId)) return prev;
//       const next = new Set(prev);
//       next.add(actId);
//       AsyncStorage.setItem(
//         MASTER_COMPLETED_KEY,
//         JSON.stringify(Array.from(next))
//       ).catch(() => {});
//       return next;
//     });
//   };

//   const markInProgress = (actId: string) => {
//     // quitar de completadas
//     setCompletedMaster((prev) => {
//       if (!prev.has(actId)) return prev;
//       const next = new Set(prev);
//       next.delete(actId);
//       AsyncStorage.setItem(
//         MASTER_COMPLETED_KEY,
//         JSON.stringify(Array.from(next))
//       ).catch(() => {});
//       return next;
//     });
//     // agregar a en proceso
//     setInProgressMaster((prev) => {
//       if (!prev.has(actId)) return prev;
//       const next = new Set(prev);
//       next.add(actId);
//       AsyncStorage.setItem(
//         MASTER_INPROGRESS_KEY,
//         JSON.stringify(Array.from(next))
//       ).catch(() => {});
//       return next;
//     });
//   };

//   const mDelete = useMutation({
//     mutationFn: async () => deleteActivity(id!),
//     onSuccess: async () => {
//       const next = new Set(completedMaster);
//       if (next.delete(id!)) {
//         setCompletedMaster(next);
//         try {
//           await AsyncStorage.setItem(
//             MASTER_COMPLETED_KEY,
//             JSON.stringify([...next])
//           );
//         } catch {}
//       }
//       await qc.invalidateQueries({ queryKey: ["activities-all"] });
//       await qc.invalidateQueries({ queryKey: ["activities"] });
//       router.back();
//     },
//     onError: () =>
//       alert("No se pudo eliminar la actividad. Intenta nuevamente."),
//   });

//   // 🔁 Reasignar (0, 1 o 2 personas)
//   const mReassign = useMutation({
//     // ⚠️ CAMBIO: agregamos title opcional al payload para que no se pierda
//     mutationFn: async (payload: {
//       assigned_to: string | null;
//       assigned_to_2: string | null;
//       title?: string;
//     }) => {
//       if (!id) throw new Error("Missing activity id");
//       await updateActivity(id, payload);
//     },
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["activity", id] });
//       await qc.invalidateQueries({ queryKey: ["activities"] });
//       await qc.invalidateQueries({ queryKey: ["activities-all"] });
//     },
//     onError: (err) => {
//       alert(
//         "No se pudo reasignar la actividad. Intenta nuevamente.\n\n" +
//           String((err as any)?.message ?? err)
//       );
//     },
//   });

//   // Buscar en cache de la lista para rellenar
//   const listAll =
//     (qc.getQueryData<ActivityWithCreator[]>(["activities-all"]) ?? []) as
//       | ActivityWithCreator[]
//       | [];
//   const fromList = listAll.find((a) => a.id === id);

//   const activity: ActivityWithCreator | undefined = qAct.data
//     ? ({ ...(fromList || {}), ...qAct.data } as ActivityWithCreator)
//     : fromList;

//   // Toggle de asignación para un miembro (máx. 2 personas)
//   const toggleAssignedMember = (memberId: string) => {
//     if (!activity) return;

//     let primary = activity.assigned_to ?? null;
//     let secondary = activity.assigned_to_2 ?? null;

//     const isPrimary = primary === memberId;
//     const isSecondary = secondary === memberId;

//     if (isPrimary) {
//       // Si ya es primary → quitarlo
//       primary = null;
//     } else if (isSecondary) {
//       // Si ya es secondary → quitarlo
//       secondary = null;
//     } else {
//       // No está asignado aún
//       if (!primary) {
//         primary = memberId;
//       } else if (!secondary) {
//         secondary = memberId;
//       } else {
//         // Ya hay 2 asignados → reemplazamos el secundario
//         secondary = memberId;
//       }
//     }

//     // ⚠️ CAMBIO: mandamos también el título actual para que el backend no lo pise
//     mReassign.mutate({
//       assigned_to: primary,
//       assigned_to_2: secondary,
//       title: activity.title,
//     });
//   };

//   // Estado efectivo solo para UI
//   const currentStatus: Status = (localStatus ??
//     (activity?.status as Status) ??
//     "open") as Status;

//   // Chips “Relacionado con…”
//   const contextChips = useMemo(() => {
//     if (!activity) return [];
//     const cs: { label: string; href: string }[] = [];
//     if (activity.account_id) {
//       const name =
//         (qAcc.data ?? []).find((x) => x.id === activity.account_id)?.name ??
//         activity.account_id;
//       cs.push({
//         label: `Cuenta: ${name}`,
//         href: `/accounts/${activity.account_id}`,
//       });
//     }
//     if (activity.contact_id) {
//       const name =
//         (qCon.data ?? []).find((x) => x.id === activity.contact_id)?.name ??
//         activity.contact_id;
//       cs.push({
//         label: `Contacto: ${name}`,
//         href: `/contacts/${activity.contact_id}`,
//       });
//     }
//     if (activity.deal_id) {
//       const name =
//         (qDeal.data ?? []).find((x) => x.id === activity.deal_id)?.title ??
//         activity.deal_id;
//       cs.push({
//         label: `Oportunidad: ${name}`,
//         href: `/deals/${activity.deal_id}`,
//       });
//     }
//     if (activity.lead_id) {
//       const name =
//         (qLead.data ?? []).find((x) => x.id === activity.lead_id)?.name ??
//         activity.lead_id;
//       cs.push({
//         label: `Lead: ${name}`,
//         href: `/leads/${activity.lead_id}`,
//       });
//     }
//     return cs;
//   }, [activity, qAcc.data, qCon.data, qDeal.data, qLead.data]);

// // done si viene del backend o si está marcado en UI
// const isDoneUI =
//   activity?.status === "done" || completedMaster.has(activity?.id ?? "");

// // EN PROCESO si el backend dice "canceled" (tu significado)
// // o si la UI lo marcó
// const isInProgressUI =
//   (!isDoneUI && activity?.status === "canceled") ||
//   inProgressMaster.has(activity?.id ?? "");


//   const statusLabel = isDoneUI
//     ? "Realizada"
//     : isInProgressUI
//     ? "En proceso"
//     : "Abierta";

//   // ——— Render ———
//   return (
//     <>
//       <Stack.Screen
//         options={{
//           title: "Detalle Actividad",
//           headerStyle: { backgroundColor: BG },
//           headerTintColor: TEXT,
//           headerTitleStyle: { color: TEXT, fontWeight: "800" },
//           headerRight: () => (
//             <Pressable
//               onPress={() => setShowConfirm(true)}
//               hitSlop={8}
//               style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
//             >
//               <Text style={{ color: DANGER, fontWeight: "900" }}>
//                 Eliminar
//               </Text>
//             </Pressable>
//           ),
//         }}
//       />

//       <View style={styles.screen}>
//         {qAct.isLoading && !activity ? (
//           <View style={{ alignItems: "center", paddingTop: 12 }}>
//             <ActivityIndicator color={PRIMARY} />
//             <Text style={styles.subtle}>Cargando…</Text>
//           </View>
//         ) : qAct.isError && !activity ? (
//           <Text style={styles.error}>
//             Error: {String((qAct.error as any)?.message || qAct.error)}
//           </Text>
//         ) : !activity ? (
//           <Text style={styles.subtle}>No encontrado</Text>
//         ) : (
//           <>
//             <View style={[styles.card, isDoneUI && styles.cardDone]}>
//               {/* Título igual que en index */}
//               <Text style={[styles.title, isDoneUI && styles.titleDone]}>
//                 {iconByType(activity.type)}{" "}
//                 {activity.title && activity.title.length > 0
//                   ? activity.title
//                   : "Sin título"}
//               </Text>

//               {/* Línea resumen estilo RelatedActivities, ahora con 2 asignados */}
//               {(() => {
//                 const a = activity;
//                 const statusText = statusLabel;

//                 // Construimos lista de nombres asignados (1 o 2)
//                 const assignedNames: string[] = [];

//                 if (a.assigned_to_name) {
//                   assignedNames.push(a.assigned_to_name);
//                 } else if (a.assigned_to) {
//                   assignedNames.push(String(a.assigned_to));
//                 }

//                 if (a.assigned_to_2_name) {
//                   assignedNames.push(a.assigned_to_2_name);
//                 } else if ((a as any).assigned_to_2) {
//                   assignedNames.push(String((a as any).assigned_to_2));
//                 }

//                 const assignedInfo =
//                   assignedNames.length === 0
//                     ? " · sin asignar"
//                     : assignedNames.length === 1
//                     ? ` · asignada a ${assignedNames[0]}`
//                     : ` · asignada a ${assignedNames[0]} y ${assignedNames[1]}`;

//                 const createdLabel = a.created_at
//                   ? ` · creada el ${formatDateShort(a.created_at)}`
//                   : "";

//                 return (
//                   <Text
//                     style={[styles.summary, isDoneUI && styles.summaryDone]}
//                   >
//                     {a.type} · {statusText}
//                     {a.created_by_name ? ` · por ${a.created_by_name}` : ""}
//                     {assignedInfo}
//                     {createdLabel}
//                     {isDoneUI ? " · tarea completada" : ""}
//                   </Text>
//                 );
//               })()}


//               {/* Asignada a (detalle), mostrando 1 o 2 personas */}
//               <Text style={styles.item}>
//                 <Text style={styles.itemLabel}>Asignada a: </Text>
//                 <Text style={styles.itemValue}>
//                   {(() => {
//                     const names: string[] = [];

//                     if (activity.assigned_to_name) {
//                       names.push(activity.assigned_to_name);
//                     } else if (activity.assigned_to) {
//                       names.push(String(activity.assigned_to));
//                     }

//                     if (activity.assigned_to_2_name) {
//                       names.push(activity.assigned_to_2_name);
//                     } else if ((activity as any).assigned_to_2) {
//                       names.push(String((activity as any).assigned_to_2));
//                     }

//                     if (names.length === 0) return "Sin asignar";
//                     if (names.length === 1) return names[0];
//                     return `${names[0]} y ${names[1]}`;
//                   })()}
//                 </Text>
//               </Text>

//               {/* Reasignar actividad: una sola sección, máx. 2 personas */}
//               <View style={{ marginTop: 8, gap: 6 }}>
//                 <Text style={styles.itemLabel}>
//                   Personas asignadas (máx. 2)
//                 </Text>

//                 {qMembers.isLoading && (
//                   <Text style={styles.subtle}>Cargando miembros…</Text>
//                 )}

//                 {qMembers.isError && (
//                   <Text style={styles.error}>
//                     No se pudieron cargar los miembros.
//                   </Text>
//                 )}

//                 {qMembers.data && qMembers.data.length > 0 && (
//                   <View style={styles.membersRow}>
//                     {qMembers.data.map((m) => {
//                       const isAssigned =
//                         activity.assigned_to === m.id ||
//                         activity.assigned_to_2 === m.id;

//                       return (
//                         <Pressable
//                           key={m.id}
//                           style={[
//                             styles.memberChip,
//                             isAssigned && styles.memberChipActive,
//                           ]}
//                           onPress={() => toggleAssignedMember(m.id)}
//                           disabled={mReassign.isPending}
//                         >
//                           <Text style={styles.memberChipText}>
//                             {m.name || m.email || m.id}
//                           </Text>
//                         </Pressable>
//                       );
//                     })}
//                   </View>
//                 )}

//                 {mReassign.isPending && (
//                   <Text style={styles.subtleSmall}>Reasignando…</Text>
//                 )}
//               </View>

//               {/* Estado + dropdown (solo front) */}
//               <View style={styles.stateRow}>
//                 <Text style={styles.itemLabel}>Estado: </Text>

//                 <View>
//                   <Pressable
//                     style={[
//                       styles.statusChip,
//                       isDoneUI
//                         ? styles.statusDone
//                         : isInProgressUI
//                         ? styles.statusInProgress
//                         : styles.statusOpen,
//                     ]}
//                     onPress={() => setStatusMenuOpen((v) => !v)}
//                   >
//                     <Text style={styles.statusChipText}>{statusLabel}</Text>
//                   </Pressable>

//                   {statusMenuOpen && (
//                     <View style={styles.statusList}>
//                       {/* Abierta */}
//                       <Pressable
//                         style={styles.statusOption}
//                         onPress={() => {
//                           markAsOpen(activity.id);
//                           setLocalStatus("open");
//                           setStatusMenuOpen(false);
//                         }}
//                       >
//                         <Text style={styles.statusOptionText}>Abierta</Text>
//                       </Pressable>

//                       {/* En proceso */}
//                       <Pressable
//                         style={styles.statusOption}
//                         onPress={() => {
//                           markInProgress(activity.id);
//                           setLocalStatus("canceled");
//                           setStatusMenuOpen(false);
//                         }}
//                       >
//                         <Text style={styles.statusOptionText}>En proceso</Text>
//                       </Pressable>

//                       {/* Realizada */}
//                       <Pressable
//                         style={styles.statusOption}
//                         onPress={() => {
//                           markAsCompleted(activity.id);
//                           setLocalStatus("done");
//                           setStatusMenuOpen(false);
//                         }}
//                       >
//                         <Text style={styles.statusOptionText}>Realizada</Text>
//                       </Pressable>
//                     </View>
//                   )}
//                 </View>
//               </View>

//               {/* Badges tipo/estado
//               <View style={styles.rowWrap}>
//                 <Text
//                   style={[
//                     styles.badgeSoft,
//                     badgeByType(activity.type, isDoneUI),
//                   ]}
//                 >
//                   {labelByType(activity.type)}
//                 </Text>
//                 <Text
//                   style={[
//                     styles.badgeSoft,
//                     badgeByStatus(currentStatus, isDoneUI),
//                   ]}
//                 >
//                   {labelByStatus(currentStatus, isDoneUI)}
//                 </Text>
//                 {isDoneUI && (
//                   <Text style={[styles.badgeSolidDone]}>
//                     ✔ Tarea completada
//                   </Text>
//                 )}
//               </View> */}

//               {/* Notas */}
//               {!!activity.notes && (
//                 <Text style={styles.item}>
//                   <Text style={styles.itemLabel}>Notas: </Text>
//                   <Text style={styles.itemValue}>{activity.notes}</Text>
//                 </Text>
//               )}

//               {/* Relacionados */}
//               {contextChips.length > 0 && (
//                 <View style={{ marginTop: 6, gap: 6 }}>
//                   <Text style={[styles.itemLabel, { marginBottom: 2 }]}>
//                     Relacionado con
//                   </Text>
//                   <View style={styles.chipsRow}>
//                     {contextChips.map((c) => (
//                       <Link key={c.href} href={c.href as any} asChild>
//                         <Pressable
//                           style={styles.chip}
//                           accessibilityRole="link"
//                           hitSlop={8}
//                         >
//                           <Text style={styles.chipText}>{c.label}</Text>
//                         </Pressable>
//                       </Link>
//                     ))}
//                   </View>
//                 </View>
//               )}
//             </View>

//             {/* Solo botón eliminar abajo */}
//             <Pressable
//               style={[
//                 styles.btn,
//                 styles.btnDanger,
//                 mDelete.isPending && { opacity: 0.9 },
//               ]}
//               onPress={() => setShowConfirm(true)}
//               disabled={mDelete.isPending}
//             >
//               <Text style={styles.btnText}>
//                 {mDelete.isPending ? "Eliminando…" : "Eliminar"}
//               </Text>
//             </Pressable>
//           </>
//         )}
//       </View>

//       <Confirm
//         visible={showConfirm}
//         title="Eliminar actividad"
//         message="¿Seguro que deseas eliminar esta actividad?"
//         confirmText="Eliminar"
//         cancelText="Cancelar"
//         onCancel={() => setShowConfirm(false)}
//         onConfirm={() => {
//           setShowConfirm(false);
//           mDelete.mutate();
//         }}
//       />
//     </>
//   );
// }

// /* ——— Helpers ——— */
// function iconByType(t: "task" | "call" | "meeting" | "note") {
//   if (t === "call") return "📞";
//   if (t === "meeting") return "📅";
//   if (t === "note") return "📝";
//   return "✅";
// }
// function labelByType(t: "task" | "call" | "meeting" | "note") {
//   if (t === "call") return "Llamada";
//   if (t === "meeting") return "Reunión";
//   if (t === "note") return "Nota>";
//   return "Tarea";
// }

// function labelStatus(s?: Status): string {
//   if (!s || s === "open") return "Abierta";
//   if (s === "done") return "Realizada";
//   if (s === "canceled") return "En proceso";
//   return String(s);
// }

// function labelByStatus(s: Status, isDoneUI: boolean) {
//   if (isDoneUI || s === "done") return "Realizada";
//   if (s === "open") return "Abierta";
//   if (s === "canceled") return "En proceso";
//   return "Abierta";
// }

// function badgeByType(
//   t: "task" | "call" | "meeting" | "note",
//   isDoneUI: boolean
// ) {
//   const base = {
//     borderColor: "#2d3340",
//     backgroundColor: "rgba(255,255,255,0.04)",
//     color: TEXT,
//   };
//   if (isDoneUI)
//     return {
//       ...base,
//       borderColor: SUCCESS,
//       backgroundColor: "rgba(22,163,74,0.12)",
//     };
//   if (t === "call")
//     return {
//       ...base,
//       borderColor: ACCENT,
//       backgroundColor: "rgba(34,211,238,0.10)",
//     };
//   if (t === "meeting")
//     return {
//       ...base,
//       borderColor: "#10b981",
//       backgroundColor: "rgba(16,185,129,0.12)",
//     };
//   if (t === "note")
//     return {
//       ...base,
//       borderColor: "#f59e0b",
//       backgroundColor: "rgba(245,158,11,0.10)",
//     };
//   return {
//     ...base,
//     borderColor: PRIMARY,
//     backgroundColor: "rgba(124,58,237,0.10)",
//   };
// }

// function badgeByStatus(s: Status, isDoneUI: boolean) {
//   const base = {
//     borderColor: "#2d3340",
//     backgroundColor: "rgba(255,255,255,0.04)",
//     color: TEXT,
//   };
//   if (isDoneUI || s === "done")
//     return {
//       ...base,
//       borderColor: SUCCESS,
//       backgroundColor: "rgba(22,163,74,0.12)",
//     };
//   if (s === "canceled")
//     return {
//       ...base,
//       borderColor: "#3b82f6",
//       backgroundColor: "rgba(37,99,235,0.12)",
//     }; // azul “En proceso”
//   return {
//     ...base,
//     borderColor: PRIMARY,
//     backgroundColor: "rgba(124,58,237,0.10)",
//   };
// }

// function formatDateTime(ms?: number | null) {
//   if (!ms) return "—";
//   const d = new Date(ms);
//   if (Number.isNaN(d.getTime())) return "—";
//   return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
//     hour: "2-digit",
//     minute: "2-digit",
//   })}`;
// }

// function formatDateShort(ms?: number | null) {
//   if (!ms) return "—";
//   const d = new Date(ms);
//   if (Number.isNaN(d.getTime())) return "—";
//   return d.toLocaleDateString();
// }

// /* ——— Estilos ——— */
// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },

//   card: {
//     backgroundColor: CARD,
//     borderWidth: 1,
//     borderColor: BORDER,
//     borderRadius: 14,
//     padding: 14,
//     gap: 8,
//   },
//   cardDone: {
//     borderColor: SUCCESS,
//     backgroundColor: "rgba(22,163,74,0.08)",
//   },

//   title: { fontSize: 20, fontWeight: "900", color: TEXT },
//   titleDone: { color: SUCCESS },

//   summary: { color: SUBTLE, fontSize: 12 },
//   summaryDone: { color: SUCCESS },

//   creator: { color: SUBTLE, fontSize: 12 },
//   creatorDone: { color: SUCCESS },

//   meta: { color: SUBTLE, fontSize: 12 },
//   metaDone: { color: SUCCESS },

//   label: { color: SUBTLE, fontWeight: "700" },
//   labelStrong: { color: TEXT, fontWeight: "900" },

//   rowWrap: { flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" },

//   item: { color: SUBTLE },
//   itemLabel: { color: SUBTLE, fontWeight: "700" },
//   itemValue: { color: TEXT, fontWeight: "700" },

//   // Fila de estado
//   stateRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 8,
//     marginTop: 4,
//   },

//   // Dropdown de estado
//   statusChip: {
//     borderRadius: 999,
//     paddingHorizontal: 10,
//     paddingVertical: 4,
//     borderWidth: 1,
//   },
//   statusChipText: {
//     fontSize: 11,
//     fontWeight: "700",
//     color: "#0F172A",
//   },
//   statusOpen: {
//     backgroundColor: "#e5e7eb",
//     borderColor: "#9ca3af",
//   },
//   statusInProgress: {
//     backgroundColor: "#DBEAFE",
//     borderColor: "#3b82f6",
//   },
//   statusDone: {
//     backgroundColor: "#dcfce7",
//     borderColor: "#22c55e",
//   },
//   statusList: {
//     marginTop: 4,
//     borderRadius: 8,
//     borderWidth: 1,
//     borderColor: "#CBD5E1",
//     backgroundColor: "#fff",
//     overflow: "hidden",
//   },
//   statusOption: {
//     paddingVertical: 6,
//     paddingHorizontal: 10,
//     borderBottomWidth: 1,
//     borderBottomColor: "#E2E8F0",
//   },
//   statusOptionText: {
//     fontSize: 12,
//     color: "#0F172A",
//   },

//   badgeSoft: {
//     alignSelf: "flex-start",
//     paddingHorizontal: 8,
//     paddingVertical: 3,
//     borderRadius: 999,
//     borderWidth: 1,
//     overflow: "hidden",
//     fontSize: 11,
//     lineHeight: 14,
//     fontWeight: "800",
//     color: TEXT,
//   } as any,

//   badgeSolidDone: {
//     alignSelf: "flex-start",
//     paddingHorizontal: 8,
//     paddingVertical: 3,
//     borderRadius: 999,
//     backgroundColor: SUCCESS,
//     color: "#fff",
//     fontSize: 11,
//     fontWeight: "900",
//     overflow: "hidden",
//   } as any,

//   chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
//   chip: {
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: "#1a1b2a",
//   },
//   chipText: { color: "#E5E7EB", fontWeight: "800", fontSize: 12 },

//   btn: { padding: 12, borderRadius: 12, alignItems: "center" },
//   btnDanger: { backgroundColor: DANGER },

//   btnText: { color: "#fff", fontWeight: "900" },

//   subtle: { color: SUBTLE },
//   subtleSmall: { color: SUBTLE, fontSize: 11 },
//   error: { color: "#fecaca" },

//   membersRow: {
//     flexDirection: "row",
//     flexWrap: "wrap",
//     gap: 8,
//     marginTop: 4,
//   },
//   memberChip: {
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: "#1F2937",
//   },
//   memberChipActive: {
//     borderColor: PRIMARY,
//     backgroundColor: "rgba(124,58,237,0.25)",
//   },
//   memberChipText: {
//     color: TEXT,
//     fontWeight: "700",
//     fontSize: 12,
//   },
// });

