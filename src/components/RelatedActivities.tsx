// src/components/RelatedActivities.tsx
import {
  deleteActivity,
  listActivities,
  updateActivityStatus,
  type Activity,
} from "@/src/api/activities";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type MemberOption = {
  id: string;
  name: string;
  email?: string | null;
};

export type ActivityFilters = {
  deal_id?: string;
  account_id?: string;
  contact_id?: string;
  lead_id?: string;
  status?: Activity["status"];
};

type Props = {
  title?: string;
  filters: ActivityFilters;
  createDefaults?: Partial<Activity>;
  members?: MemberOption[];
};

const STATES = [
  {
    value: "open",
    label: "Abierta",
    color: "#687386",
    background: "#f0f2f7",
  },
  {
    value: "in_progress",
    label: "En proceso",
    color: "#3266ac",
    background: "#eaf1ff",
  },
  {
    value: "done",
    label: "Realizada",
    color: "#23744d",
    background: "#e8f6ed",
  },
  {
    value: "canceled",
    label: "Cancelada",
    color: "#7a6470",
    background: "#f4eff2",
  },
] as const;

const TYPE_LABELS: Record<Activity["type"], string> = {
  task: "Tarea",
  call: "Llamada",
  meeting: "Reunión",
  note: "Nota",
};

function timestamp(value: number | string | null | undefined) {
  if (value == null || value === "") return null;

  const result = Number(value);

  return Number.isFinite(result) &&
    !Number.isNaN(new Date(result).getTime())
    ? result
    : null;
}

function formatDate(value: number | string | null | undefined) {
  const result = timestamp(value);
  if (result === null) return "Sin fecha";

  return new Date(result).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function lastNoteBlock(notes?: string | null) {
  const blocks = notes
    ?.split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks?.length ? blocks[blocks.length - 1] : null;
}

async function confirmDelete(): Promise<boolean> {
  const message = "Esta actividad se eliminará. ¿Quieres continuar?";

  if (Platform.OS === "web") {
    return window.confirm(message);
  }

  return new Promise((resolve) => {
    Alert.alert(
      "Eliminar actividad",
      message,
      [
        {
          text: "Cancelar",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => resolve(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(false),
      }
    );
  });
}

async function clearLegacyFlags(
  id: string,
  filters: ActivityFilters
) {
  const scope =
    filters.contact_id ||
    filters.deal_id ||
    filters.account_id ||
    filters.lead_id ||
    "global";

  const keys = new Set([
    "completedActivities:v1:all",
    "inProgressActivities:v1:all",
    `completedActivities:v1:${scope}`,
    `inProgressActivities:v1:${scope}`,
  ]);

  try {
    for (const key of keys) {
      const raw = await AsyncStorage.getItem(key);
      const saved: unknown = raw ? JSON.parse(raw) : [];

      if (Array.isArray(saved)) {
        await AsyncStorage.setItem(
          key,
          JSON.stringify(saved.filter((value) => value !== id))
        );
      }
    }
  } catch {
    console.warn(
      "No se pudieron limpiar las marcas locales anteriores."
    );
  }
}

export default function RelatedActivities({
  title = "Actividades",
  filters,
  members = [],
}: Props) {
  const qc = useQueryClient();
  const router = useRouter();

  const [statusRowId, setStatusRowId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const baseFilters = useMemo(
    () => ({
      contact_id: filters.contact_id,
      deal_id: filters.deal_id,
      account_id: filters.account_id,
      lead_id: filters.lead_id,
    }),
    [
      filters.contact_id,
      filters.deal_id,
      filters.account_id,
      filters.lead_id,
    ]
  );

  const enabled = Boolean(
    baseFilters.contact_id ||
      baseFilters.deal_id ||
      baseFilters.account_id ||
      baseFilters.lead_id
  );

  const q = useQuery<Activity[]>({
    queryKey: ["activities", baseFilters],
    queryFn: () => listActivities(baseFilters),
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    select: (rows) =>
      [...rows].sort(
        (a, b) =>
          Number(b.updated_at) - Number(a.updated_at) ||
          a.id.localeCompare(b.id)
      ),
  });

  const refetch = q.refetch;

  useFocusEffect(
    useCallback(() => {
      if (enabled) void refetch();
    }, [enabled, refetch])
  );

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["activities"] }),
      qc.invalidateQueries({ queryKey: ["activities-all"] }),
      qc.invalidateQueries({ queryKey: ["activities-home"] }),
      qc.invalidateQueries({ queryKey: ["activity-stats"] }),
      qc.invalidateQueries({ queryKey: ["activity-trend"] }),
    ]);
  }

  const mStatus = useMutation({
    mutationFn: ({
      activity,
      status,
    }: {
      activity: Activity;
      status: Activity["status"];
    }) =>
      updateActivityStatus(
        activity.id,
        status,
        Number(activity.updated_at)
      ),

    onMutate: () => setActionError(null),

    onSuccess: async (updated) => {
      qc.setQueryData(["activity", updated.id], updated);

      qc.setQueryData<Activity[]>(
        ["activities", baseFilters],
        (previous) =>
          previous?.map((item) =>
            item.id === updated.id ? updated : item
          )
      );

      setStatusRowId(null);
      await clearLegacyFlags(updated.id, filters);
      await invalidate();
    },

    onError: (error) => {
      setActionError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el estado."
      );

      void invalidate();
    },
  });

  const mDelete = useMutation({
    mutationFn: (id: string) => deleteActivity(id),

    onMutate: () => setActionError(null),

    onSuccess: async (_result, id) => {
      qc.removeQueries({ queryKey: ["activity", id] });

      qc.setQueryData<Activity[]>(
        ["activities", baseFilters],
        (previous) => previous?.filter((item) => item.id !== id)
      );

      setStatusRowId(null);
      await clearLegacyFlags(id, filters);
      await invalidate();
    },

    onError: (error) => {
      setActionError(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar la actividad."
      );
    },
  });

  const busy = mStatus.isPending || mDelete.isPending;

  const activities = (q.data ?? []).filter(
    (activity) =>
      !filters.status || activity.status === filters.status
  );

  function openActivity(id: string) {
    router.push({
      pathname: "/tasks/[id]",
      params: { id },
    });
  }

  async function handleDelete(id: string) {
    if (busy) return;

    if (await confirmDelete()) {
      mDelete.mutate(id);
    }
  }

  function assigneeNames(activity: Activity) {
    const names: string[] = [];
    const seen = new Set<string>();

    for (const assignee of [
      {
        id: activity.assigned_to,
        name: activity.assigned_to_name,
        email: activity.assigned_to_email,
      },
      {
        id: activity.assigned_to_2,
        name: activity.assigned_to_2_name,
        email: activity.assigned_to_2_email,
      },
    ]) {
      if (!assignee.id || seen.has(assignee.id)) continue;

      seen.add(assignee.id);

      const member = members.find(
        (item) => item.id === assignee.id
      );

      names.push(
        assignee.name?.trim() ||
          member?.name?.trim() ||
          assignee.email?.trim() ||
          member?.email?.trim() ||
          "Usuario asignado"
      );
    }

    return names.length ? names.join(" y ") : "Sin asignar";
  }

  return (
    <View style={s.box}>
      <View style={s.header}>
        <View style={s.heading}>
          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>
            Consulta y organiza el seguimiento.
          </Text>
        </View>

        {q.isFetching && !q.isLoading && (
          <ActivityIndicator size="small" color="#7551c8" />
        )}

        <Pressable
          accessibilityRole="button"
          disabled={!enabled || busy}
          style={[
            s.button,
            s.primary,
            (!enabled || busy) && s.disabled,
          ]}
          onPress={() =>
            router.push({
              pathname: "/tasks/new",
              params: baseFilters,
            })
          }
        >
          <Text style={s.primaryText}>+ Crear actividad</Text>
        </Pressable>
      </View>

      {!!actionError && (
        <Text accessibilityRole="alert" style={s.error}>
          {actionError}
        </Text>
      )}

      {mStatus.isPending && (
        <Text style={s.feedbackText}>Guardando estado…</Text>
      )}

      {!enabled ? (
        <Text style={s.empty}>
          Selecciona un contacto para consultar sus actividades.
        </Text>
      ) : q.isLoading ? (
        <View style={s.loading}>
          <ActivityIndicator color="#7551c8" />
          <Text style={s.subtitle}>Cargando actividades…</Text>
        </View>
      ) : q.isError ? (
        <View style={s.feedback}>
          <Text style={s.errorText}>
            No pudimos cargar las actividades.
          </Text>

          <Pressable
            accessibilityRole="button"
            style={[s.button, s.secondary]}
            onPress={() => void q.refetch()}
          >
            <Text style={s.secondaryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : activities.length === 0 ? (
        <Text style={s.empty}>
          No hay actividades para esta selección.
        </Text>
      ) : (
        <ScrollView
          style={s.list}
          nestedScrollEnabled
          contentContainerStyle={s.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {activities.map((activity) => {
            const state =
              STATES.find(
                (item) => item.value === activity.status
              ) ?? STATES[0];

            const due = timestamp(activity.due_date);
            const pending =
              activity.status === "open" ||
              activity.status === "in_progress";

            const overdue =
              pending && due !== null && due < Date.now();

            const note = lastNoteBlock(activity.notes);

            return (
              <View key={activity.id} style={s.activity}>
                <View style={s.activityHeading}>
                  <View style={s.typeBadge}>
                    <Text style={s.typeText}>
                      {TYPE_LABELS[activity.type] || activity.type}
                    </Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Cambiar estado de ${activity.title}. Estado actual: ${state.label}`}
                    accessibilityState={{
                      expanded: statusRowId === activity.id,
                      disabled: busy,
                    }}
                    disabled={busy}
                    onPress={() =>
                      setStatusRowId((current) =>
                        current === activity.id
                          ? null
                          : activity.id
                      )
                    }
                    style={[
                      s.statusChip,
                      { backgroundColor: state.background },
                      busy && s.disabled,
                    ]}
                  >
                    <Text
                      style={[
                        s.statusText,
                        { color: state.color },
                      ]}
                    >
                      {state.label} ▾
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir actividad: ${activity.title}`}
                  onPress={() => openActivity(activity.id)}
                  style={s.main}
                >
                  <Text style={s.activityTitle}>
                    {activity.title}
                  </Text>

                  <Text
                    style={[
                      s.date,
                      overdue && s.overdue,
                    ]}
                  >
                    {overdue ? "Atrasada · " : "Programada · "}
                    {formatDate(activity.due_date)}
                  </Text>

                  <Text style={s.subtitle}>
                    Responsable: {assigneeNames(activity)}
                  </Text>

                  {!!note && (
                    <Text style={s.note} numberOfLines={3}>
                      {note}
                    </Text>
                  )}

                  <Text style={s.meta}>
                    Creada: {formatDate(activity.created_at)}
                    {activity.created_by_name
                      ? ` · ${activity.created_by_name}`
                      : ""}
                  </Text>

                  {activity.status === "done" &&
                    timestamp(activity.completed_at) !== null && (
                      <Text style={s.completed}>
                        Realizada: {formatDate(activity.completed_at)}
                      </Text>
                    )}
                </Pressable>

                {statusRowId === activity.id && (
                  <View style={s.statusOptions}>
                    {STATES.map((option) => {
                      const selected =
                        activity.status === option.value;

                      return (
                        <Pressable
                          key={option.value}
                          accessibilityRole="button"
                          accessibilityState={{
                            selected,
                            disabled:
                              busy || q.isFetching || selected,
                          }}
                          disabled={
                            busy || q.isFetching || selected
                          }
                          onPress={() =>
                            mStatus.mutate({
                              activity,
                              status: option.value,
                            })
                          }
                          style={[
                            s.statusOption,
                            selected && {
                              backgroundColor: option.background,
                              borderColor: option.color,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.optionText,
                              selected && {
                                color: option.color,
                                fontWeight: "700",
                              },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <View style={s.actions}>
                  <Pressable
                    accessibilityRole="button"
                    style={[s.button, s.secondary]}
                    onPress={() => openActivity(activity.id)}
                  >
                    <Text style={s.secondaryText}>
                      Ver detalle
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar actividad: ${activity.title}`}
                    disabled={busy}
                    onPress={() =>
                      void handleDelete(activity.id)
                    }
                    style={[
                      s.button,
                      s.danger,
                      busy && s.disabled,
                    ]}
                  >
                    <Text style={s.dangerText}>
                      {mDelete.isPending &&
                      mDelete.variables === activity.id
                        ? "Eliminando…"
                        : "Eliminar"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    width: "100%",
    minWidth: 0,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e9f0",
    borderRadius: 14,
    overflow: "hidden",
  },
  header: {
    padding: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  heading: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 180,
    minWidth: 0,
    gap: 5,
  },
  title: {
    color: "#202536",
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    color: "#737b8e",
    fontSize: 12,
    lineHeight: 19,
  },
  button: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: "#7551c8",
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  secondary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ded5ef",
  },
  secondaryText: {
    color: "#7551c8",
    fontSize: 12,
    fontWeight: "600",
  },
  danger: {
    backgroundColor: "#fff3f3",
    borderWidth: 1,
    borderColor: "#f3d6d6",
  },
  dangerText: {
    color: "#b42332",
    fontSize: 12,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
  list: {
    maxHeight: 520,
  },
  listContent: {
    paddingBottom: 4,
  },
  activity: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: "#e7e9f0",
    gap: 13,
  },
  activityHeading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  typeBadge: {
    borderRadius: 6,
    backgroundColor: "#f1ecfa",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  typeText: {
    color: "#7551c8",
    fontSize: 11,
    fontWeight: "600",
  },
  statusChip: {
    minHeight: 36,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 7,
    justifyContent: "center",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  main: {
    minWidth: 0,
    gap: 7,
  },
  activityTitle: {
    color: "#202536",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 23,
  },
  date: {
    color: "#687386",
    fontSize: 12,
    lineHeight: 19,
  },
  overdue: {
    color: "#b86630",
    fontWeight: "600",
  },
  note: {
    color: "#475467",
    fontSize: 13,
    lineHeight: 21,
  },
  meta: {
    color: "#8991a2",
    fontSize: 11,
    lineHeight: 18,
  },
  completed: {
    color: "#23744d",
    fontSize: 11,
    lineHeight: 18,
  },
  statusOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 4,
  },
  statusOption: {
    minHeight: 40,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e7e9f0",
    borderRadius: 7,
    justifyContent: "center",
  },
  optionText: {
    color: "#475467",
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
  },
  loading: {
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  empty: {
    color: "#737b8e",
    padding: 20,
    fontSize: 13,
    lineHeight: 21,
  },
  feedback: {
    padding: 18,
    alignItems: "flex-start",
    gap: 10,
  },
  feedbackText: {
    color: "#737b8e",
    paddingHorizontal: 18,
    paddingBottom: 12,
    fontSize: 12,
  },
  error: {
    color: "#b42332",
    paddingHorizontal: 18,
    paddingBottom: 12,
    fontSize: 12,
    lineHeight: 19,
  },
  errorText: {
    color: "#b42332",
    fontSize: 12,
    lineHeight: 19,
  },
});