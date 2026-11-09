// app/contacts/[id].tsx
import {
  listActivities,
  updateActivityStatus,
  type Activity,
} from "@/src/api/activities";
import {
  fetchTenants,
  getAuthStorageScope,
  getRoleNow,
} from "@/src/api/auth";
import {
  createContact,
  deleteContact,
  getContact,
  updateContact,
  type ClientType,
  type SharingSelection,
} from "@/src/api/contacts";
import { listNotes } from "@/src/api/notes";
import {
  listWorkspaceMembers,
  type WorkspaceMember,
} from "@/src/api/workspaceMembers";
import ContactVisibilitySelector from "@/src/components/ContactVisibilitySelector";
import RelatedActivities from "@/src/components/RelatedActivities";
import RelatedNotes from "@/src/components/RelatedNotes";
import { uid } from "@/src/utils/uid";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const BG = "#f5f6fa";
const BORDER = "#e7e9f0";
const TEXT = "#202536";
const SUBTLE = "#737b8e";
const ACCENT = "#7551c8";

type TenantItem = {
  id: string;
  name: string;
};

type SessionContext = {
  storageKey: string;
  tenantId: string;
  isAdmin: boolean;
};

type Tab = "history" | "activities" | "notes";
type HistoryFilter = "all" | "call" | "meeting" | "note";

type HistoryItem = {
  id: string;
  kind: Activity["type"];
  title: string;
  body?: string | null;
  at: number | null;
  author: string;
  label: string;
  activityId?: string;
};

const CLIENT_TYPES: Array<{
  value: Exclude<ClientType, null>;
  label: string;
}> = [
  { value: "productora", label: "Productora" },
  { value: "agencia", label: "Agencia" },
  { value: "directo", label: "Cliente directo" },
  { value: "proveedor", label: "Proveedor" },
];

const TYPE_LABELS: Record<Activity["type"], string> = {
  task: "Tarea",
  call: "Llamada",
  meeting: "Reunión",
  note: "Nota",
};

function visibilityLabel(value?: string | null) {
  if (value === "private") return "Solo el creador";
  if (value === "selected") return "Usuarios seleccionados";
  return "Todo el workspace";
}

function milliseconds(value: unknown): number | null {
  if (value == null || value === "") return null;

  const number = Number(value);

  return Number.isFinite(number) &&
    !Number.isNaN(new Date(number).getTime())
    ? number
    : null;
}

function formatDate(value: unknown) {
  const number = milliseconds(value);
  if (number === null) return "Sin fecha";

  return new Date(number).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación.";
}

function responsible(activity: Activity) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const person of [
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
    if (!person.id || seen.has(person.id)) continue;
    seen.add(person.id);

    result.push(
      person.name?.trim() ||
        person.email?.trim() ||
        "Usuario asignado"
    );
  }

  return result.length ? result.join(" y ") : "Sin asignar";
}

async function confirmAction(title: string, message: string) {
  if (Platform.OS === "web") {
    return window.confirm(`${title}\n\n${message}`);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        {
          text: "Cancelar",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "Confirmar",
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

function Action({
  label,
  onPress,
  disabled = false,
  primary = false,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        primary && s.buttonPrimary,
        danger && s.buttonDanger,
        disabled && s.disabled,
      ]}
    >
      <Text
        style={[
          s.buttonText,
          primary && s.buttonPrimaryText,
          danger && s.buttonDangerText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function ContactDetail() {
  const params = useLocalSearchParams<{
    id?: string | string[];
  }>();

  const contactId = Array.isArray(params.id)
    ? params.id[0]
    : params.id;

  if (!contactId || contactId === "index") {
    return (
      <View style={s.screen}>
        <Text style={s.muted}>Ruta inválida.</Text>
      </View>
    );
  }

  return (
    <ContactDetailForm key={contactId} contactId={contactId} />
  );
}

function ContactDetailForm({ contactId }: { contactId: string }) {
  const qc = useQueryClient();

  const [context, setContext] = useState<SessionContext | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  const [tab, setTab] = useState<Tab>("history");
  const [historyFilter, setHistoryFilter] =
    useState<HistoryFilter>("all");
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState("");
  const [clientType, setClientType] = useState<ClientType>(null);
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [sharing, setSharing] = useState<SharingSelection>({
    visibility: null,
    shared_user_ids: [],
  });

  const [workspaces, setWorkspaces] = useState<TenantItem[]>([]);
  const [selectedCopies, setSelectedCopies] = useState<string[]>([]);
  const [cloneSharing, setCloneSharing] = useState<
    Record<string, SharingSelection>
  >({});

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveStarted, setSaveStarted] = useState(false);
  const [completedCopies, setCompletedCopies] = useState<string[]>([]);

  const copyProgress = useRef<
    Record<string, { id: string; saved: boolean }>
  >({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const scope = await getAuthStorageScope();

        if (!scope) {
          throw new Error(
            "No se pudo comprobar tu sesión. Vuelve a iniciar sesión."
          );
        }

        const [role, tenantResponse] = await Promise.all([
          getRoleNow(),
          fetchTenants(),
        ]);

        const current = await getAuthStorageScope();

        if (current?.storageKey !== scope.storageKey) {
          throw new Error(
            "Cambió la sesión o el workspace. Reabre el contacto."
          );
        }

        if (!role) {
          throw new Error("No se pudo comprobar tu rol.");
        }

        if (cancelled) return;

        setContext({
          storageKey: scope.storageKey,
          tenantId: scope.tenantId,
          isAdmin: role === "admin" || role === "owner",
        });

        setWorkspaces(
          (tenantResponse.items ?? []).map((tenant) => ({
            id: tenant.id,
            name: tenant.name || tenant.id,
          }))
        );
      } catch (err) {
        if (!cancelled) setInitialError(messageOf(err));
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function assertSession() {
    const current = await getAuthStorageScope();

    if (
      !context ||
      current?.storageKey !== context.storageKey
    ) {
      throw new Error(
        "Cambió la sesión o el workspace. Reabre el contacto."
      );
    }
  }

  const contactQuery = useQuery({
    queryKey: ["contact", contactId, context?.storageKey],
    queryFn: async () => {
      await assertSession();
      const result = await getContact(contactId);
      await assertSession();
      return result;
    },
    enabled: Boolean(context),
    retry: false,
  });

  const contact = contactQuery.data;
  const relatedEnabled = Boolean(context && contact);

  const activitiesQuery = useQuery({
    queryKey: [
      "activities",
      "contact-followup",
      contactId,
      context?.storageKey,
    ],
    queryFn: async () => {
      await assertSession();
      const result = await listActivities({ contact_id: contactId });
      await assertSession();
      return result;
    },
    enabled: relatedEnabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: false,
  });

  const notesQuery = useQuery({
    queryKey: [
      "notes",
      "contact-history",
      contactId,
      context?.storageKey,
    ],
    queryFn: async () => {
      await assertSession();
      const result = await listNotes({ contact_id: contactId });
      await assertSession();
      return result;
    },
    enabled: relatedEnabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: false,
  });

  const membersQuery = useQuery({
    queryKey: ["workspaceMembers", context?.storageKey],
    queryFn: async () => {
      await assertSession();
      const result = await listWorkspaceMembers();
      await assertSession();
      return result;
    },
    enabled: relatedEnabled,
    retry: false,
  });

  const members: WorkspaceMember[] = membersQuery.data ?? [];
  const canManageSharing = contact?.can_manage_sharing === true;
  const canCopy = canManageSharing && context?.isAdmin === true;

  useFocusEffect(
    useCallback(() => {
      if (!context) return;

      void qc.invalidateQueries({
        queryKey: ["contact", contactId],
      });
      void qc.invalidateQueries({ queryKey: ["activities"] });
      void qc.invalidateQueries({ queryKey: ["notes"] });
    }, [context?.storageKey, contactId, qc])
  );

  async function refreshRelated() {
    await Promise.all(
      [
        ["contact", contactId],
        ["contacts"],
        ["contacts-all"],
        ["activities"],
        ["activities-all"],
        ["activities-home"],
        ["activity-stats"],
        ["activity-trend"],
        ["notes"],
        ["deals"],
      ].map((queryKey) => qc.invalidateQueries({ queryKey }))
    );
  }

  function beginEdit() {
    if (!contact) return;

    setName(contact.name ?? "");
    setCompany(contact.company ?? "");
    setPosition(contact.position ?? "");
    setEmail(contact.email ?? "");
    setPhone(contact.phone ?? "");
    setClientType(contact.client_type ?? null);

    setSharing({
      visibility: contact.visibility ?? "workspace",
      shared_user_ids: contact.shared_user_ids ?? [],
    });

    setSelectedCopies([]);
    setCloneSharing({});
    setCompletedCopies([]);
    copyProgress.current = {};

    setError(null);
    setNotice(null);
    setEditing(true);
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      await assertSession();

      if (!name.trim()) {
        throw new Error("El nombre es obligatorio.");
      }

      if (
        canManageSharing &&
        (!sharing.visibility ||
          (sharing.visibility === "selected" &&
            sharing.shared_user_ids.length === 0))
      ) {
        throw new Error(
          "Elige la visibilidad y los usuarios seleccionados."
        );
      }

      const targets = selectedCopies.filter(
        (tenantId) => !copyProgress.current[tenantId]?.saved
      );

      if (targets.length > 0 && !canCopy) {
        throw new Error(
          "Solo el administrador creador puede crear estas copias."
        );
      }

      for (const tenantId of targets) {
        const choice = cloneSharing[tenantId];

        if (
          !choice?.visibility ||
          (choice.visibility === "selected" &&
            choice.shared_user_ids.length === 0)
        ) {
          throw new Error(
            "Completa la privacidad de cada copia antes de guardar."
          );
        }
      }

      setError(null);
      setNotice(null);
      setSaveStarted(true);

      const data = {
        name: name.trim(),
        company: company.trim() || null,
        position: position.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        client_type: clientType,
      };

      await updateContact(contactId, {
        ...data,
        ...(canManageSharing
          ? {
              visibility: sharing.visibility!,
              shared_user_ids:
                sharing.visibility === "selected"
                  ? sharing.shared_user_ids
                  : [],
            }
          : {}),
      });

      for (const tenantId of targets) {
        await assertSession();

        let progress = copyProgress.current[tenantId];

        if (!progress) {
          progress = { id: uid(), saved: false };
          copyProgress.current[tenantId] = progress;
        }

        const choice = cloneSharing[tenantId];

        await createContact(
          {
            id: progress.id,
            ...data,
            visibility: choice.visibility!,
            shared_user_ids:
              choice.visibility === "selected"
                ? choice.shared_user_ids
                : [],
          },
          tenantId
        );

        progress.saved = true;

        setCompletedCopies(
          Object.entries(copyProgress.current)
            .filter(([, item]) => item.saved)
            .map(([tenant]) => tenant)
        );
      }
    },

    onSuccess: async () => {
      setSaveStarted(false);
      setSelectedCopies([]);
      setCloneSharing({});
      setEditing(false);
      setNotice("Cambios guardados.");
      await refreshRelated();
    },

    onError: (err) => setError(messageOf(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await assertSession();
      await deleteContact(contactId);
    },
    onSuccess: async () => {
      await refreshRelated();
      qc.removeQueries({ queryKey: ["contact", contactId] });
      router.back();
    },
    onError: (err) => setError(messageOf(err)),
  });

  const completeMutation = useMutation({
    mutationFn: async (activity: Activity) => {
      await assertSession();

      const updated = await updateActivityStatus(
        activity.id,
        "done",
        Number(activity.updated_at)
      );

      await assertSession();
      return updated;
    },
    onMutate: () => {
      setError(null);
      setNotice(null);
    },
    onSuccess: async (updated) => {
      qc.setQueryData(["activity", updated.id], updated);
      setNotice("Actividad realizada.");
      await refreshRelated();
    },
    onError: (err) => {
      setError(messageOf(err));
      void qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });

  const busy =
    updateMutation.isPending ||
    deleteMutation.isPending ||
    completeMutation.isPending;

  const formLocked = busy || saveStarted;

  function toggleCopy(tenantId: string) {
    if (
      formLocked ||
      !canCopy ||
      completedCopies.includes(tenantId)
    ) {
      return;
    }

    setSelectedCopies((previous) =>
      previous.includes(tenantId)
        ? previous.filter((id) => id !== tenantId)
        : [...previous, tenantId]
    );
  }

  async function handleSave() {
    if (busy) return;

    const confirmed = await confirmAction(
      "Guardar cambios",
      selectedCopies.length > 0
        ? "Se actualizará el contacto y se crearán las copias pendientes en los workspaces seleccionados."
        : "¿Quieres guardar los cambios de este contacto?"
    );

    if (confirmed) updateMutation.mutate();
  }

  async function handleDelete() {
    if (formLocked) return;

    const confirmed = await confirmAction(
      "Eliminar contacto",
      "Se eliminará el contacto de este workspace. ¿Deseas continuar?"
    );

    if (confirmed) deleteMutation.mutate();
  }

  async function openLink(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      setError(
        "No se pudo abrir la aplicación de correo o teléfono."
      );
    }
  }

  function openActivity(id: string) {
    router.push({
      pathname: "/tasks/[id]",
      params: { id },
    });
  }

  function createActivity() {
    router.push({
      pathname: "/tasks/new",
      params: { contact_id: contactId },
    });
  }
  function openInCalendar(activity: Activity) {
    const due = milliseconds(activity.due_date);

    if (due === null) {
      setError(
        "Esta actividad necesita una fecha programada para verla en el calendario."
      );
      return;
    }

    const date = new Date(due);

    // Usamos la fecha local para evitar desplazamientos de día.
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    router.push({
      pathname: "/calendar/google",
      params: {
        date: `${year}-${month}-${day}`,
      },
    });
  }
  const activities = activitiesQuery.data ?? [];
  const notes = notesQuery.data ?? [];

  const pending = activities
    .filter(
      (activity) =>
        activity.status === "open" ||
        activity.status === "in_progress"
    )
    .sort((a, b) => {
      const first = milliseconds(a.due_date);
      const second = milliseconds(b.due_date);

      if (first === null && second === null) {
        return Number(b.updated_at) - Number(a.updated_at);
      }
      if (first === null) return 1;
      if (second === null) return -1;
      return first - second;
    });

  const nextActivity = pending[0];

  const lastContact = activities
    .filter(
      (activity) =>
        activity.status === "done" &&
        (activity.type === "call" ||
          activity.type === "meeting") &&
        milliseconds(activity.completed_at) !== null
    )
    .sort(
      (a, b) =>
        Number(b.completed_at) - Number(a.completed_at)
    )[0];

  const nextMeeting = pending.find(
    (activity) =>
      activity.type === "meeting" &&
      (milliseconds(activity.due_date) ?? -1) >= Date.now()
  );

  const history: HistoryItem[] = [];

    for (const activity of activities) {
    const typeLabel = TYPE_LABELS[activity.type] || "Actividad";

    const statusLabel =
      activity.status === "done"
        ? "Realizada"
        : activity.status === "in_progress"
        ? "En proceso"
        : activity.status === "canceled"
        ? "Cancelada"
        : "Abierta";

    const createdAt = milliseconds(activity.created_at);
    const updatedAt = milliseconds(activity.updated_at);
    const completedAt = milliseconds(activity.completed_at);

    const displayDate =
      activity.status === "done"
        ? completedAt ?? updatedAt ?? createdAt
        : updatedAt ?? createdAt;

    history.push({
      id: `activity:${activity.id}`,
      kind: activity.type,
      title: activity.title,
      at: displayDate,
      author: `Responsable: ${responsible(activity)}`,
      label: `${typeLabel} · ${statusLabel}`,
      body: [
        `Creada: ${formatDate(createdAt)}`,
        activity.status === "done"
          ? completedAt !== null
            ? `Realizada: ${formatDate(completedAt)}`
            : "Fecha de realización no disponible"
          : `Última actualización: ${formatDate(updatedAt ?? createdAt)}`,
      ].join("\n"),
      activityId: activity.id,
    });
  }

  for (const note of notes) {
    history.push({
      id: `note:${note.id}`,
      kind: "note",
      title: "Nota añadida",
      body: note.body,
      at: milliseconds(note.created_at),
      author:
        note.created_by_name ||
        note.created_by_email ||
        "Autor no disponible",
      label: "Nota",
    });
  }

  history.sort(
    (a, b) =>
      (b.at ?? -Infinity) - (a.at ?? -Infinity) ||
      a.id.localeCompare(b.id)
  );

  const visibleHistory = history.filter(
    (item) =>
      historyFilter === "all" || item.kind === historyFilter
  );

  const loading =
    initialLoading || (Boolean(context) && contactQuery.isLoading);

  const loadError =
    initialError ||
    (contactQuery.isError
      ? messageOf(contactQuery.error)
      : null);

  const wide = width >= 1050;
  const compact = width > 0 && width < 600;
  const historyLoading =
    activitiesQuery.isLoading || notesQuery.isLoading;
  const historyError =
    activitiesQuery.isError || notesQuery.isError;

  const initials =
    contact?.name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase() || "C";

  const nextOverdue =
    nextActivity &&
    milliseconds(nextActivity.due_date) !== null &&
    Number(nextActivity.due_date) < Date.now();

  return (
    <>
      <Stack.Screen
        options={{
          title: contact?.name || "Detalle de contacto",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "700" },
        }}
      />

      <View
        style={s.screen}
        onLayout={(event) =>
          setWidth(event.nativeEvent.layout.width)
        }
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            s.container,
            compact && s.containerCompact,
          ]}
        >
          {loading ? (
            <View style={s.loading}>
              <ActivityIndicator color={ACCENT} />
              <Text style={s.muted}>Cargando contacto…</Text>
            </View>
          ) : loadError ? (
            <View style={s.card}>
              <Text style={s.error}>{loadError}</Text>
              <View style={s.actions}>
                {!!context && (
                  <Action
                    label="Reintentar"
                    onPress={() => void contactQuery.refetch()}
                  />
                )}
                <Action label="Volver" onPress={() => router.back()} />
              </View>
            </View>
          ) : !contact ? (
            <Text style={s.muted}>
              Contacto no encontrado o sin acceso.
            </Text>
          ) : (
            <>
              <View style={s.card}>
                <View style={s.hero}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{initials}</Text>
                  </View>

                  <View style={s.identity}>
                    <Text style={s.eyebrow}>FICHA DE CONTACTO</Text>
                    <Text style={s.contactName}>{contact.name}</Text>

                    {!!(contact.position || contact.company) && (
                      <Text style={s.description}>
                        {[contact.position, contact.company]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    )}

                    <View style={s.chips}>
                      {!!contact.client_type && (
                        <View style={s.badge}>
                          <Text style={s.badgeText}>
                            {CLIENT_TYPES.find(
                              (item) =>
                                item.value === contact.client_type
                            )?.label || contact.client_type}
                          </Text>
                        </View>
                      )}
                      <View style={s.badge}>
                        <Text style={s.badgeText}>
                          {visibilityLabel(contact.visibility)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={s.actions}>
                    {!editing && (
                      <Action
                        label="Editar contacto"
                        primary
                        disabled={busy}
                        onPress={beginEdit}
                      />
                    )}
                    {!!contact.email && (
                      <Action
                        label="Correo"
                        onPress={() =>
                          void openLink(
                            `mailto:${contact.email!.trim()}`
                          )
                        }
                      />
                    )}
                    {!!contact.phone && (
                      <Action
                        label="Llamar"
                        onPress={() =>
                          void openLink(
                            `tel:${contact.phone!.replace(/[^\d+]/g, "")}`
                          )
                        }
                      />
                    )}
                  </View>
                </View>

                <View style={s.summary}>
                  <View style={s.summaryItem}>
                    <Text style={s.summaryTitle}>Último contacto</Text>
                    <Text style={s.muted}>
                      {activitiesQuery.isLoading
                        ? "Cargando…"
                        : activitiesQuery.isError
                        ? "No disponible"
                        : lastContact
                        ? `${TYPE_LABELS[lastContact.type]} realizada · ${formatDate(lastContact.completed_at)}`
                        : "Sin llamada o reunión realizada con fecha conocida"}
                    </Text>
                  </View>

                  <View style={s.summaryItem}>
                    <Text style={s.summaryTitle}>Próximo paso</Text>
                    <Text style={s.muted}>
                      {activitiesQuery.isLoading
                        ? "Cargando…"
                        : activitiesQuery.isError
                        ? "No disponible"
                        : nextActivity
                        ? `${nextActivity.title} · ${formatDate(nextActivity.due_date)}`
                        : "Sin actividades pendientes"}
                    </Text>
                  </View>

                  <View style={s.summaryItem}>
                    <Text style={s.summaryTitle}>
                      Responsable del próximo paso
                    </Text>
                    <Text style={s.muted}>
                      {activitiesQuery.isLoading
                        ? "Cargando…"
                        : activitiesQuery.isError
                        ? "No disponible"
                        : nextActivity
                        ? responsible(nextActivity)
                        : "Sin próximo paso"}
                    </Text>
                  </View>
                </View>
              </View>

              {!!notice && (
                <View style={s.notice}>
                  <Text style={s.success}>{notice}</Text>
                </View>
              )}

              {!!error && (
                <View style={s.errorBox}>
                  <Text accessibilityRole="alert" style={s.error}>
                    {error}
                  </Text>
                  {saveStarted && (
                    <Text style={s.error}>
                      Los cambios o copias confirmados se conservaron.
                      Puedes reintentar las operaciones pendientes.
                      Si hubo una pérdida de conexión, comprueba las
                      copias antes de volver a crearlas.
                    </Text>
                  )}
                </View>
              )}

              {editing ? (
                <View style={s.card}>
                  <Text style={s.sectionTitle}>Editar contacto</Text>

                  <View style={s.field}>
                    <Text style={s.label}>Nombre *</Text>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      editable={!formLocked}
                      style={s.input}
                      placeholder="Nombre del contacto"
                      placeholderTextColor={SUBTLE}
                    />
                  </View>

                  <Text style={s.label}>Tipo de contacto</Text>
                  <View style={s.chips}>
                    {CLIENT_TYPES.map((item) => (
                      <Pressable
                        key={item.value}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: clientType === item.value,
                        }}
                        disabled={formLocked}
                        onPress={() =>
                          setClientType((previous) =>
                            previous === item.value
                              ? null
                              : item.value
                          )
                        }
                        style={[
                          s.chip,
                          clientType === item.value && s.chipActive,
                        ]}
                      >
                        <Text style={s.chipText}>{item.label}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={s.fieldGrid}>
                    <View style={s.gridField}>
                      <Text style={s.label}>Empresa</Text>
                      <TextInput
                        value={company}
                        onChangeText={setCompany}
                        editable={!formLocked}
                        style={s.input}
                        placeholder="Empresa"
                        placeholderTextColor={SUBTLE}
                      />
                    </View>
                    <View style={s.gridField}>
                      <Text style={s.label}>Cargo / Skill</Text>
                      <TextInput
                        value={position}
                        onChangeText={setPosition}
                        editable={!formLocked}
                        style={s.input}
                        placeholder="Cargo / Skill"
                        placeholderTextColor={SUBTLE}
                      />
                    </View>
                    <View style={s.gridField}>
                      <Text style={s.label}>Email</Text>
                      <TextInput
                        value={email}
                        onChangeText={setEmail}
                        editable={!formLocked}
                        style={s.input}
                        placeholder="usuario@dominio.com"
                        placeholderTextColor={SUBTLE}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                      />
                    </View>
                    <View style={s.gridField}>
                      <Text style={s.label}>Teléfono</Text>
                      <TextInput
                        value={phone}
                        onChangeText={setPhone}
                        editable={!formLocked}
                        style={s.input}
                        placeholder="+56 9 1234 5678"
                        placeholderTextColor={SUBTLE}
                        keyboardType="phone-pad"
                      />
                    </View>
                  </View>

                  {canManageSharing && context ? (
                    <ContactVisibilitySelector
                      theme="light"
                      tenantId={context.tenantId}
                      value={sharing}
                      onChange={setSharing}
                      disabled={formLocked}
                    />
                  ) : (
                    <View style={s.softBox}>
                      <Text style={s.label}>Visibilidad</Text>
                      <Text style={s.muted}>
                        {visibilityLabel(contact.visibility)}
                      </Text>
                      <Text style={s.small}>
                        Solo el administrador creador puede modificar
                        con quién se comparte.
                      </Text>
                    </View>
                  )}

                  {canCopy && (
                    <View style={s.copySection}>
                      <Text style={s.sectionTitle}>
                        Copiar a otros workspaces
                      </Text>
                      <Text style={s.muted}>
                        Cada copia tendrá sus propios permisos. Los
                        cambios posteriores no se sincronizan.
                      </Text>

                      <View style={s.chips}>
                        {workspaces
                          .filter(
                            (workspace) =>
                              workspace.id !== context?.tenantId
                          )
                          .map((workspace) => {
                            const copied = completedCopies.includes(
                              workspace.id
                            );
                            const selected = selectedCopies.includes(
                              workspace.id
                            );

                            return (
                              <Pressable
                                key={workspace.id}
                                accessibilityRole="button"
                                disabled={formLocked || copied}
                                onPress={() =>
                                  toggleCopy(workspace.id)
                                }
                                style={[
                                  s.chip,
                                  (selected || copied) && s.chipActive,
                                  copied && s.disabled,
                                ]}
                              >
                                <Text style={s.chipText}>
                                  {workspace.name}
                                  {copied ? " · Copia creada" : ""}
                                </Text>
                              </Pressable>
                            );
                          })}
                      </View>

                      {selectedCopies.map((tenantId) => (
                        <ContactVisibilitySelector
                          key={tenantId}
                          theme="light"
                          tenantId={tenantId}
                          title={`Privacidad de la copia · ${
                            workspaces.find(
                              (workspace) => workspace.id === tenantId
                            )?.name || tenantId
                          }`}
                          value={
                            cloneSharing[tenantId] || {
                              visibility: null,
                              shared_user_ids: [],
                            }
                          }
                          onChange={(selection) =>
                            setCloneSharing((previous) => ({
                              ...previous,
                              [tenantId]: selection,
                            }))
                          }
                          disabled={
                            formLocked ||
                            completedCopies.includes(tenantId)
                          }
                        />
                      ))}
                    </View>
                  )}

                  <View style={s.actions}>
                    <Action
                      label={
                        updateMutation.isPending
                          ? "Guardando…"
                          : saveStarted
                          ? "Reintentar guardado"
                          : "Guardar cambios"
                      }
                      primary
                      disabled={busy}
                      onPress={() => void handleSave()}
                    />
                    <Action
                      label="Cancelar"
                      disabled={formLocked}
                      onPress={() => {
                        setEditing(false);
                        setError(null);
                      }}
                    />
                  </View>

                  <View style={s.deleteSection}>
                    <Text style={s.small}>
                      Eliminar este contacto del workspace.
                    </Text>
                    <Action
                      label={
                        deleteMutation.isPending
                          ? "Eliminando…"
                          : "Eliminar contacto"
                      }
                      danger
                      disabled={formLocked}
                      onPress={() => void handleDelete()}
                    />
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    s.columns,
                    wide && s.columnsWide,
                  ]}
                >
                  <View style={s.mainColumn}>
                    <View style={s.tabs}>
                      {(
                        [
                          ["history", "Historial"],
                          ["activities", "Actividades"],
                          ["notes", "Notas"],
                        ] as const
                      ).map(([value, label]) => (
                        <Pressable
                          key={value}
                          accessibilityRole="tab"
                          accessibilityState={{
                            selected: tab === value,
                          }}
                          onPress={() => setTab(value)}
                          style={[
                            s.tab,
                            tab === value && s.tabActive,
                          ]}
                        >
                          <Text
                            style={[
                              s.tabText,
                              tab === value && s.tabTextActive,
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {tab === "history" ? (
                      <View style={s.card}>
                        <Text style={s.sectionTitle}>
                          Historial del contacto
                        </Text>
                        <Text style={s.small}>
                          Actividades con su estado actual y notas,
                          ordenadas por su última fecha registrada.
                        </Text>

                        <View style={s.chips}>
                          {(
                            [
                              ["all", "Todo"],
                              ["call", "Llamadas"],
                              ["meeting", "Reuniones"],
                              ["note", "Notas"],
                            ] as const
                          ).map(([value, label]) => (
                            <Pressable
                              key={value}
                              accessibilityRole="button"
                              accessibilityState={{
                                selected: historyFilter === value,
                              }}
                              onPress={() => setHistoryFilter(value)}
                              style={[
                                s.chip,
                                historyFilter === value && s.chipActive,
                              ]}
                            >
                              <Text style={s.chipText}>{label}</Text>
                            </Pressable>
                          ))}
                        </View>

                        {historyLoading && (
                          <View style={s.loading}>
                            <ActivityIndicator color={ACCENT} />
                            <Text style={s.muted}>
                              Cargando historial…
                            </Text>
                          </View>
                        )}

                        {historyError && (
                          <View style={s.errorBox}>
                            <Text style={s.error}>
                              No pudimos cargar todo el historial.
                              Los registros disponibles se muestran abajo.
                            </Text>
                            <Action
                              label="Reintentar"
                              onPress={() => {
                                void activitiesQuery.refetch();
                                void notesQuery.refetch();
                              }}
                            />
                          </View>
                        )}

                        {!historyLoading &&
                          !historyError &&
                          visibleHistory.length === 0 && (
                            <Text style={s.muted}>
                              No hay registros para esta selección.
                            </Text>
                          )}

                        {visibleHistory.map((item) => (
                          <View key={item.id} style={s.timelineRow}>
                            <View style={s.timelineRail}>
                              <View style={s.timelineDot}>
                                <Text style={s.timelineLetter}>
                                  {TYPE_LABELS[item.kind].charAt(0)}
                                </Text>
                              </View>
                              <View style={s.timelineLine} />
                            </View>

                            <View style={s.timelineBody}>
                              <Text style={s.eyebrow}>{item.label}</Text>
                              <Text style={s.itemTitle}>{item.title}</Text>
                              <Text style={s.small}>
                                {formatDate(item.at)} · {item.author}
                              </Text>

                              {!!item.body && (
                                <Text style={s.description}>
                                  {item.body}
                                </Text>
                              )}

                              {!!item.activityId && (
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() =>
                                    openActivity(item.activityId!)
                                  }
                                  style={s.textAction}
                                >
                                  <Text style={s.link}>
                                    Ver actividad →
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                          </View>
                        ))}

                        <View style={s.actions}>
                          <Action
                            label="+ Añadir nota"
                            onPress={() => setTab("notes")}
                          />
                          <Action
                            label="+ Crear actividad"
                            onPress={createActivity}
                          />
                        </View>
                      </View>
                    ) : tab === "activities" ? (
                      <>
                        {membersQuery.isError && (
                          <View style={s.errorBox}>
                            <Text style={s.error}>
                              No pudimos cargar los nombres de los
                              integrantes del workspace.
                            </Text>
                            <Action
                              label="Reintentar"
                              onPress={() =>
                                void membersQuery.refetch()
                              }
                            />
                          </View>
                        )}
                        <RelatedActivities
                          key={context?.storageKey}
                          filters={{ contact_id: contactId }}
                          members={members}
                        />
                      </>
                    ) : (
                      <RelatedNotes
                        key={context?.storageKey}
                        filters={{ contact_id: contactId }}
                      />
                    )}
                  </View>

                  <View
                    style={[
                      s.sideColumn,
                      wide && s.sideColumnWide,
                    ]}
                  >
                    <View style={[s.card, s.nextCard]}>
                      <Text style={s.sectionTitle}>
                        {nextOverdue
                          ? "Seguimiento pendiente"
                          : "Próxima actividad"}
                      </Text>

                      {activitiesQuery.isLoading ? (
                        <ActivityIndicator color={ACCENT} />
                      ) : activitiesQuery.isError ? (
                        <>
                          <Text style={s.error}>
                            No pudimos cargar las actividades.
                          </Text>
                          <Action
                            label="Reintentar"
                            onPress={() =>
                              void activitiesQuery.refetch()
                            }
                          />
                        </>
                      ) : nextActivity ? (
                        <>
                          <Text style={s.itemTitle}>
                            {nextActivity.title}
                          </Text>
                          <Text
                            style={[
                              s.muted,
                              nextOverdue && s.overdue,
                            ]}
                          >
                            {nextOverdue ? "Atrasada · " : ""}
                            {formatDate(nextActivity.due_date)}
                          </Text>
                          <Text style={s.muted}>
                            {responsible(nextActivity)}
                          </Text>

                          <View style={s.actions}>
                            <Action
                              label={
                                completeMutation.isPending
                                  ? "Guardando…"
                                  : "Completar"
                              }
                              primary
                              disabled={
                                busy || activitiesQuery.isFetching
                              }
                              onPress={() =>
                                completeMutation.mutate(nextActivity)
                              }
                            />
                            <Action
                              label="Ver / Reagendar"
                              onPress={() =>
                                openActivity(nextActivity.id)
                              }
                            />
                          </View>
                        </>
                      ) : (
                        <Text style={s.muted}>
                          No hay actividades pendientes.
                        </Text>
                      )}

                      <Text style={s.small}>
                        Primero se muestran los pendientes con fecha,
                        incluidos los atrasados; después, los sin fecha.
                      </Text>

                      <Action
                        label="+ Programar actividad"
                        onPress={createActivity}
                      />
                    </View>

                    <View style={s.card}>
                      <Text style={s.sectionTitle}>
                        Próxima reunión
                      </Text>
                      {activitiesQuery.isLoading ? (
                        <Text style={s.muted}>Cargando…</Text>
                      ) : activitiesQuery.isError ? (
                        <Text style={s.muted}>
                          Información no disponible.
                        </Text>
                      ) : nextMeeting ? (
                        <>
                          <Text style={s.itemTitle}>
                            {nextMeeting.title}
                          </Text>
                          <Text style={s.muted}>
                            {formatDate(nextMeeting.due_date)}
                          </Text>
                          <Text style={s.muted}>
                            {responsible(nextMeeting)}
                          </Text>
                                                   <View style={s.actions}>
                            <Action
                              label="Ver reunión"
                              onPress={() =>
                                openActivity(nextMeeting.id)
                              }
                            />

                            <Action
                              label="Ver en calendario"
                              onPress={() =>
                                openInCalendar(nextMeeting)
                              }
                            />
                          </View>
                        </>
                      ) : (
                        <Text style={s.muted}>
                          No hay reuniones futuras con fecha programada.
                        </Text>
                      )}
                    </View>

                    <View style={s.card}>
                      <Text style={s.sectionTitle}>
                        Datos de contacto
                      </Text>

                      <View style={s.detailRow}>
                        <Text style={s.label}>Correo</Text>
                        <Text selectable style={s.description}>
                          {contact.email || "Sin correo"}
                        </Text>
                      </View>
                      <View style={s.detailRow}>
                        <Text style={s.label}>Teléfono</Text>
                        <Text selectable style={s.description}>
                          {contact.phone || "Sin teléfono"}
                        </Text>
                      </View>
                      <View style={s.detailRow}>
                        <Text style={s.label}>Empresa</Text>
                        <Text style={s.description}>
                          {contact.company || "Sin empresa"}
                        </Text>
                      </View>
                      <View style={s.detailRow}>
                        <Text style={s.label}>Creado por</Text>
                        <Text style={s.description}>
                          {contact.created_by_name ||
                            contact.created_by_email ||
                            "No disponible"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  container: {
    width: "100%",
    maxWidth: 1600,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 48,
    gap: 16,
  },
  containerCompact: { padding: 12, paddingBottom: 32 },
  card: {
    minWidth: 0,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 20,
    gap: 14,
  },
  hero: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: "#eee8f9",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: ACCENT,
    fontSize: 24,
    fontWeight: "700",
  },
  identity: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 240,
    minWidth: 0,
    gap: 7,
  },
  eyebrow: {
    color: "#8a819e",
    fontSize: 10,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  contactName: {
    color: TEXT,
    fontSize: 26,
    lineHeight: 34,
    fontWeight: "700",
  },
  description: { color: "#475467", fontSize: 13, lineHeight: 22 },
  muted: { color: SUBTLE, fontSize: 12, lineHeight: 20 },
  small: { color: "#8991a2", fontSize: 11, lineHeight: 18 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#f1ecfa",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  badgeText: { color: ACCENT, fontSize: 11, fontWeight: "600" },
  summary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 18,
    marginTop: 4,
  },
  summaryItem: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 220,
    minWidth: 0,
    gap: 5,
  },
  summaryTitle: { color: TEXT, fontSize: 12, fontWeight: "700" },
  columns: { gap: 16, alignItems: "stretch" },
  columnsWide: { flexDirection: "row", alignItems: "flex-start" },
  mainColumn: { flex: 1, minWidth: 0, gap: 12 },
  sideColumn: { minWidth: 0, gap: 14 },
  sideColumnWide: { width: 340, flexShrink: 0 },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 5,
    gap: 4,
  },
  tab: {
    minHeight: 42,
    paddingHorizontal: 17,
    paddingVertical: 12,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: { backgroundColor: "#f1ecfa" },
  tabText: { color: SUBTLE, fontSize: 12, fontWeight: "600" },
  tabTextActive: { color: ACCENT },
  sectionTitle: { color: TEXT, fontSize: 16, fontWeight: "700" },
  itemTitle: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 22,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: "#f1ecfa",
    borderColor: "#bba5df",
  },
  chipText: { color: ACCENT, fontSize: 12, fontWeight: "600" },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  button: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#ded5ef",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: { backgroundColor: ACCENT, borderColor: ACCENT },
  buttonDanger: {
    backgroundColor: "#fff3f3",
    borderColor: "#f3d6d6",
  },
  buttonText: { color: ACCENT, fontSize: 12, fontWeight: "600" },
  buttonPrimaryText: { color: "#ffffff" },
  buttonDangerText: { color: "#b42332" },
  disabled: { opacity: 0.5 },
  loading: { paddingVertical: 32, alignItems: "center", gap: 12 },
  notice: {
    padding: 14,
    backgroundColor: "#edf8f1",
    borderRadius: 10,
  },
  success: { color: "#23744d", fontSize: 12, fontWeight: "600" },
  errorBox: {
    padding: 14,
    gap: 10,
    backgroundColor: "#fff3f3",
    borderWidth: 1,
    borderColor: "#f3d6d6",
    borderRadius: 10,
  },
  error: { color: "#b42332", fontSize: 12, lineHeight: 20 },
  field: { gap: 7 },
  fieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  gridField: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 280,
    minWidth: 0,
    gap: 7,
  },
  label: { color: TEXT, fontSize: 12, fontWeight: "600" },
  input: {
    width: "100%",
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: "#ffffff",
    color: TEXT,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
  },
  softBox: {
    backgroundColor: "#f8f9fc",
    borderRadius: 9,
    padding: 14,
    gap: 7,
  },
  copySection: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 18,
    gap: 14,
  },
  deleteSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 18,
    gap: 10,
    alignItems: "flex-start",
  },
  timelineRow: { flexDirection: "row", gap: 12 },
  timelineRail: { width: 34, alignItems: "center" },
  timelineDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#eee8f9",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineLetter: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: "700",
  },
  timelineLine: {
    width: 1,
    flex: 1,
    minHeight: 12,
    backgroundColor: "#e5ddef",
    marginTop: 6,
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#eef0f5",
  },
  textAction: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: "center",
  },
  link: { color: ACCENT, fontSize: 12, fontWeight: "600" },
  nextCard: { borderTopWidth: 4, borderTopColor: ACCENT },
  overdue: { color: "#b86630", fontWeight: "600" },
  detailRow: { gap: 4 },
});