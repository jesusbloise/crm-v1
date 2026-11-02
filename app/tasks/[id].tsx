// app/tasks/[id].tsx
import {
  deleteActivity,
  getActivity,
  listActivities,
  updateActivity,
  type Activity,
  type ActivityStatus,
} from "@/src/api/activities";
import {
  listWorkspaceMembers,
  type WorkspaceMember,
} from "@/src/api/workspaceMembers";

import { listAccounts } from "@/src/api/accounts";
import { listContacts } from "@/src/api/contacts";
import { listDeals } from "@/src/api/deals";
import { listLeads } from "@/src/api/leads";

import {
  createCalendarEventFromActivity
} from "@/src/lib/googleCalendar";

import {
  initNotifications,
  scheduleActivityReminder,
} from "@/src/utils/notifications";

import Confirm from "@/src/ui/Confirm";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";

/* Paleta */
const PRIMARY = "#7551c8";
const BG = "#f5f6fa";
const CARD = "#ffffff";
const BORDER = "#e7e9f0";
const TEXT = "#202536";
const SUBTLE = "#737b8e";
const DANGER = "#b42332";
const SUCCESS = "#23744d";

/** Estados permitidos */
type Status = ActivityStatus;

/** Activity enriquecida */
type ActivityWithCreator = Activity & {
  created_by_name?: string | null;
  created_by_email?: string | null;
  assigned_to_name?: string | null;
  assigned_to_2_name?: string | null;
};

/** Maestro global UI */
const MASTER_COMPLETED_KEY = "completedActivities:v1:all";
const MASTER_INPROGRESS_KEY = "inProgressActivities:v1:all";

type Assignees = { assigned_to: string | null; assigned_to_2: string | null };

function asArray<T = any>(v: any): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && Array.isArray(v.rows)) return v.rows as T[];
  return [];
}

/* Recordatorio (fallback local) */
const LOCAL_EVENT_MAP_KEY = "activityEventLocal:v1";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateToYYYYMMDD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function yyyymmddToDDMMYYYY(yyyymmdd: string) {
  const m = yyyymmdd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function ddmmyyyyToYYYYMMDD(ddmmyyyy: string): string | null {
  const trimmed = ddmmyyyy.trim();
  if (!trimmed) return null;

  const m = trimmed.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);

  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  const d = new Date(yyyy, mm - 1, dd);
  if (Number.isNaN(d.getTime())) return null;

  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd)
    return null;

  return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}

function parseDueDate(yyyymmdd: string): number | null {
  if (!yyyymmdd.trim()) return null;
  const m = yyyymmdd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN as any;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return NaN as any;
  return d.getTime();
}

function parseTime(hhmm: string): { h: number; m: number } | null {
  if (!hhmm.trim()) return null;
  const m = hhmm.match(/^(\d{2}):([0-5]\d)$/);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

async function saveLocalEvent(activityId: string, eventMs: number) {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_EVENT_MAP_KEY);
    const current = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const next = { ...(current || {}), [activityId]: eventMs };
    await AsyncStorage.setItem(LOCAL_EVENT_MAP_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("No se pudo guardar evento local:", e);
  }
}

/* =========================
   MINI CALENDARIO (Modal)
========================= */
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function ymdToDate(ymd: string): Date | null {
  const ms = parseDueDate(ymd);
  if (!ms || Number.isNaN(ms as any)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function MiniCalendarModal(props: {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onSelect: (d: Date) => void;
}) {
  const { visible, value, onClose, onSelect } = props;

  const [monthCursor, setMonthCursor] = useState<Date>(() => startOfMonth(value));

  useEffect(() => {
    if (visible) setMonthCursor(startOfMonth(value));
  }, [visible, value]);

  const monthLabel = useMemo(() => {
    const m = monthCursor.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
    return m.charAt(0).toUpperCase() + m.slice(1);
  }, [monthCursor]);

  const grid = useMemo(() => {
    const first = startOfMonth(monthCursor);
    const firstDay = first.getDay(); // 0 domingo
    const offset = (firstDay + 6) % 7; // lunes=0
    const start = new Date(first);
    start.setDate(first.getDate() - offset);

    const days: { d: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({ d, inMonth: d.getMonth() === monthCursor.getMonth() });
    }
    return days;
  }, [monthCursor]);

  const weekDays = ["L", "M", "M", "J", "V", "S", "D"];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCardCalendar} onPress={() => {}}>
          <View style={styles.calHeader}>
            <Pressable
              onPress={() => setMonthCursor((m) => addMonths(m, -1))}
              style={styles.calNavBtn}
              hitSlop={10}
            >
              <Text style={styles.calNavTxt}>{"‹"}</Text>
            </Pressable>

            <Text style={styles.calTitle}>{monthLabel}</Text>

            <Pressable
              onPress={() => setMonthCursor((m) => addMonths(m, 1))}
              style={styles.calNavBtn}
              hitSlop={10}
            >
              <Text style={styles.calNavTxt}>{"›"}</Text>
            </Pressable>
          </View>

          <View style={styles.calWeekRow}>
            {weekDays.map((w, idx) => (
              <Text key={`${w}-${idx}`} style={styles.calWeekTxt}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.calGrid}>
            {grid.map(({ d, inMonth }, idx) => {
              const isSelected = sameDay(d, value);
              return (
                <Pressable
                  key={`${dateToYYYYMMDD(d)}-${idx}`}
                  onPress={() => onSelect(d)}
                  style={[
                    styles.calDay,
                    !inMonth && styles.calDayOff,
                    isSelected && styles.calDaySelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.calDayTxt,
                      !inMonth && styles.calDayTxtOff,
                      isSelected && styles.calDayTxtSelected,
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.calFooter}>
            <Pressable onPress={onClose} style={styles.calCloseBtn}>
              <Text style={styles.calCloseTxt}>Cerrar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  const [showConfirm, setShowConfirm] = useState(false);

  // confirmación única de reasignación (solo al guardar)
  const [showReassignConfirm, setShowReassignConfirm] = useState(false);
  const [pendingReassign, setPendingReassign] = useState<Assignees | null>(null);
  const [pendingReassignMessage, setPendingReassignMessage] = useState("");

  const [completedMaster, setCompletedMaster] = useState<Set<string>>(new Set());
  const [inProgressMaster, setInProgressMaster] = useState<Set<string>>(new Set());

  // dropdown de estado
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState<Status | null>(null);

  // nota nueva
  const [newNoteBody, setNewNoteBody] = useState("");

  // dropdown asignación (modo edición local + guardar)
  const [assigneesMenuOpen, setAssigneesMenuOpen] = useState(false);
  const [draftAssignees, setDraftAssignees] = useState<Assignees>({
    assigned_to: null,
    assigned_to_2: null,
  });

  // editar título
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Reagendar / recordatorio
  const [dateStr, setDateStr] = useState(""); // YYYY-MM-DD
  const [dateInput, setDateInput] = useState(""); // DD/MM/AAAA
  const [timeStr, setTimeStr] = useState(""); // HH:MM
  const [remind, setRemind] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);

  // ✅ Mini calendario
  const [miniCalOpen, setMiniCalOpen] = useState(false);

  // Cargar maestro UI
  useEffect(() => {
    (async () => {
      try {
        const [rawCompleted, rawInProgress] = await Promise.all([
          AsyncStorage.getItem(MASTER_COMPLETED_KEY),
          AsyncStorage.getItem(MASTER_INPROGRESS_KEY),
        ]);
        setCompletedMaster(new Set<string>(rawCompleted ? JSON.parse(rawCompleted) : []));
        setInProgressMaster(new Set<string>(rawInProgress ? JSON.parse(rawInProgress) : []));
      } catch {
        setCompletedMaster(new Set());
        setInProgressMaster(new Set());
      }
    })();
  }, []);

  useEffect(() => {
    initNotifications().catch(() => {});
  }, []);

  // Detalle
  const qAct = useQuery<ActivityWithCreator>({
    queryKey: ["activity", id],
    queryFn: () => getActivity(id!),
    enabled: !!id,
  });

  // Cache lista (opcional)
  useQuery<ActivityWithCreator[]>({
    queryKey: ["activities-all"],
    queryFn: () => listActivities() as Promise<ActivityWithCreator[]>,
    enabled: false,
  });

  // Catálogos
  const qAcc = useQuery<any[]>({ queryKey: ["accounts"], queryFn: listAccounts as any });
  const qCon = useQuery<any[]>({ queryKey: ["contacts"], queryFn: listContacts as any });
  const qDeal = useQuery<any[]>({ queryKey: ["deals"], queryFn: listDeals as any });
  const qLead = useQuery<any[]>({ queryKey: ["leads"], queryFn: listLeads as any });

  // Miembros del workspace actual
  const qMembers = useQuery<WorkspaceMember[]>({
    queryKey: ["workspaceMembers"],
    queryFn: listWorkspaceMembers,
  });

  const getMemberLabel = useCallback(
    (memberId: string) => {
      const m = (qMembers.data ?? []).find((x) => x.id === memberId);
      return m?.name || m?.email || memberId;
    },
    [qMembers.data]
  );

  const describeAssignees = useCallback(
    (a: Assignees) => {
      const names: string[] = [];
      if (a.assigned_to) names.push(getMemberLabel(a.assigned_to));
      if (a.assigned_to_2) names.push(getMemberLabel(a.assigned_to_2));
      if (names.length === 0) return "sin asignar";
      if (names.length === 1) return names[0];
      return `${names[0]} y ${names[1]}`;
    },
    [getMemberLabel]
  );

  const diffAssigneesMessage = useCallback(
    (prev: Assignees, next: Assignees): string => {
      const p = [prev.assigned_to, prev.assigned_to_2].filter(Boolean) as string[];
      const n = [next.assigned_to, next.assigned_to_2].filter(Boolean) as string[];

      const added = n.filter((x) => !p.includes(x));
      const removed = p.filter((x) => !n.includes(x));

      if (added.length === 0 && removed.length === 0) return `No hay cambios en la asignación.`;

      if (n.length === 0 && removed.length > 0 && added.length === 0) {
        const who =
          removed.length === 1
            ? getMemberLabel(removed[0])
            : `${getMemberLabel(removed[0])} y ${getMemberLabel(removed[1])}`;
        return `Vas a dejar la actividad sin asignar (se desasigna a ${who}).`;
      }

      if (p.length === 0 && added.length > 0 && removed.length === 0) {
        const who =
          added.length === 1
            ? getMemberLabel(added[0])
            : `${getMemberLabel(added[0])} y ${getMemberLabel(added[1])}`;
        return `Vas a asignar la actividad a ${who}.`;
      }

      if (added.length === 1 && removed.length === 1) {
        return `Vas a reasignar: se desasigna a ${getMemberLabel(
          removed[0]
        )} y se asigna a ${getMemberLabel(added[0])}.`;
      }

      if (added.length > 0 && removed.length === 0) {
        const who =
          added.length === 1
            ? getMemberLabel(added[0])
            : `${getMemberLabel(added[0])} y ${getMemberLabel(added[1])}`;
        return `Vas a agregar a ${who} como responsable.`;
      }

      if (removed.length > 0 && added.length === 0) {
        const who =
          removed.length === 1
            ? getMemberLabel(removed[0])
            : `${getMemberLabel(removed[0])} y ${getMemberLabel(removed[1])}`;
        return `Vas a desasignar a ${who}. La actividad quedará asignada a ${describeAssignees(next)}.`;
      }

      return `Vas a cambiar la asignación: quedará asignada a ${describeAssignees(next)}.`;
    },
    [describeAssignees, getMemberLabel]
  );

  // Helpers UI estado (solo visual)
  const markAsOpen = (actId: string) => {
    setCompletedMaster((prev) => {
      if (!prev.has(actId)) return prev;
      const next = new Set(prev);
      next.delete(actId);
      AsyncStorage.setItem(MASTER_COMPLETED_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
    setInProgressMaster((prev) => {
      if (!prev.has(actId)) return prev;
      const next = new Set(prev);
      next.delete(actId);
      AsyncStorage.setItem(MASTER_INPROGRESS_KEY, JSON.stringify(Array.from(next))).catch(
        () => {}
      );
      return next;
    });
  };

  const markAsCompleted = (actId: string) => {
    setInProgressMaster((prev) => {
      if (!prev.has(actId)) return prev;
      const next = new Set(prev);
      next.delete(actId);
      AsyncStorage.setItem(MASTER_INPROGRESS_KEY, JSON.stringify(Array.from(next))).catch(
        () => {}
      );
      return next;
    });
    setCompletedMaster((prev) => {
      if (prev.has(actId)) return prev;
      const next = new Set(prev);
      next.add(actId);
      AsyncStorage.setItem(MASTER_COMPLETED_KEY, JSON.stringify(Array.from(next))).catch(
        () => {}
      );
      return next;
    });
  };

  const markInProgress = (actId: string) => {
    setCompletedMaster((prev) => {
      if (!prev.has(actId)) return prev;
      const next = new Set(prev);
      next.delete(actId);
      AsyncStorage.setItem(MASTER_COMPLETED_KEY, JSON.stringify(Array.from(next))).catch(
        () => {}
      );
      return next;
    });
    setInProgressMaster((prev) => {
      if (prev.has(actId)) return prev;
      const next = new Set(prev);
      next.add(actId);
      AsyncStorage.setItem(MASTER_INPROGRESS_KEY, JSON.stringify(Array.from(next))).catch(
        () => {}
      );
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
          await AsyncStorage.setItem(MASTER_COMPLETED_KEY, JSON.stringify([...next]));
        } catch {}
      }
      await qc.invalidateQueries({ queryKey: ["activities-all"] });
      await qc.invalidateQueries({ queryKey: ["activities"] });
      router.back();
    },
    onError: () => alert("No se pudo eliminar la actividad. Intenta nuevamente."),
  });

  // updateActivity (reasignación / notas / título)
  const mReassign = useMutation({
    mutationFn: async (payload: {
      assigned_to: string | null;
      assigned_to_2: string | null;
      title?: string | null;
      notes?: string | null;
      account_id?: string | null;
      contact_id?: string | null;
      deal_id?: string | null;
      lead_id?: string | null;
      status?: ActivityStatus | null;
      due_date?: number | null;
      type?: Activity["type"] | null;

      notify_assignees?: boolean;
    }) => {
      if (!id) throw new Error("Missing activity id");
      await updateActivity(id, payload as any);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["activity", id] });
      await qc.invalidateQueries({ queryKey: ["activities"] });
      await qc.invalidateQueries({ queryKey: ["activities-all"] });
      setNewNoteBody("");
    },
    onError: (err) => {
      alert(
        "No se pudo actualizar la actividad. Intenta nuevamente.\n\n" +
          String((err as any)?.message ?? err)
      );
    },
  });

  // Reagendar: mutation separada para NO tocar la lógica existente
  const mReschedule = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing activity id");
      if (!activity) throw new Error("Activity not loaded");

      setReminderError(null);

      if (!dateStr.trim()) throw new Error("Ingresa una fecha para reagendar.");

      const base = parseDueDate(dateStr);
      if (!base || Number.isNaN(base as any)) throw new Error("La fecha no es válida.");

      const t = parseTime(timeStr);
      if (!t) throw new Error("La hora debe ser HH:MM (24h).");

      const when = new Date(base);
      when.setHours(t.h, t.m, 0, 0);

      if (when.getTime() <= Date.now()) {
        throw new Error("El recordatorio debe quedar en el futuro.");
      }

      // 1) Persistir due_date en backend (manteniendo el resto igual)
      await updateActivity(id, {
        assigned_to: (activity as any).assigned_to ?? null,
        assigned_to_2: (activity as any).assigned_to_2 ?? null,
        title: activity.title ?? null,
        notes: activity.notes ?? null,
        account_id: (activity as any).account_id ?? null,
        contact_id: (activity as any).contact_id ?? null,
        deal_id: (activity as any).deal_id ?? null,
        lead_id: (activity as any).lead_id ?? null,
        status: activity.status ?? null,
        due_date: when.getTime(),
        type: activity.type ?? null,
      } as any);

      // 2) Guardar fallback local
      await saveLocalEvent(String(id), when.getTime());

      // 3) Notificación local si el switch está activo
      if (remind) {
        try {
          await scheduleActivityReminder({
            activityId: String(id),
            title: activity.title ?? "Actividad",
            body: activity.notes || `Recordatorio: ${activity.title ?? "Actividad"}`,
            when,
          });
        } catch (e) {
          console.warn("No se pudo programar recordatorio:", e);
        }
      }

   // 4) Google Calendar: create/update o encola internamente si no hay conexión
await createCalendarEventFromActivity({
  id: String(id),
  title: activity.title ?? "Actividad",
  notes: activity.notes ?? null,
  startAt: when,
});

      return when.getTime();
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["activity", id] });
      await qc.invalidateQueries({ queryKey: ["activities"] });
      await qc.invalidateQueries({ queryKey: ["activities-all"] });
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? err ?? "No se pudo reagendar.");
      setReminderError(msg);
    },
  });

  // Rellenar desde cache lista
  const listAll =
    (qc.getQueryData<ActivityWithCreator[]>(["activities-all"]) ?? []) as
      | ActivityWithCreator[]
      | [];
  const fromList = listAll.find((a) => a.id === id);

  const activity: ActivityWithCreator | undefined = qAct.data
    ? ({ ...(fromList || {}), ...qAct.data } as ActivityWithCreator)
    : fromList;

  // inicializar draft del título cuando llega la activity
  useEffect(() => {
    if (!activity) return;
    setTitleDraft(activity.title ?? "");
  }, [activity?.id, activity?.title]);

  // Inicializar bloque de reagendar desde due_date existente
  useEffect(() => {
    if (!activity) return;

    const due = (activity as any).due_date;
    if (!due) {
      setDateStr("");
      setDateInput("");
      setTimeStr("");
      setRemind(false);
      setReminderError(null);
      return;
    }

    const d = new Date(Number(due));
    if (Number.isNaN(d.getTime())) return;

    const ymd = dateToYYYYMMDD(d);
    setDateStr(ymd);
    setDateInput(yyyymmddToDDMMYYYY(ymd));
    setTimeStr(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
    setRemind(true);
    setReminderError(null);
  }, [activity?.id]);

  // Mantener dateInput en sync si dateStr cambia desde el picker
  useEffect(() => {
    if (!dateStr.trim()) {
      setDateInput("");
      return;
    }
    const ddmmyyyy = yyyymmddToDDMMYYYY(dateStr);
    if (ddmmyyyy) setDateInput(ddmmyyyy);
  }, [dateStr]);

  const currentAssignees: Assignees = useMemo(() => {
    const a: any = activity;
    return {
      assigned_to: a?.assigned_to ?? null,
      assigned_to_2: a?.assigned_to_2 ?? null,
    };
  }, [(activity as any)?.assigned_to, (activity as any)?.assigned_to_2]);

  useEffect(() => {
    if (!assigneesMenuOpen) return;
    setDraftAssignees((prev) => {
      if (
        prev.assigned_to === currentAssignees.assigned_to &&
        prev.assigned_to_2 === currentAssignees.assigned_to_2
      ) {
        return prev;
      }
      return {
        assigned_to: currentAssignees.assigned_to,
        assigned_to_2: currentAssignees.assigned_to_2,
      };
    });
  }, [assigneesMenuOpen, currentAssignees.assigned_to, currentAssignees.assigned_to_2]);

  const draftDirty = useMemo(() => {
    return (
      draftAssignees.assigned_to !== currentAssignees.assigned_to ||
      draftAssignees.assigned_to_2 !== currentAssignees.assigned_to_2
    );
  }, [draftAssignees, currentAssignees]);

  const draftSelectedCount = useMemo(() => {
    return [draftAssignees.assigned_to, draftAssignees.assigned_to_2].filter(Boolean).length;
  }, [draftAssignees]);

  const toggleDraftMember = (memberId: string) => {
    setDraftAssignees((prev) => {
      let primary = prev.assigned_to;
      let secondary = prev.assigned_to_2;

      const isPrimary = primary === memberId;
      const isSecondary = secondary === memberId;

      if (isPrimary) primary = null;
      else if (isSecondary) secondary = null;
      else {
        if (!primary) primary = memberId;
        else if (!secondary) secondary = memberId;
        else return prev; // max 2
      }

      return { assigned_to: primary, assigned_to_2: secondary };
    });
  };

  const requestSaveAssignees = () => {
    if (!activity) return;
    const msg = diffAssigneesMessage(currentAssignees, draftAssignees);
    setPendingReassign(draftAssignees);
    setPendingReassignMessage(msg);
    setShowReassignConfirm(true);
  };

  const applyPendingReassign = () => {
    if (!activity || !pendingReassign) return;

    mReassign.mutate({
      assigned_to: pendingReassign.assigned_to,
      assigned_to_2: pendingReassign.assigned_to_2,
      title: activity.title ?? null,
      notes: activity.notes ?? null,
      account_id: (activity as any).account_id ?? null,
      contact_id: (activity as any).contact_id ?? null,
      deal_id: (activity as any).deal_id ?? null,
      lead_id: (activity as any).lead_id ?? null,
      status: activity.status ?? null,
      due_date: (activity as any).due_date ?? null,
      type: activity.type ?? null,
      notify_assignees: true,
    });

    setShowReassignConfirm(false);
    setPendingReassign(null);
    setPendingReassignMessage("");
    setAssigneesMenuOpen(false);
  };

  const cancelPendingReassign = () => {
    setShowReassignConfirm(false);
    setPendingReassign(null);
    setPendingReassignMessage("");
  };

  // Notas (historial)
  const noteBlocks = useMemo(() => {
    const raw = (activity?.notes || "").trim();
    if (!raw) return [];
    return raw
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);
  }, [activity?.notes]);

  const handleAddNote = () => {
    if (!activity) return;
    const body = newNoteBody.trim();
    if (!body) return;

    const prev = (activity.notes || "").trim();
    const timestamp = new Date().toLocaleString();
    const newBlock = `[${timestamp}] ${body}`;
    const merged = prev ? `${prev}\n\n${newBlock}` : newBlock;

    mReassign.mutate({
      assigned_to: (activity as any).assigned_to ?? null,
      assigned_to_2: (activity as any).assigned_to_2 ?? null,
      title: activity.title ?? null,
      notes: merged,
      account_id: (activity as any).account_id ?? null,
      contact_id: (activity as any).contact_id ?? null,
      deal_id: (activity as any).deal_id ?? null,
      lead_id: (activity as any).lead_id ?? null,
      status: activity.status ?? null,
      due_date: (activity as any).due_date ?? null,
      type: activity.type ?? null,
    });
  };

  const handleDeleteNoteAt = (index: number) => {
    if (!activity) return;
    const nextBlocks = noteBlocks.filter((_, i) => i !== index);
    const merged = nextBlocks.join("\n\n");

    mReassign.mutate({
      assigned_to: (activity as any).assigned_to ?? null,
      assigned_to_2: (activity as any).assigned_to_2 ?? null,
      title: activity.title ?? null,
      notes: merged ? merged : null,
      account_id: (activity as any).account_id ?? null,
      contact_id: (activity as any).contact_id ?? null,
      deal_id: (activity as any).deal_id ?? null,
      lead_id: (activity as any).lead_id ?? null,
      status: activity.status ?? null,
      due_date: (activity as any).due_date ?? null,
      type: activity.type ?? null,
    });
  };

  // Guardar título
  const handleSaveTitle = () => {
    if (!activity) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      alert("El nombre no puede quedar vacío.");
      return;
    }

    mReassign.mutate({
      assigned_to: (activity as any).assigned_to ?? null,
      assigned_to_2: (activity as any).assigned_to_2 ?? null,
      title: nextTitle,
      notes: activity.notes ?? null,
      account_id: (activity as any).account_id ?? null,
      contact_id: (activity as any).contact_id ?? null,
      deal_id: (activity as any).deal_id ?? null,
      lead_id: (activity as any).lead_id ?? null,
      status: activity.status ?? null,
      due_date: (activity as any).due_date ?? null,
      type: activity.type ?? null,
    });

    setEditingTitle(false);
  };

  // Relacionados
  const contextChips = useMemo(() => {
    if (!activity) return [];
    const cs: { label: string; href: string }[] = [];

    const accounts = asArray<any>(qAcc.data);
    const contacts = asArray<any>(qCon.data);
    const deals = asArray<any>(qDeal.data);
    const leads = asArray<any>(qLead.data);

    if ((activity as any).account_id) {
      const name =
        accounts.find((x) => x.id === (activity as any).account_id)?.name ??
        (activity as any).account_id;
      cs.push({ label: `Cuenta: ${name}`, href: `/accounts/${(activity as any).account_id}` });
    }
    if ((activity as any).contact_id) {
      const name =
        contacts.find((x) => x.id === (activity as any).contact_id)?.name ??
        (activity as any).contact_id;
      cs.push({ label: `Contacto: ${name}`, href: `/contacts/${(activity as any).contact_id}` });
    }
    if ((activity as any).deal_id) {
      const name =
        deals.find((x) => x.id === (activity as any).deal_id)?.title ??
        (activity as any).deal_id;
      cs.push({ label: `Oportunidad: ${name}`, href: `/deals/${(activity as any).deal_id}` });
    }
    if ((activity as any).lead_id) {
      const name =
        leads.find((x) => x.id === (activity as any).lead_id)?.name ??
        (activity as any).lead_id;
      cs.push({ label: `Lead: ${name}`, href: `/leads/${(activity as any).lead_id}` });
    }

    return cs;
  }, [activity, qAcc.data, qCon.data, qDeal.data, qLead.data]);

  const isDoneUI = activity?.status === "done" || completedMaster.has(activity?.id ?? "");
  const isInProgressUI = !isDoneUI && inProgressMaster.has(activity?.id ?? "");
  const statusLabel = isDoneUI ? "Realizada" : isInProgressUI ? "En proceso" : "Abierta";

  const assigneesLabel = useMemo(() => {
    if (!activity) return "Sin asignar";

    const names: string[] = [];
    const a: any = activity;

    if (a.assigned_to_name) names.push(a.assigned_to_name);
    else if (a.assigned_to) names.push(String(a.assigned_to));

    if (a.assigned_to_2_name) names.push(a.assigned_to_2_name);
    else if (a.assigned_to_2) names.push(String(a.assigned_to_2));

    if (names.length === 0) return "Sin asignar";
    if (names.length === 1) return names[0];
    return `${names[0]} y ${names[1]}`;
  }, [
    activity?.assigned_to_name,
    activity?.assigned_to_2_name,
    (activity as any)?.assigned_to,
    (activity as any)?.assigned_to_2,
  ]);

  const draftLabel = useMemo(() => {
    const names: string[] = [];
    if (draftAssignees.assigned_to) names.push(getMemberLabel(draftAssignees.assigned_to));
    if (draftAssignees.assigned_to_2) names.push(getMemberLabel(draftAssignees.assigned_to_2));
    if (names.length === 0) return "Sin asignar";
    if (names.length === 1) return names[0];
    return `${names[0]} y ${names[1]}`;
  }, [draftAssignees, getMemberLabel]);

  const headerRight = useCallback(() => {
    return (
      <Pressable
        onPress={() => setShowConfirm(true)}
        hitSlop={8}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={{ color: DANGER, fontWeight: "900" }}>Eliminar</Text>
      </Pressable>
    );
  }, []);

  const screenOptions = useMemo(() => {
    return {
      title: "Detalle Actividad",
      headerStyle: { backgroundColor: BG },
      headerTintColor: TEXT,
      headerTitleStyle: { color: TEXT, fontWeight: "800" as const },
      headerRight,
    };
  }, [headerRight]);

  // ✅ BOTÓN ELEGIR: mini calendario modal (web + mobile)
  const openDatePicker = () => {
    setReminderError(null);
    setMiniCalOpen(true);
  };

  // valor base para el calendario
  const calValue = useMemo(() => {
    const d = ymdToDate(dateStr);
    return d ?? new Date();
  }, [dateStr]);

  return (
    <>
      <Stack.Screen options={screenOptions} />

      {/* ✅ Scroll arreglado: ahora TODA la pantalla scrollea */}
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.screenContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
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
              {/* Titulo + editar */}
              <View style={styles.titleRow}>
                <View style={{ flex: 1 }}>
                  {editingTitle ? (
                    <TextInput
                      value={titleDraft}
                      onChangeText={setTitleDraft}
                      placeholder="Nombre de la actividad"
                      placeholderTextColor={SUBTLE}
                      style={[
                        styles.titleInput,
                        isDoneUI && { borderColor: "rgba(22,163,74,0.6)" },
                      ]}
                      returnKeyType="done"
                      onSubmitEditing={handleSaveTitle}
                    />
                  ) : (
                    <Text style={[styles.title, isDoneUI && styles.titleDone]} numberOfLines={2}>
                      {typeLabel(activity.type)}{" "}
                      {activity.title && activity.title.length > 0 ? activity.title : "Sin título"}
                    </Text>
                  )}
                </View>

                {editingTitle ? (
                  <View style={styles.titleActions}>
                    <Pressable
                      onPress={() => {
                        setTitleDraft(activity.title ?? "");
                        setEditingTitle(false);
                      }}
                      disabled={mReassign.isPending}
                      style={({ pressed }) => [
                        styles.smallBtn,
                        pressed && { opacity: 0.92 },
                        mReassign.isPending && { opacity: 0.5 },
                      ]}
                    >
                      <Text style={styles.smallBtnText}>Cancelar</Text>
                    </Pressable>

                    <Pressable
                      onPress={handleSaveTitle}
                      disabled={mReassign.isPending || !titleDraft.trim()}
                      style={({ pressed }) => [
                        styles.smallBtnPrimary,
                        pressed && { opacity: 0.92 },
                        (mReassign.isPending || !titleDraft.trim()) && { opacity: 0.5 },
                      ]}
                    >
                      <Text style={styles.smallBtnText}>Guardar</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setEditingTitle(true)}
                    style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.92 }]}
                  >
                    <Text style={styles.editBtnText}>Editar</Text>
                  </Pressable>
                )}
              </View>

              {/* Resumen */}
              {(() => {
                const a: any = activity;

                const assignedNames: string[] = [];
                if (a.assigned_to_name) assignedNames.push(a.assigned_to_name);
                else if (a.assigned_to) assignedNames.push(String(a.assigned_to));

                if (a.assigned_to_2_name) assignedNames.push(a.assigned_to_2_name);
                else if (a.assigned_to_2) assignedNames.push(String(a.assigned_to_2));

                const assignedInfo =
                  assignedNames.length === 0
                    ? " · sin asignar"
                    : assignedNames.length === 1
                    ? ` · asignada a ${assignedNames[0]}`
                    : ` · asignada a ${assignedNames[0]} y ${assignedNames[1]}`;

                const createdLabel = a.created_at ? ` · creada el ${formatDateShort(a.created_at)}` : "";
                const dueLabel = a.due_date ? ` · vence ${formatDateShort(a.due_date)}` : "";

                return (
                  <Text style={[styles.summary, isDoneUI && styles.summaryDone]}>
                    {(a.type || "task")} · {statusLabel}
                    {a.created_by_name ? ` · por ${a.created_by_name}` : ""}
                    {assignedInfo}
                    {createdLabel}
                    {dueLabel}
                    {isDoneUI ? " · tarea completada" : ""}
                  </Text>
                );
              })()}

              {/* Dropdown de asignación */}
              <View style={{ marginTop: 10, gap: 6 }}>
                <Text style={styles.itemLabel}>Personas asignadas (máx. 2)</Text>

                <View style={styles.dropdownWrapper}>
                  <Pressable
                    style={styles.dropdownTrigger}
                    onPress={() => setAssigneesMenuOpen((v) => !v)}
                    disabled={mReassign.isPending}
                  >
                    <Text style={styles.dropdownText} numberOfLines={1}>
                      {assigneesLabel}
                    </Text>
                    <Text style={styles.dropdownArrow}>{assigneesMenuOpen ? "▲" : "▼"}</Text>
                  </Pressable>

                  {assigneesMenuOpen && (
                    <View style={styles.dropdownMenu}>
                      <View style={styles.dropdownHeader}>
                        <Text style={styles.dropdownHeaderTitle} numberOfLines={1}>
                          Selección: {draftLabel}
                        </Text>
                        {draftDirty ? (
                          <Text style={styles.dropdownDirty}>Cambios sin guardar</Text>
                        ) : (
                          <Text style={styles.dropdownClean}>Sin cambios</Text>
                        )}
                      </View>

                      {qMembers.isLoading ? (
                        <View style={{ padding: 10 }}>
                          <Text style={styles.subtleSmall}>Cargando miembros…</Text>
                        </View>
                      ) : qMembers.isError ? (
                        <View style={{ padding: 10 }}>
                          <Text style={styles.error}>No se pudieron cargar los miembros.</Text>
                        </View>
                      ) : (qMembers.data ?? []).length === 0 ? (
                        <View style={{ padding: 10 }}>
                          <Text style={styles.subtleSmall}>No hay miembros.</Text>
                        </View>
                      ) : (
                        (qMembers.data ?? []).map((m) => {
                          const isSelected =
                            draftAssignees.assigned_to === m.id ||
                            draftAssignees.assigned_to_2 === m.id;

                          const disabled = !isSelected && draftSelectedCount >= 2;

                          return (
                            <Pressable
                              key={m.id}
                              style={[
                                styles.dropdownOption,
                                isSelected && styles.dropdownOptionActive,
                                disabled && { opacity: 0.45 },
                              ]}
                              onPress={() => toggleDraftMember(m.id)}
                              disabled={disabled || mReassign.isPending}
                            >
                              <Text
                                style={[
                                  styles.dropdownOptionText,
                                  isSelected && styles.dropdownOptionTextActive,
                                ]}
                                numberOfLines={1}
                              >
                                {m.name || m.email || m.id}
                                {isSelected ? "  OK" : ""}
                              </Text>
                            </Pressable>
                          );
                        })
                      )}

                      <View style={styles.dropdownFooter}>
                        <Pressable
                          style={[styles.footerBtn, styles.footerBtnGhost]}
                          onPress={() => {
                            setDraftAssignees(currentAssignees);
                            setAssigneesMenuOpen(false);
                          }}
                          disabled={mReassign.isPending}
                        >
                          <Text style={styles.footerBtnText}>Cancelar</Text>
                        </Pressable>

                        <Pressable
                          style={[
                            styles.footerBtn,
                            styles.footerBtnPrimary,
                            (!draftDirty || mReassign.isPending) && { opacity: 0.5 },
                          ]}
                          onPress={requestSaveAssignees}
                          disabled={!draftDirty || mReassign.isPending}
                        >
                          <Text style={styles.footerBtnText}>Guardar cambios</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>

                {mReassign.isPending && <Text style={styles.subtleSmall}>Actualizando…</Text>}
              </View>

              {/* Estado dropdown (solo front) */}
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
                      <Pressable
                        style={styles.statusOption}
                        onPress={() => {
                          markAsOpen(activity.id);
                          setLocalStatus("open");
                          setStatusMenuOpen(false);
                        }}
                      >
                        <Text style={styles.statusOptionText}>Abierta</Text>
                      </Pressable>

                      <Pressable
                        style={styles.statusOption}
                        onPress={() => {
                          markInProgress(activity.id);
                          setLocalStatus("canceled");
                          setStatusMenuOpen(false);
                        }}
                      >
                        <Text style={styles.statusOptionText}>En proceso</Text>
                      </Pressable>

                      <Pressable
                        style={styles.statusOption}
                        onPress={() => {
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
              <View style={{ marginTop: 12 }}>
                <Text style={styles.subSectionTitle}>Notas de la actividad</Text>

                {noteBlocks.length > 0 && (
                  <View style={styles.notesHistoryWrapper}>
                    <ScrollView
                      style={styles.notesHistoryScroll}
                      nestedScrollEnabled
                      contentContainerStyle={styles.notesHistoryContent}
                      showsVerticalScrollIndicator={false}
                    >
                      {noteBlocks.map((block, idx) => (
                        <View key={idx} style={styles.noteRow}>
                          <Text style={styles.notesHistoryText}>{block}</Text>

                          <Pressable
                            onPress={() => handleDeleteNoteAt(idx)}
                            disabled={mReassign.isPending}
                            style={[styles.noteDeleteBtn, mReassign.isPending && { opacity: 0.5 }]}
                            hitSlop={8}
                          >
                            <Text style={styles.noteDeleteText}>Borrar</Text>
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.historyInputRow}>
                  <TextInput
                    style={styles.historyInput}
                    placeholder="Escribe una nueva nota…"
                    placeholderTextColor={SUBTLE}
                    value={newNoteBody}
                    onChangeText={setNewNoteBody}
                    multiline
                  />
                  <Pressable
                    style={[
                      styles.historyAddBtn,
                      (!newNoteBody.trim() || mReassign.isPending) && { opacity: 0.5 },
                    ]}
                    onPress={handleAddNote}
                    disabled={!newNoteBody.trim() || mReassign.isPending}
                  >
                    <Text style={styles.historyAddText}>Agregar</Text>
                  </Pressable>
                </View>
              </View>

              {/* ✅ Reagendar / Recordatorio (AHORA debajo de Notas) */}
              <View style={{ marginTop: 12, gap: 6 }}>
                <Text style={styles.subSectionTitle}>Reagendar / Recordatorio</Text>

                <View style={styles.reminderBox}>
                  <View style={styles.reminderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemLabel}>Fecha (DD/MM/AAAA)</Text>
                      <TextInput
                        style={styles.reminderInput}
                        value={dateInput}
                        onChangeText={(txt) => {
                          setDateInput(txt);
                          const normalized = ddmmyyyyToYYYYMMDD(txt);
                          if (normalized) {
                            setDateStr(normalized);
                            setReminderError(null);
                          } else if (!txt.trim()) {
                            setDateStr("");
                          }
                        }}
                        placeholder="28/02/2026"
                        placeholderTextColor={SUBTLE}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>

                    <Pressable style={styles.reminderPickBtn} onPress={openDatePicker}>
                      <Text style={styles.reminderPickBtnText}>Elegir</Text>
                    </Pressable>
                  </View>

                  <View style={styles.reminderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemLabel}>Hora (HH:MM)</Text>
                      <TextInput
                        style={styles.reminderInput}
                        value={timeStr}
                        onChangeText={setTimeStr}
                        placeholder="14:30"
                        placeholderTextColor={SUBTLE}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>

                    <View style={{ alignItems: "center", justifyContent: "flex-end" }}>
                      <Text style={styles.itemLabel}>Recordarme</Text>
                      <Switch
                        value={remind}
                        onValueChange={setRemind}
                        trackColor={{ false: "#444", true: PRIMARY }}
                        thumbColor={remind ? "#fff" : "#ccc"}
                      />
                    </View>
                  </View>

                  {!!reminderError && <Text style={styles.error}>{reminderError}</Text>}

                  <Pressable
                    style={[
                      styles.reminderSaveBtn,
                      (mReschedule.isPending || qAct.isFetching) && { opacity: 0.6 },
                    ]}
                    onPress={() => mReschedule.mutate()}
                    disabled={mReschedule.isPending || !activity}
                  >
                    <Text style={styles.reminderSaveBtnText}>
                      {mReschedule.isPending ? "Guardando…" : "Guardar"}
                    </Text>
                  </Pressable>

                  <Text style={styles.subtleSmall}>
                    Actualiza la fecha y agenda en Google (o encola si no hay conexión).
                  </Text>
                </View>
              </View>

              {/* Relacionados */}
              {contextChips.length > 0 && (
                <View style={{ marginTop: 10, gap: 6 }}>
                  <Text style={[styles.itemLabel, { marginBottom: 2 }]}>Relacionado con</Text>
                  <View style={styles.chipsRow}>
                    {contextChips.map((c) => (
                      <Link key={c.href} href={c.href as any} asChild>
                        <Pressable style={styles.chip} accessibilityRole="link" hitSlop={8}>
                          <Text style={styles.chipText}>{c.label}</Text>
                        </Pressable>
                      </Link>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Eliminar actividad */}
            <Pressable
              style={[styles.btn, styles.btnDanger, mDelete.isPending && { opacity: 0.9 }]}
              onPress={() => setShowConfirm(true)}
              disabled={mDelete.isPending}
            >
              <Text style={styles.btnText}>{mDelete.isPending ? "Eliminando…" : "Eliminar"}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* ✅ Mini calendario modal */}
      <MiniCalendarModal
        visible={miniCalOpen}
        value={calValue}
        onClose={() => setMiniCalOpen(false)}
        onSelect={(d) => {
          const ymd = dateToYYYYMMDD(d);
          setDateStr(ymd);
          setDateInput(yyyymmddToDDMMYYYY(ymd));
          setReminderError(null);
          setMiniCalOpen(false);
        }}
      />

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

      <Confirm
        visible={showReassignConfirm}
        title="Confirmar cambio de asignación"
        message={pendingReassignMessage || "¿Confirmas este cambio de asignación?"}
        confirmText="Confirmar"
        cancelText="Cancelar"
        onCancel={cancelPendingReassign}
        onConfirm={applyPendingReassign}
      />
    </>
  );
}

/* Helpers */
function typeLabel(t: "task" | "call" | "meeting" | "note") {
  if (t === "call") return "LLAMADA";
  if (t === "meeting") return "REUNION";
  if (t === "note") return "NOTA";
  return "";
}

function formatDateShort(value?: number | string | null): string {
  if (value == null) return "—";

  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "—";
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString();
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

/* Estilos */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },

  screenContent: {
    width: "100%",
    maxWidth: 1080,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },

  card: {
    minWidth: 0,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 20,
    gap: 12,
  },

  cardDone: {
    borderColor: "#badfc8",
    backgroundColor: "#f4fbf6",
  },

  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: 12,
  },

  title: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "700",
    color: TEXT,
  },

  titleDone: {
    color: SUCCESS,
  },

  titleInput: {
    minWidth: 0,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: TEXT,
    fontSize: 17,
    fontWeight: "600",
  },

  titleActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  editBtn: {
    minHeight: 36,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#daceef",
    backgroundColor: "#f1ecfa",
  },

  editBtnText: {
    color: PRIMARY,
    fontWeight: "600",
    fontSize: 12,
  },

  smallBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 7,
    backgroundColor: "#596274",
  },

  smallBtnPrimary: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 7,
    backgroundColor: PRIMARY,
  },

  smallBtnText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 12,
  },

  summary: {
    color: SUBTLE,
    fontSize: 12,
    lineHeight: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  summaryDone: {
    color: SUCCESS,
  },

  itemLabel: {
    color: "#596274",
    fontWeight: "600",
    fontSize: 12,
    marginBottom: 5,
  },

  subtle: {
    color: SUBTLE,
    fontSize: 13,
    lineHeight: 20,
  },

  subtleSmall: {
    color: SUBTLE,
    fontSize: 12,
    lineHeight: 19,
  },

  error: {
    color: "#a12637",
    fontSize: 13,
    lineHeight: 20,
  },

  reminderBox: {
    borderWidth: 1,
    borderColor: "#e2d9f2",
    backgroundColor: "#faf8fe",
    borderRadius: 10,
    padding: 16,
    gap: 14,
  },

  reminderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-end",
  },

  reminderInput: {
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: "#ffffff",
    color: TEXT,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },

  reminderPickBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#daceef",
    backgroundColor: "#eee8f8",
    alignSelf: "flex-end",
    alignItems: "center",
    justifyContent: "center",
  },

  reminderPickBtnText: {
    color: PRIMARY,
    fontWeight: "600",
    fontSize: 12,
  },

  reminderSaveBtn: {
    marginTop: 2,
    minHeight: 44,
    backgroundColor: PRIMARY,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  reminderSaveBtnText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 13,
  },

  dropdownWrapper: {
    width: "100%",
    maxWidth: 440,
    minWidth: 0,
    alignSelf: "flex-start",
  },

  dropdownTrigger: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
  },

  dropdownText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
    minWidth: 0,
  },

  dropdownArrow: {
    color: SUBTLE,
    fontSize: 10,
  },

  dropdownMenu: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },

  dropdownHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: "#fafbfe",
    gap: 5,
  },

  dropdownHeaderTitle: {
    color: TEXT,
    fontWeight: "600",
    fontSize: 12,
  },

  dropdownDirty: {
    color: "#986412",
    fontWeight: "600",
    fontSize: 11,
  },

  dropdownClean: {
    color: SUBTLE,
    fontWeight: "500",
    fontSize: 11,
  },

  dropdownOption: {
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eef0f5",
  },

  dropdownOptionActive: {
    backgroundColor: "#f1ecfa",
  },

  dropdownOptionText: {
    color: TEXT,
    fontSize: 13,
  },

  dropdownOptionTextActive: {
    color: PRIMARY,
    fontWeight: "600",
  },

  dropdownFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },

  footerBtn: {
    flexGrow: 1,
    flexBasis: 120,
    minHeight: 40,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  footerBtnPrimary: {
    backgroundColor: PRIMARY,
  },

  footerBtnGhost: {
    backgroundColor: "#596274",
  },

  footerBtnText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 12,
    textAlign: "center",
  },

  stateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },

  statusChip: {
    minHeight: 34,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  statusChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#344054",
  },

  statusOpen: {
    backgroundColor: "#f5f6fa",
    borderColor: "#dce0e9",
  },

  statusInProgress: {
    backgroundColor: "#e8f0ff",
    borderColor: "#bed0f1",
  },

  statusDone: {
    backgroundColor: "#e3f4e9",
    borderColor: "#badfc8",
  },

  statusList: {
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },

  statusOption: {
    minHeight: 36,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eef0f5",
  },

  statusOptionText: {
    fontSize: 12,
    color: TEXT,
  },

  subSectionTitle: {
    color: TEXT,
    fontWeight: "600",
    fontSize: 15,
    marginBottom: 8,
  },

  notesHistoryWrapper: {
    maxHeight: 280,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fafbfe",
    overflow: "hidden",
    marginTop: 6,
  },

  notesHistoryScroll: {
    maxHeight: 280,
  },

  notesHistoryContent: {
    paddingVertical: 4,
  },

  noteRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  notesHistoryText: {
    color: "#344054",
    fontSize: 13,
    lineHeight: 21,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 240,
    minWidth: 0,
  },

  noteDeleteBtn: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },

  noteDeleteText: {
    color: DANGER,
    fontWeight: "600",
    fontSize: 12,
  },

  historyInputRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "flex-start",
    marginTop: 10,
  },

  historyInput: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 260,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: TEXT,
    fontSize: 14,
    lineHeight: 21,
    minHeight: 80,
    maxHeight: 180,
    textAlignVertical: "top",
  },

  historyAddBtn: {
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 7,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },

  historyAddText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 12,
  },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  chip: {
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#daceef",
    backgroundColor: "#f1ecfa",
  },

  chipText: {
    color: PRIMARY,
    fontWeight: "600",
    fontSize: 12,
    flexShrink: 1,
  },

  btn: {
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  btnDanger: {
    backgroundColor: DANGER,
    alignSelf: "flex-start",
  },

  btnText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 13,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(23,29,45,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  modalCardCalendar: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 10,
  },

  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  calNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#f5f6fa",
    alignItems: "center",
    justifyContent: "center",
  },

  calNavTxt: {
    color: TEXT,
    fontSize: 20,
    fontWeight: "600",
  },

  calTitle: {
    color: TEXT,
    fontWeight: "600",
    fontSize: 14,
    flexShrink: 1,
    textAlign: "center",
  },

  calWeekRow: {
    flexDirection: "row",
  },

  calWeekTxt: {
    width: "14.28%",
    textAlign: "center",
    color: SUBTLE,
    fontSize: 12,
  },

  calGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
  },

  calDay: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    marginVertical: 2,
  },

  calDayOff: {
    opacity: 0.45,
  },

  calDaySelected: {
    backgroundColor: "#eee8f8",
    borderWidth: 1,
    borderColor: "#b49bdc",
  },

  calDayTxt: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "500",
  },

  calDayTxtOff: {
    color: SUBTLE,
  },

  calDayTxtSelected: {
    color: PRIMARY,
    fontWeight: "700",
  },

  calFooter: {
    alignItems: "flex-end",
    marginTop: 6,
  },

  calCloseBtn: {
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#daceef",
    backgroundColor: "#f1ecfa",
  },

  calCloseTxt: {
    color: PRIMARY,
    fontWeight: "600",
    fontSize: 12,
  },
});