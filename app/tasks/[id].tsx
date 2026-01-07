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

import Confirm from "@/src/ui/Confirm";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/* Paleta */
const PRIMARY = "#7C3AED";
const BG = "#0F1115";
const CARD = "#171923";
const BORDER = "#2B3140";
const TEXT = "#F3F4F6";
const SUBTLE = "#A4ADBD";
const DANGER = "#EF4444";
const SUCCESS = "#16a34a";

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

  // Catálogos (tipados como arrays para evitar errores TS en .find)
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

  // Guardar título (sin notificar)
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

  // Relacionados (usa asArray para evitar .find en objetos)
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

  // Label dropdown asignados (de activity real)
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

  // Label preview draft
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

  return (
    <>
      <Stack.Screen options={screenOptions} />

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

                const createdLabel = a.created_at
                  ? ` · creada el ${formatDateShort(a.created_at)}`
                  : "";

                return (
                  <Text style={[styles.summary, isDoneUI && styles.summaryDone]}>
                    {(a.type || "task")} · {statusLabel}
                    {a.created_by_name ? ` · por ${a.created_by_name}` : ""}
                    {assignedInfo}
                    {createdLabel}
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

  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  title: { fontSize: 20, fontWeight: "900", color: TEXT },
  titleDone: { color: SUCCESS },

  titleInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#11121b",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: TEXT,
    fontSize: 16,
    fontWeight: "900",
  },

  titleActions: { flexDirection: "row", gap: 8 },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  editBtnText: { color: TEXT, fontWeight: "900", fontSize: 12 },

  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  smallBtnPrimary: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: PRIMARY,
  },
  smallBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  summary: { color: SUBTLE, fontSize: 12 },
  summaryDone: { color: SUCCESS },

  itemLabel: { color: SUBTLE, fontWeight: "700" },

  subtle: { color: SUBTLE },
  subtleSmall: { color: SUBTLE, fontSize: 11 },
  error: { color: "#fecaca" },

  // Dropdown (asignación)
  dropdownWrapper: { alignSelf: "flex-start", minWidth: 240 },
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#11121b",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownText: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  dropdownArrow: { color: SUBTLE, fontSize: 10, marginLeft: 6 },

  dropdownMenu: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#11121b",
    overflow: "hidden",
    minWidth: 240,
  },

  dropdownHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2933",
    gap: 4,
  },
  dropdownHeaderTitle: { color: TEXT, fontWeight: "800", fontSize: 12 },
  dropdownDirty: { color: "#FDE68A", fontWeight: "800", fontSize: 11 },
  dropdownClean: { color: SUBTLE, fontWeight: "700", fontSize: 11 },

  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2933",
  },
  dropdownOptionActive: { backgroundColor: "#1f2937" },
  dropdownOptionText: { color: TEXT, fontSize: 12 },
  dropdownOptionTextActive: { color: "#E9D5FF", fontWeight: "800" },

  dropdownFooter: {
    flexDirection: "row",
    gap: 10,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#1f2933",
  },
  footerBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  footerBtnPrimary: { backgroundColor: PRIMARY },
  footerBtnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  footerBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  // Estado
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
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
  statusOpen: { backgroundColor: "#e5e7eb", borderColor: "#9ca3af" },
  statusInProgress: { backgroundColor: "#DBEAFE", borderColor: "#3b82f6" },
  statusDone: { backgroundColor: "#dcfce7", borderColor: "#22c55e" },
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
  statusOptionText: { fontSize: 12, color: "#0F172A" },

  // Notas
  subSectionTitle: {
    color: TEXT,
    fontWeight: "800",
    fontSize: 15,
    marginBottom: 4,
  },
  notesHistoryWrapper: {
    maxHeight: 220,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#11121b",
    overflow: "hidden",
    marginTop: 6,
  },
  notesHistoryScroll: { maxHeight: 220 },
  notesHistoryContent: { paddingVertical: 4 },

  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  notesHistoryText: { color: TEXT, fontSize: 13, flex: 1 },
  noteDeleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.18)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  noteDeleteText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  historyInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    marginTop: 10,
  },
  historyInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#11121b",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: TEXT,
    fontSize: 13,
    minHeight: 40,
    maxHeight: 80,
  },
  historyAddBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },
  historyAddText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  // Relacionados
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

  // Eliminar actividad
  btn: { padding: 12, borderRadius: 12, alignItems: "center" },
  btnDanger: { backgroundColor: DANGER },
  btnText: { color: "#fff", fontWeight: "900" },
});


// // app/tasks/[id].tsx
// import {
//   deleteActivity,
//   getActivity,
//   listActivities,
//   updateActivity,
//   type Activity,
//   type ActivityStatus,
// } from "@/src/api/activities";
// import {
//   listWorkspaceMembers,
//   type WorkspaceMember,
// } from "@/src/api/workspaceMembers";


// import { listAccounts } from "@/src/api/accounts";
// import { listContacts } from "@/src/api/contacts";
// import { listDeals } from "@/src/api/deals";
// import { listLeads } from "@/src/api/leads";

// import Confirm from "@/src/ui/Confirm";
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { Link, router, Stack, useLocalSearchParams } from "expo-router";
// import { useCallback, useEffect, useMemo, useState } from "react";
// import {
//   ActivityIndicator,
//   Pressable,
//   ScrollView,
//   StyleSheet,
//   Text,
//   TextInput,
//   View,
// } from "react-native";

// /* 🎨 Paleta */
// const PRIMARY = "#7C3AED";
// const BG = "#0F1115";
// const CARD = "#171923";
// const BORDER = "#2B3140";
// const TEXT = "#F3F4F6";
// const SUBTLE = "#A4ADBD";
// const DANGER = "#EF4444";
// const SUCCESS = "#16a34a";

// /** Estados permitidos */
// type Status = ActivityStatus;

// /** Activity enriquecida */
// type ActivityWithCreator = Activity & {
//   created_by_name?: string | null;
//   created_by_email?: string | null;
//   assigned_to_name?: string | null;
//   assigned_to_2_name?: string | null;
// };

// /** Maestro global UI */
// const MASTER_COMPLETED_KEY = "completedActivities:v1:all";
// const MASTER_INPROGRESS_KEY = "inProgressActivities:v1:all";

// type Assignees = { assigned_to: string | null; assigned_to_2: string | null };

// export default function TaskDetail() {
//   const { id } = useLocalSearchParams<{ id: string }>();
//   const qc = useQueryClient();

//   const [showConfirm, setShowConfirm] = useState(false);

//   // ✅ confirmación única de reasignación (solo al guardar)
//   const [showReassignConfirm, setShowReassignConfirm] = useState(false);
//   const [pendingReassign, setPendingReassign] = useState<Assignees | null>(null);
//   const [pendingReassignMessage, setPendingReassignMessage] = useState("");

//   const [completedMaster, setCompletedMaster] = useState<Set<string>>(new Set());
//   const [inProgressMaster, setInProgressMaster] = useState<Set<string>>(new Set());

//   // dropdown de estado
//   const [statusMenuOpen, setStatusMenuOpen] = useState(false);
//   const [localStatus, setLocalStatus] = useState<Status | null>(null);

//   // 🆕 nota nueva
//   const [newNoteBody, setNewNoteBody] = useState("");

//   // ✅ dropdown asignación (modo edición local + guardar)
//   const [assigneesMenuOpen, setAssigneesMenuOpen] = useState(false);
//   const [draftAssignees, setDraftAssignees] = useState<Assignees>({
//     assigned_to: null,
//     assigned_to_2: null,
//   });

//   // Cargar maestro UI
//   useEffect(() => {
//     (async () => {
//       try {
//         const [rawCompleted, rawInProgress] = await Promise.all([
//           AsyncStorage.getItem(MASTER_COMPLETED_KEY),
//           AsyncStorage.getItem(MASTER_INPROGRESS_KEY),
//         ]);
//         setCompletedMaster(new Set<string>(rawCompleted ? JSON.parse(rawCompleted) : []));
//         setInProgressMaster(new Set<string>(rawInProgress ? JSON.parse(rawInProgress) : []));
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

//   // Cache lista (opcional)
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

//   // Miembros del workspace actual
// const qMembers = useQuery<WorkspaceMember[]>({
//   queryKey: ["workspaceMembers"],
//   queryFn: listWorkspaceMembers,
// });

//   const getMemberLabel = useCallback(
//     (memberId: string) => {
//       const m = (qMembers.data ?? []).find((x) => x.id === memberId);
//       return m?.name || m?.email || memberId;
//     },
//     [qMembers.data]
//   );

//   const describeAssignees = useCallback(
//     (a: Assignees) => {
//       const names: string[] = [];
//       if (a.assigned_to) names.push(getMemberLabel(a.assigned_to));
//       if (a.assigned_to_2) names.push(getMemberLabel(a.assigned_to_2));
//       if (names.length === 0) return "sin asignar";
//       if (names.length === 1) return names[0];
//       return `${names[0]} y ${names[1]}`;
//     },
//     [getMemberLabel]
//   );

//   const diffAssigneesMessage = useCallback(
//     (prev: Assignees, next: Assignees): string => {
//       const p = [prev.assigned_to, prev.assigned_to_2].filter(Boolean) as string[];
//       const n = [next.assigned_to, next.assigned_to_2].filter(Boolean) as string[];

//       const added = n.filter((x) => !p.includes(x));
//       const removed = p.filter((x) => !n.includes(x));

//       if (added.length === 0 && removed.length === 0) return `No hay cambios en la asignación.`;

//       if (n.length === 0 && removed.length > 0 && added.length === 0) {
//         const who =
//           removed.length === 1
//             ? getMemberLabel(removed[0])
//             : `${getMemberLabel(removed[0])} y ${getMemberLabel(removed[1])}`;
//         return `Vas a dejar la actividad sin asignar (se desasigna a ${who}).`;
//       }

//       if (p.length === 0 && added.length > 0 && removed.length === 0) {
//         const who =
//           added.length === 1
//             ? getMemberLabel(added[0])
//             : `${getMemberLabel(added[0])} y ${getMemberLabel(added[1])}`;
//         return `Vas a asignar la actividad a ${who}.`;
//       }

//       if (added.length === 1 && removed.length === 1) {
//         return `Vas a reasignar: se desasigna a ${getMemberLabel(
//           removed[0]
//         )} y se asigna a ${getMemberLabel(added[0])}.`;
//       }

//       if (added.length > 0 && removed.length === 0) {
//         const who =
//           added.length === 1
//             ? getMemberLabel(added[0])
//             : `${getMemberLabel(added[0])} y ${getMemberLabel(added[1])}`;
//         return `Vas a agregar a ${who} como responsable.`;
//       }

//       if (removed.length > 0 && added.length === 0) {
//         const who =
//           removed.length === 1
//             ? getMemberLabel(removed[0])
//             : `${getMemberLabel(removed[0])} y ${getMemberLabel(removed[1])}`;
//         return `Vas a desasignar a ${who}. La actividad quedará asignada a ${describeAssignees(next)}.`;
//       }

//       return `Vas a cambiar la asignación: quedará asignada a ${describeAssignees(next)}.`;
//     },
//     [describeAssignees, getMemberLabel]
//   );

//   // Helpers UI estado (solo visual)
//   const markAsOpen = (actId: string) => {
//     setCompletedMaster((prev) => {
//       if (!prev.has(actId)) return prev;
//       const next = new Set(prev);
//       next.delete(actId);
//       AsyncStorage.setItem(MASTER_COMPLETED_KEY, JSON.stringify(Array.from(next))).catch(() => {});
//       return next;
//     });
//     setInProgressMaster((prev) => {
//       if (!prev.has(actId)) return prev;
//       const next = new Set(prev);
//       next.delete(actId);
//       AsyncStorage.setItem(MASTER_INPROGRESS_KEY, JSON.stringify(Array.from(next))).catch(
//         () => {}
//       );
//       return next;
//     });
//   };

//   const markAsCompleted = (actId: string) => {
//     setInProgressMaster((prev) => {
//       if (!prev.has(actId)) return prev;
//       const next = new Set(prev);
//       next.delete(actId);
//       AsyncStorage.setItem(MASTER_INPROGRESS_KEY, JSON.stringify(Array.from(next))).catch(
//         () => {}
//       );
//       return next;
//     });
//     setCompletedMaster((prev) => {
//       if (prev.has(actId)) return prev;
//       const next = new Set(prev);
//       next.add(actId);
//       AsyncStorage.setItem(MASTER_COMPLETED_KEY, JSON.stringify(Array.from(next))).catch(
//         () => {}
//       );
//       return next;
//     });
//   };

//   const markInProgress = (actId: string) => {
//     setCompletedMaster((prev) => {
//       if (!prev.has(actId)) return prev;
//       const next = new Set(prev);
//       next.delete(actId);
//       AsyncStorage.setItem(MASTER_COMPLETED_KEY, JSON.stringify(Array.from(next))).catch(
//         () => {}
//       );
//       return next;
//     });
//     setInProgressMaster((prev) => {
//       if (prev.has(actId)) return prev;
//       const next = new Set(prev);
//       next.add(actId);
//       AsyncStorage.setItem(MASTER_INPROGRESS_KEY, JSON.stringify(Array.from(next))).catch(
//         () => {}
//       );
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
//           await AsyncStorage.setItem(MASTER_COMPLETED_KEY, JSON.stringify([...next]));
//         } catch {}
//       }
//       await qc.invalidateQueries({ queryKey: ["activities-all"] });
//       await qc.invalidateQueries({ queryKey: ["activities"] });
//       router.back();
//     },
//     onError: () => alert("No se pudo eliminar la actividad. Intenta nuevamente."),
//   });

//   // 🔁 updateActivity (reasignación / notas)
//   const mReassign = useMutation({
//     mutationFn: async (payload: {
//       assigned_to: string | null;
//       assigned_to_2: string | null;
//       title?: string | null;
//       notes?: string | null;
//       account_id?: string | null;
//       contact_id?: string | null;
//       deal_id?: string | null;
//       lead_id?: string | null;
//       status?: ActivityStatus | null;
//       due_date?: number | null;
//       type?: Activity["type"] | null;

//       // ✅ NUEVO: solo se manda cuando el usuario confirma la reasignación
//       notify_assignees?: boolean;
//     }) => {
//       if (!id) throw new Error("Missing activity id");
//       await updateActivity(id, payload as any);
//     },
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["activity", id] });
//       await qc.invalidateQueries({ queryKey: ["activities"] });
//       await qc.invalidateQueries({ queryKey: ["activities-all"] });
//       setNewNoteBody("");
//     },
//     onError: (err) => {
//       alert(
//         "No se pudo actualizar la actividad. Intenta nuevamente.\n\n" +
//           String((err as any)?.message ?? err)
//       );
//     },
//   });

//   // Rellenar desde cache lista
//   const listAll =
//     (qc.getQueryData<ActivityWithCreator[]>(["activities-all"]) ?? []) as
//       | ActivityWithCreator[]
//       | [];
//   const fromList = listAll.find((a) => a.id === id);

//   const activity: ActivityWithCreator | undefined = qAct.data
//     ? ({ ...(fromList || {}), ...qAct.data } as ActivityWithCreator)
//     : fromList;

//   const currentAssignees: Assignees = useMemo(() => {
//     const a: any = activity;
//     return {
//       assigned_to: a?.assigned_to ?? null,
//       assigned_to_2: a?.assigned_to_2 ?? null,
//     };
//   }, [(activity as any)?.assigned_to, (activity as any)?.assigned_to_2]);

//   // ✅ FIX LOOP: al abrir menú, clonar SOLO si cambió realmente (y dependencias primitivas)
//   useEffect(() => {
//     if (!assigneesMenuOpen) return;
//     setDraftAssignees((prev) => {
//       if (
//         prev.assigned_to === currentAssignees.assigned_to &&
//         prev.assigned_to_2 === currentAssignees.assigned_to_2
//       ) {
//         return prev;
//       }
//       return {
//         assigned_to: currentAssignees.assigned_to,
//         assigned_to_2: currentAssignees.assigned_to_2,
//       };
//     });
//   }, [assigneesMenuOpen, currentAssignees.assigned_to, currentAssignees.assigned_to_2]);

//   const draftDirty = useMemo(() => {
//     return (
//       draftAssignees.assigned_to !== currentAssignees.assigned_to ||
//       draftAssignees.assigned_to_2 !== currentAssignees.assigned_to_2
//     );
//   }, [draftAssignees, currentAssignees]);

//   const draftSelectedCount = useMemo(() => {
//     return [draftAssignees.assigned_to, draftAssignees.assigned_to_2].filter(Boolean).length;
//   }, [draftAssignees]);

//   const toggleDraftMember = (memberId: string) => {
//     setDraftAssignees((prev) => {
//       let primary = prev.assigned_to;
//       let secondary = prev.assigned_to_2;

//       const isPrimary = primary === memberId;
//       const isSecondary = secondary === memberId;

//       if (isPrimary) primary = null;
//       else if (isSecondary) secondary = null;
//       else {
//         if (!primary) primary = memberId;
//         else if (!secondary) secondary = memberId;
//         else return prev; // max 2
//       }

//       return { assigned_to: primary, assigned_to_2: secondary };
//     });
//   };

//   const requestSaveAssignees = () => {
//     if (!activity) return;
//     const msg = diffAssigneesMessage(currentAssignees, draftAssignees);
//     setPendingReassign(draftAssignees);
//     setPendingReassignMessage(msg);
//     setShowReassignConfirm(true);
//   };

//   const applyPendingReassign = () => {
//     if (!activity || !pendingReassign) return;

//     // ✅ CLAVE: aquí SÍ mandamos notify_assignees=true
//     mReassign.mutate({
//       assigned_to: pendingReassign.assigned_to,
//       assigned_to_2: pendingReassign.assigned_to_2,
//       title: activity.title ?? null,
//       notes: activity.notes ?? null,
//       account_id: (activity as any).account_id ?? null,
//       contact_id: (activity as any).contact_id ?? null,
//       deal_id: (activity as any).deal_id ?? null,
//       lead_id: (activity as any).lead_id ?? null,
//       status: activity.status ?? null,
//       due_date: (activity as any).due_date ?? null,
//       type: activity.type ?? null,
//       notify_assignees: true,
//     });

//     setShowReassignConfirm(false);
//     setPendingReassign(null);
//     setPendingReassignMessage("");
//     setAssigneesMenuOpen(false);
//   };

//   const cancelPendingReassign = () => {
//     setShowReassignConfirm(false);
//     setPendingReassign(null);
//     setPendingReassignMessage("");
//   };

//   // Notas (historial)
//   const noteBlocks = useMemo(() => {
//     const raw = (activity?.notes || "").trim();
//     if (!raw) return [];
//     return raw
//       .split(/\n{2,}/)
//       .map((b) => b.trim())
//       .filter(Boolean);
//   }, [activity?.notes]);

//   const handleAddNote = () => {
//     if (!activity) return;
//     const body = newNoteBody.trim();
//     if (!body) return;

//     const prev = (activity.notes || "").trim();
//     const timestamp = new Date().toLocaleString();
//     const newBlock = `[${timestamp}] ${body}`;
//     const merged = prev ? `${prev}\n\n${newBlock}` : newBlock;

//     // ✅ Importante: aquí NO mandamos notify_assignees (evita correos por notas)
//     mReassign.mutate({
//       assigned_to: (activity as any).assigned_to ?? null,
//       assigned_to_2: (activity as any).assigned_to_2 ?? null,
//       title: activity.title ?? null,
//       notes: merged,
//       account_id: (activity as any).account_id ?? null,
//       contact_id: (activity as any).contact_id ?? null,
//       deal_id: (activity as any).deal_id ?? null,
//       lead_id: (activity as any).lead_id ?? null,
//       status: activity.status ?? null,
//       due_date: (activity as any).due_date ?? null,
//       type: activity.type ?? null,
//     });
//   };

//   const handleDeleteNoteAt = (index: number) => {
//     if (!activity) return;
//     const nextBlocks = noteBlocks.filter((_, i) => i !== index);
//     const merged = nextBlocks.join("\n\n");

//     // ✅ Importante: aquí NO mandamos notify_assignees
//     mReassign.mutate({
//       assigned_to: (activity as any).assigned_to ?? null,
//       assigned_to_2: (activity as any).assigned_to_2 ?? null,
//       title: activity.title ?? null,
//       notes: merged ? merged : null,
//       account_id: (activity as any).account_id ?? null,
//       contact_id: (activity as any).contact_id ?? null,
//       deal_id: (activity as any).deal_id ?? null,
//       lead_id: (activity as any).lead_id ?? null,
//       status: activity.status ?? null,
//       due_date: (activity as any).due_date ?? null,
//       type: activity.type ?? null,
//     });
//   };

//   // Relacionados
//   const contextChips = useMemo(() => {
//     if (!activity) return [];
//     const cs: { label: string; href: string }[] = [];

//     if ((activity as any).account_id) {
//       const name =
//         (qAcc.data ?? []).find((x) => x.id === (activity as any).account_id)?.name ??
//         (activity as any).account_id;
//       cs.push({ label: `Cuenta: ${name}`, href: `/accounts/${(activity as any).account_id}` });
//     }
//     if ((activity as any).contact_id) {
//       const name =
//         (qCon.data ?? []).find((x) => x.id === (activity as any).contact_id)?.name ??
//         (activity as any).contact_id;
//       cs.push({ label: `Contacto: ${name}`, href: `/contacts/${(activity as any).contact_id}` });
//     }
//     if ((activity as any).deal_id) {
//       const name =
//         (qDeal.data ?? []).find((x) => x.id === (activity as any).deal_id)?.title ??
//         (activity as any).deal_id;
//       cs.push({ label: `Oportunidad: ${name}`, href: `/deals/${(activity as any).deal_id}` });
//     }
//     if ((activity as any).lead_id) {
//       const name =
//         (qLead.data ?? []).find((x) => x.id === (activity as any).lead_id)?.name ??
//         (activity as any).lead_id;
//       cs.push({ label: `Lead: ${name}`, href: `/leads/${(activity as any).lead_id}` });
//     }

//     return cs;
//   }, [activity, qAcc.data, qCon.data, qDeal.data, qLead.data]);

//   const isDoneUI = activity?.status === "done" || completedMaster.has(activity?.id ?? "");
//   const isInProgressUI = !isDoneUI && inProgressMaster.has(activity?.id ?? "");
//   const statusLabel = isDoneUI ? "Realizada" : isInProgressUI ? "En proceso" : "Abierta";

//   // Label dropdown asignados (de activity real)
//   const assigneesLabel = useMemo(() => {
//     if (!activity) return "Sin asignar";

//     const names: string[] = [];
//     const a: any = activity;

//     if (a.assigned_to_name) names.push(a.assigned_to_name);
//     else if (a.assigned_to) names.push(String(a.assigned_to));

//     if (a.assigned_to_2_name) names.push(a.assigned_to_2_name);
//     else if (a.assigned_to_2) names.push(String(a.assigned_to_2));

//     if (names.length === 0) return "Sin asignar";
//     if (names.length === 1) return names[0];
//     return `${names[0]} y ${names[1]}`;
//   }, [
//     activity?.assigned_to_name,
//     activity?.assigned_to_2_name,
//     (activity as any)?.assigned_to,
//     (activity as any)?.assigned_to_2,
//   ]);

//   // Label preview draft
//   const draftLabel = useMemo(() => {
//     const names: string[] = [];
//     if (draftAssignees.assigned_to) names.push(getMemberLabel(draftAssignees.assigned_to));
//     if (draftAssignees.assigned_to_2) names.push(getMemberLabel(draftAssignees.assigned_to_2));
//     if (names.length === 0) return "Sin asignar";
//     if (names.length === 1) return names[0];
//     return `${names[0]} y ${names[1]}`;
//   }, [draftAssignees, getMemberLabel]);

//   // ✅ Evitar loops en web con setOptions: memoizar options
//   const headerRight = useCallback(() => {
//     return (
//       <Pressable
//         onPress={() => setShowConfirm(true)}
//         hitSlop={8}
//         style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
//       >
//         <Text style={{ color: DANGER, fontWeight: "900" }}>Eliminar</Text>
//       </Pressable>
//     );
//   }, []);

//   const screenOptions = useMemo(() => {
//     return {
//       title: "Detalle Actividad",
//       headerStyle: { backgroundColor: BG },
//       headerTintColor: TEXT,
//       headerTitleStyle: { color: TEXT, fontWeight: "800" as const },
//       headerRight,
//     };
//   }, [headerRight]);

//   return (
//     <>
//       <Stack.Screen options={screenOptions} />

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
//               <Text style={[styles.title, isDoneUI && styles.titleDone]}>
//                 {iconByType(activity.type)}{" "}
//                 {activity.title && activity.title.length > 0 ? activity.title : "Sin título"}
//               </Text>

//               {/* Resumen */}
//               {(() => {
//                 const a: any = activity;

//                 const assignedNames: string[] = [];
//                 if (a.assigned_to_name) assignedNames.push(a.assigned_to_name);
//                 else if (a.assigned_to) assignedNames.push(String(a.assigned_to));

//                 if (a.assigned_to_2_name) assignedNames.push(a.assigned_to_2_name);
//                 else if (a.assigned_to_2) assignedNames.push(String(a.assigned_to_2));

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
//                   <Text style={[styles.summary, isDoneUI && styles.summaryDone]}>
//                     {(a.type || "task")} · {statusLabel}
//                     {a.created_by_name ? ` · por ${a.created_by_name}` : ""}
//                     {assignedInfo}
//                     {createdLabel}
//                     {isDoneUI ? " · tarea completada" : ""}
//                   </Text>
//                 );
//               })()}

//               {/* ✅ Dropdown de asignación (edición local + guardar) */}
//               <View style={{ marginTop: 10, gap: 6 }}>
//                 <Text style={styles.itemLabel}>Personas asignadas (máx. 2)</Text>

//                 <View style={styles.dropdownWrapper}>
//                   <Pressable
//                     style={styles.dropdownTrigger}
//                     onPress={() => setAssigneesMenuOpen((v) => !v)}
//                     disabled={mReassign.isPending}
//                   >
//                     <Text style={styles.dropdownText} numberOfLines={1}>
//                       {assigneesLabel}
//                     </Text>
//                     <Text style={styles.dropdownArrow}>
//                       {assigneesMenuOpen ? "▲" : "▼"}
//                     </Text>
//                   </Pressable>

//                   {assigneesMenuOpen && (
//                     <View style={styles.dropdownMenu}>
//                       <View style={styles.dropdownHeader}>
//                         <Text style={styles.dropdownHeaderTitle} numberOfLines={1}>
//                           Selección: {draftLabel}
//                         </Text>
//                         {draftDirty ? (
//                           <Text style={styles.dropdownDirty}>Cambios sin guardar</Text>
//                         ) : (
//                           <Text style={styles.dropdownClean}>Sin cambios</Text>
//                         )}
//                       </View>

//                       {qMembers.isLoading ? (
//                         <View style={{ padding: 10 }}>
//                           <Text style={styles.subtleSmall}>Cargando miembros…</Text>
//                         </View>
//                       ) : qMembers.isError ? (
//                         <View style={{ padding: 10 }}>
//                           <Text style={styles.error}>No se pudieron cargar los miembros.</Text>
//                         </View>
//                       ) : (qMembers.data ?? []).length === 0 ? (
//                         <View style={{ padding: 10 }}>
//                           <Text style={styles.subtleSmall}>No hay miembros.</Text>
//                         </View>
//                       ) : (
//                         (qMembers.data ?? []).map((m) => {
//                           const isSelected =
//                             draftAssignees.assigned_to === m.id ||
//                             draftAssignees.assigned_to_2 === m.id;

//                           const disabled = !isSelected && draftSelectedCount >= 2;

//                           return (
//                             <Pressable
//                               key={m.id}
//                               style={[
//                                 styles.dropdownOption,
//                                 isSelected && styles.dropdownOptionActive,
//                                 disabled && { opacity: 0.45 },
//                               ]}
//                               onPress={() => toggleDraftMember(m.id)}
//                               disabled={disabled || mReassign.isPending}
//                             >
//                               <Text
//                                 style={[
//                                   styles.dropdownOptionText,
//                                   isSelected && styles.dropdownOptionTextActive,
//                                 ]}
//                                 numberOfLines={1}
//                               >
//                                 {m.name || m.email || m.id}
//                                 {isSelected ? "  ✓" : ""}
//                               </Text>
//                             </Pressable>
//                           );
//                         })
//                       )}

//                       <View style={styles.dropdownFooter}>
//                         <Pressable
//                           style={[styles.footerBtn, styles.footerBtnGhost]}
//                           onPress={() => {
//                             setDraftAssignees(currentAssignees);
//                             setAssigneesMenuOpen(false);
//                           }}
//                           disabled={mReassign.isPending}
//                         >
//                           <Text style={styles.footerBtnText}>Cancelar</Text>
//                         </Pressable>

//                         <Pressable
//                           style={[
//                             styles.footerBtn,
//                             styles.footerBtnPrimary,
//                             (!draftDirty || mReassign.isPending) && { opacity: 0.5 },
//                           ]}
//                           onPress={requestSaveAssignees}
//                           disabled={!draftDirty || mReassign.isPending}
//                         >
//                           <Text style={styles.footerBtnText}>Guardar cambios</Text>
//                         </Pressable>
//                       </View>
//                     </View>
//                   )}
//                 </View>

//                 {mReassign.isPending && <Text style={styles.subtleSmall}>Actualizando…</Text>}
//               </View>

//               {/* Estado dropdown (solo front) */}
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

//               {/* Notas */}
//               <View style={{ marginTop: 12 }}>
//                 <Text style={styles.subSectionTitle}>Notas de la actividad</Text>

//                 {noteBlocks.length > 0 && (
//                   <View style={styles.notesHistoryWrapper}>
//                     <ScrollView
//                       style={styles.notesHistoryScroll}
//                       nestedScrollEnabled
//                       contentContainerStyle={styles.notesHistoryContent}
//                     >
//                       {noteBlocks.map((block, idx) => (
//                         <View key={idx} style={styles.noteRow}>
//                           <Text style={styles.notesHistoryText}>{block}</Text>

//                           <Pressable
//                             onPress={() => handleDeleteNoteAt(idx)}
//                             disabled={mReassign.isPending}
//                             style={[styles.noteDeleteBtn, mReassign.isPending && { opacity: 0.5 }]}
//                             hitSlop={8}
//                           >
//                             <Text style={styles.noteDeleteText}>Borrar</Text>
//                           </Pressable>
//                         </View>
//                       ))}
//                     </ScrollView>
//                   </View>
//                 )}

//                 <View style={styles.historyInputRow}>
//                   <TextInput
//                     style={styles.historyInput}
//                     placeholder="Escribe una nueva nota…"
//                     placeholderTextColor={SUBTLE}
//                     value={newNoteBody}
//                     onChangeText={setNewNoteBody}
//                     multiline
//                   />
//                   <Pressable
//                     style={[
//                       styles.historyAddBtn,
//                       (!newNoteBody.trim() || mReassign.isPending) && { opacity: 0.5 },
//                     ]}
//                     onPress={handleAddNote}
//                     disabled={!newNoteBody.trim() || mReassign.isPending}
//                   >
//                     <Text style={styles.historyAddText}>Agregar</Text>
//                   </Pressable>
//                 </View>
//               </View>

//               {/* Relacionados */}
//               {contextChips.length > 0 && (
//                 <View style={{ marginTop: 10, gap: 6 }}>
//                   <Text style={[styles.itemLabel, { marginBottom: 2 }]}>Relacionado con</Text>
//                   <View style={styles.chipsRow}>
//                     {contextChips.map((c) => (
//                       <Link key={c.href} href={c.href as any} asChild>
//                         <Pressable style={styles.chip} accessibilityRole="link" hitSlop={8}>
//                           <Text style={styles.chipText}>{c.label}</Text>
//                         </Pressable>
//                       </Link>
//                     ))}
//                   </View>
//                 </View>
//               )}
//             </View>

//             {/* Eliminar actividad */}
//             <Pressable
//               style={[styles.btn, styles.btnDanger, mDelete.isPending && { opacity: 0.9 }]}
//               onPress={() => setShowConfirm(true)}
//               disabled={mDelete.isPending}
//             >
//               <Text style={styles.btnText}>{mDelete.isPending ? "Eliminando…" : "Eliminar"}</Text>
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

//       <Confirm
//         visible={showReassignConfirm}
//         title="Confirmar cambio de asignación"
//         message={pendingReassignMessage || "¿Confirmas este cambio de asignación?"}
//         confirmText="Confirmar"
//         cancelText="Cancelar"
//         onCancel={cancelPendingReassign}
//         onConfirm={applyPendingReassign}
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

// function formatDateShort(value?: number | string | null): string {
//   if (value == null) return "—";

//   if (typeof value === "number" || /^\d+$/.test(String(value))) {
//     const n = typeof value === "number" ? value : Number(value);
//     if (!Number.isFinite(n)) return "—";
//     const d = new Date(n);
//     if (Number.isNaN(d.getTime())) return "—";
//     return d.toLocaleDateString();
//   }

//   const d = new Date(value);
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

//   itemLabel: { color: SUBTLE, fontWeight: "700" },

//   subtle: { color: SUBTLE },
//   subtleSmall: { color: SUBTLE, fontSize: 11 },
//   error: { color: "#fecaca" },

//   // Dropdown (asignación)
//   dropdownWrapper: { alignSelf: "flex-start", minWidth: 240 },
//   dropdownTrigger: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: "#11121b",
//     paddingHorizontal: 12,
//     paddingVertical: 8,
//   },
//   dropdownText: {
//     color: TEXT,
//     fontSize: 12,
//     fontWeight: "700",
//     flexShrink: 1,
//   },
//   dropdownArrow: { color: SUBTLE, fontSize: 10, marginLeft: 6 },

//   dropdownMenu: {
//     marginTop: 6,
//     borderRadius: 12,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: "#11121b",
//     overflow: "hidden",
//     minWidth: 240,
//   },

//   dropdownHeader: {
//     paddingHorizontal: 12,
//     paddingVertical: 10,
//     borderBottomWidth: 1,
//     borderBottomColor: "#1f2933",
//     gap: 4,
//   },
//   dropdownHeaderTitle: { color: TEXT, fontWeight: "800", fontSize: 12 },
//   dropdownDirty: { color: "#FDE68A", fontWeight: "800", fontSize: 11 },
//   dropdownClean: { color: SUBTLE, fontWeight: "700", fontSize: 11 },

//   dropdownOption: {
//     paddingHorizontal: 12,
//     paddingVertical: 10,
//     borderBottomWidth: 1,
//     borderBottomColor: "#1f2933",
//   },
//   dropdownOptionActive: { backgroundColor: "#1f2937" },
//   dropdownOptionText: { color: TEXT, fontSize: 12 },
//   dropdownOptionTextActive: { color: "#E9D5FF", fontWeight: "800" },

//   dropdownFooter: {
//     flexDirection: "row",
//     gap: 10,
//     padding: 10,
//     borderTopWidth: 1,
//     borderTopColor: "#1f2933",
//   },
//   footerBtn: {
//     flex: 1,
//     borderRadius: 10,
//     paddingVertical: 10,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   footerBtnPrimary: { backgroundColor: PRIMARY },
//   footerBtnGhost: {
//     backgroundColor: "rgba(255,255,255,0.06)",
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.12)",
//   },
//   footerBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },

//   // Estado
//   stateRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 8,
//     marginTop: 6,
//   },
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
//   statusOpen: { backgroundColor: "#e5e7eb", borderColor: "#9ca3af" },
//   statusInProgress: { backgroundColor: "#DBEAFE", borderColor: "#3b82f6" },
//   statusDone: { backgroundColor: "#dcfce7", borderColor: "#22c55e" },
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
//   statusOptionText: { fontSize: 12, color: "#0F172A" },

//   // Notas
//   subSectionTitle: {
//     color: TEXT,
//     fontWeight: "800",
//     fontSize: 15,
//     marginBottom: 4,
//   },
//   notesHistoryWrapper: {
//     maxHeight: 220,
//     borderRadius: 10,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: "#11121b",
//     overflow: "hidden",
//     marginTop: 6,
//   },
//   notesHistoryScroll: { maxHeight: 220 },
//   notesHistoryContent: { paddingVertical: 4 },

//   noteRow: {
//     flexDirection: "row",
//     alignItems: "flex-start",
//     justifyContent: "space-between",
//     gap: 10,
//     paddingHorizontal: 10,
//     paddingVertical: 8,
//     borderBottomWidth: 1,
//     borderBottomColor: "#1f2937",
//   },
//   notesHistoryText: { color: TEXT, fontSize: 13, flex: 1 },
//   noteDeleteBtn: {
//     paddingHorizontal: 10,
//     paddingVertical: 8,
//     borderRadius: 10,
//     backgroundColor: "rgba(239,68,68,0.18)",
//     borderWidth: 1,
//     borderColor: "rgba(239,68,68,0.35)",
//     alignItems: "center",
//     justifyContent: "center",
//     alignSelf: "flex-start",
//   },
//   noteDeleteText: { color: "#fff", fontWeight: "800", fontSize: 12 },

//   historyInputRow: {
//     flexDirection: "row",
//     gap: 8,
//     alignItems: "flex-start",
//     marginTop: 10,
//   },
//   historyInput: {
//     flex: 1,
//     borderRadius: 10,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: "#11121b",
//     paddingHorizontal: 10,
//     paddingVertical: 8,
//     color: TEXT,
//     fontSize: 13,
//     minHeight: 40,
//     maxHeight: 80,
//   },
//   historyAddBtn: {
//     paddingHorizontal: 10,
//     paddingVertical: 8,
//     borderRadius: 10,
//     backgroundColor: PRIMARY,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   historyAddText: { color: "#fff", fontWeight: "800", fontSize: 12 },

//   // Relacionados
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

//   // Eliminar actividad
//   btn: { padding: 12, borderRadius: 12, alignItems: "center" },
//   btnDanger: { backgroundColor: DANGER },
//   btnText: { color: "#fff", fontWeight: "900" },
// });

