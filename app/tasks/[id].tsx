// app/tasks/[id].tsx
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

  // 👇 Estado LOCAL solo visual para el dropdown
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
  // agregar a en proceso
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

  // Buscar en cache de la lista para rellenar
  const listAll =
    (qc.getQueryData<ActivityWithCreator[]>(["activities-all"]) ?? []) as
      | ActivityWithCreator[]
      | [];
  const fromList = listAll.find((a) => a.id === id);

  const activity: ActivityWithCreator | undefined = qAct.data
    ? ({ ...(fromList || {}), ...qAct.data } as ActivityWithCreator)
    : fromList;

  // Estado efectivo solo para UI
  const currentStatus: Status = (localStatus ??
    (activity?.status as Status) ??
    "open") as Status;

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

const isDoneUI = activity
  ? activity.status === "done" || completedMaster.has(activity.id)
  : false;

const isInProgressUI =
  activity && !isDoneUI ? inProgressMaster.has(activity.id) : false;

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

              {/* Línea resumen estilo RelatedActivities */}
              {(() => {
                const a = activity;
                const statusText = statusLabel;

                const assignedInfo =
                  a.assigned_to_name && a.assigned_to_name.trim().length > 0
                    ? ` · asignada a ${a.assigned_to_name}`
                    : a.assigned_to &&
                      String(a.assigned_to).trim().length > 0
                    ? ` · asignada a ${a.assigned_to}`
                    : " · sin asignar";

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

              {/* Creado por */}
              {(activity.created_by_name || activity.created_by_email) && (
                <Text
                  style={[styles.creator, isDoneUI && styles.creatorDone]}
                >
                  <Text style={styles.labelStrong}>Creado por: </Text>
                  {activity.created_by_name ?? "—"}
                  {activity.created_by_email
                    ? ` · ${activity.created_by_email}`
                    : ""}
                </Text>
              )}

              {/* Fechas */}
              <Text style={[styles.meta, isDoneUI && styles.metaDone]}>
                <Text style={styles.label}>Creado: </Text>
                {formatDateTime(activity.created_at)}{"   "}
                <Text style={styles.label}>Actualizado: </Text>
                {formatDateTime(activity.updated_at)}
              </Text>

              {/* Asignada a */}
              <Text style={styles.item}>
                <Text style={styles.itemLabel}>Asignada a: </Text>
                <Text style={styles.itemValue}>
                  {activity.assigned_to_name
                    ? activity.assigned_to_name
                    : activity.assigned_to
                    ? activity.assigned_to
                    : "Sin asignar"}
                </Text>
              </Text>

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
        markAsOpen(activity.id);
        setStatusMenuOpen(false);
      }}
    >
      <Text style={styles.statusOptionText}>Abierta</Text>
    </Pressable>

    {/* En proceso */}
    <Pressable
      style={styles.statusOption}
      onPress={() => {
        markInProgress(activity.id);
        setStatusMenuOpen(false);
      }}
    >
      <Text style={styles.statusOptionText}>En proceso</Text>
    </Pressable>

    {/* Realizada */}
    <Pressable
      style={styles.statusOption}
      onPress={() => {
        markAsCompleted(activity.id);
        setStatusMenuOpen(false);
      }}
    >
      <Text style={styles.statusOptionText}>Realizada</Text>
    </Pressable>
  </View>
)}

                </View>
              </View>

              {/* Badges tipo/estado */}
              <View style={styles.rowWrap}>
                <Text
                  style={[
                    styles.badgeSoft,
                    badgeByType(activity.type, isDoneUI),
                  ]}
                >
                  {labelByType(activity.type)}
                </Text>
                <Text
                  style={[
                    styles.badgeSoft,
                    badgeByStatus(currentStatus, isDoneUI),
                  ]}
                >
                  {labelByStatus(currentStatus, isDoneUI)}
                </Text>
                {isDoneUI && (
                  <Text style={[styles.badgeSolidDone]}>
                    ✔ Tarea completada
                  </Text>
                )}
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
                  <Text
                    style={[styles.itemLabel, { marginBottom: 2 }]}
                  >
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
  if (t === "note") return "Nota";
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

function formatDateShort(ms?: number | null) {
  if (!ms) return "—";
  const d = new Date(ms);
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

  // Dropdown de estado (copiado de RelatedActivities)
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
    // Igual que en RelatedActivities: gris neutro
    backgroundColor: "#e5e7eb",
    borderColor: "#9ca3af",
  },
  statusInProgress: {
    // Igual que en RelatedActivities: azul claro
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
  error: { color: "#fecaca" },
});


// // app/tasks/[id].tsx
// import { listAccounts } from "@/src/api/accounts";
// import {
//   deleteActivity,
//   getActivity,
//   listActivities,
//   updateActivity,
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
// };

// /** Maestro global de completadas por UI */
// const MASTER_COMPLETED_KEY = "completedActivities:v1:all";

// export default function TaskDetail() {
//   const { id } = useLocalSearchParams<{ id: string }>();
//   const qc = useQueryClient();
//   const [showConfirm, setShowConfirm] = useState(false);
//   const [completedMaster, setCompletedMaster] = useState<Set<string>>(
//     new Set()
//   );

//   // dropdown de estado
//   const [statusMenuOpen, setStatusMenuOpen] = useState(false);

//   // Cargar maestro UI
//   useEffect(() => {
//     (async () => {
//       try {
//         const raw = await AsyncStorage.getItem(MASTER_COMPLETED_KEY);
//         setCompletedMaster(new Set(raw ? JSON.parse(raw) : []));
//       } catch {
//         setCompletedMaster(new Set());
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

//   // Helpers UI maestro
//   const markUI = async (actId: string) => {
//     const next = new Set(completedMaster);
//     next.add(actId);
//     setCompletedMaster(next);
//     try {
//       await AsyncStorage.setItem(
//         MASTER_COMPLETED_KEY,
//         JSON.stringify([...next])
//       );
//     } catch {}
//   };
//   const unmarkUI = async (actId: string) => {
//     const next = new Set(completedMaster);
//     next.delete(actId);
//     setCompletedMaster(next);
//     try {
//       await AsyncStorage.setItem(
//         MASTER_COMPLETED_KEY,
//         JSON.stringify([...next])
//       );
//     } catch {}
//   };

//   // Mutación para cambiar estado (desde dropdown)
//   const mStatus = useMutation({
//     mutationFn: async (status: Status) =>
//       updateActivity(id!, { status } as Partial<Activity>),
//     onSuccess: async (_data, status) => {
//       setStatusMenuOpen(false);
//       await qc.invalidateQueries({ queryKey: ["activity", id] });
//       await qc.invalidateQueries({ queryKey: ["activities-all"] });
//       await qc.invalidateQueries({ queryKey: ["activities"] });

//       if (status === "done") await markUI(id!);
//       else await unmarkUI(id!);
//     },
//   });

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

//   // Buscar en cache de la lista para rellenar
//   const listAll =
//     (qc.getQueryData<ActivityWithCreator[]>(["activities-all"]) ?? []) as
//       | ActivityWithCreator[]
//       | [];
//   const fromList = listAll.find((a) => a.id === id);

//   const activity: ActivityWithCreator | undefined = qAct.data
//     ? ({ ...(fromList || {}), ...qAct.data } as ActivityWithCreator)
//     : fromList;

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

//   const isDoneUI = activity
//     ? activity.status === "done" || completedMaster.has(activity.id)
//     : false;

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

//               {/* Línea resumen estilo RelatedActivities */}
//               {(() => {
//                 const a = activity;
//                 const statusText = labelStatus(a.status as Status);
//                 const assignedInfo =
//                   a.assigned_to_name && a.assigned_to_name.trim().length > 0
//                     ? ` · asignada a ${a.assigned_to_name}`
//                     : a.assigned_to &&
//                       String(a.assigned_to).trim().length > 0
//                     ? ` · asignada a ${a.assigned_to}`
//                     : " · sin asignar";

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

//               {/* Creado por */}
//               {(activity.created_by_name || activity.created_by_email) && (
//                 <Text
//                   style={[styles.creator, isDoneUI && styles.creatorDone]}
//                 >
//                   <Text style={styles.labelStrong}>Creado por: </Text>
//                   {activity.created_by_name ?? "—"}
//                   {activity.created_by_email
//                     ? ` · ${activity.created_by_email}`
//                     : ""}
//                 </Text>
//               )}

//               {/* Fechas */}
//               <Text style={[styles.meta, isDoneUI && styles.metaDone]}>
//                 <Text style={styles.label}>Creado: </Text>
//                 {formatDateTime(activity.created_at)}{"   "}
//                 <Text style={styles.label}>Actualizado: </Text>
//                 {formatDateTime(activity.updated_at)}
//               </Text>

//               {/* Asignada a */}
//               <Text style={styles.item}>
//                 <Text style={styles.itemLabel}>Asignada a: </Text>
//                 <Text style={styles.itemValue}>
//                   {activity.assigned_to_name
//                     ? activity.assigned_to_name
//                     : activity.assigned_to
//                     ? activity.assigned_to
//                     : "Sin asignar"}
//                 </Text>
//               </Text>

//               {/* Estado + dropdown (igual que RelatedActivities) */}
//               <View style={styles.stateRow}>
//                 <Text style={styles.itemLabel}>Estado: </Text>

//                 <View>
//                   <Pressable
//                     style={[
//                       styles.statusChip,
//                       activity.status === "done"
//                         ? styles.statusDone
//                         : activity.status === "canceled"
//                         ? styles.statusInProgress
//                         : styles.statusOpen,
//                     ]}
//                     onPress={() => setStatusMenuOpen((v) => !v)}
//                   >
//                     <Text style={styles.statusChipText}>
//                       {labelStatus(activity.status as Status)}
//                     </Text>
//                   </Pressable>

//                   {statusMenuOpen && (
//                     <View style={styles.statusList}>
//                       {/* Abierta -> open */}
//                       <Pressable
//                         style={styles.statusOption}
//                         onPress={() => mStatus.mutate("open")}
//                       >
//                         <Text style={styles.statusOptionText}>Abierta</Text>
//                       </Pressable>
//                       {/* En proceso -> canceled */}
//                       <Pressable
//                         style={styles.statusOption}
//                         onPress={() => mStatus.mutate("canceled")}
//                       >
//                         <Text style={styles.statusOptionText}>En proceso</Text>
//                       </Pressable>
//                       {/* Realizada -> done */}
//                       <Pressable
//                         style={styles.statusOption}
//                         onPress={() => mStatus.mutate("done")}
//                       >
//                         <Text style={styles.statusOptionText}>Realizada</Text>
//                       </Pressable>
//                     </View>
//                   )}
//                 </View>
//               </View>

//               {/* Badges tipo/estado */}
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
//                     badgeByStatus(activity.status as Status, isDoneUI),
//                   ]}
//                 >
//                   {labelByStatus(activity.status as Status, isDoneUI)}
//                 </Text>
//                 {isDoneUI && (
//                   <Text style={[styles.badgeSolidDone]}>
//                     ✔ Tarea completada
//                   </Text>
//                 )}
//               </View>

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
//                   <Text
//                     style={[styles.itemLabel, { marginBottom: 2 }]}
//                   >
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
//   if (t === "note") return "Nota";
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

//   // Dropdown de estado (copiado de RelatedActivities)
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
//     backgroundColor: "#e0f2fe",
//     borderColor: "#38bdf8",
//   },
//   statusInProgress: {
//     backgroundColor: "#fef3c7",
//     borderColor: "#fbbf24",
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
//   error: { color: "#fecaca" },
// });

