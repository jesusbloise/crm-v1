// app/contacts/[id].tsx
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
  useLocalSearchParams,
} from "expo-router";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const BG = "#f5f6fa";
const CARD = "#ffffff";
const FIELD = "#ffffff";
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

const CLIENT_TYPES: Array<{
  value: Exclude<ClientType, null>;
  label: string;
}> = [
  { value: "productora", label: "Productora" },
  { value: "agencia", label: "Agencia" },
  { value: "directo", label: "Cliente directo" },
  { value: "proveedor", label: "Proveedor" },
];

function visibilityLabel(value?: string) {
  if (value === "private") return "Solo el creador";
  if (value === "selected") return "Usuarios seleccionados";
  return "Todo el workspace";
}

async function confirmAction(
  title: string,
  message: string
): Promise<boolean> {
  if (Platform.OS === "web") {
    return window.confirm(`${title}\n\n${message}`);
  }

  return new Promise((resolve) => {
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

export default function ContactDetail() {
  const params = useLocalSearchParams<{
    id?: string | string[];
  }>();

  const contactId = Array.isArray(params.id)
    ? params.id[0]
    : params.id;

  if (!contactId || contactId === "index") {
    return (
      <View style={styles.screen}>
        <Text style={styles.subtle}>Ruta inválida.</Text>
      </View>
    );
  }

  return (
    <ContactDetailForm
      key={contactId}
      contactId={contactId}
    />
  );
}

function ContactDetailForm({
  contactId,
}: {
  contactId: string;
}) {
  const queryClient = useQueryClient();

  const [context, setContext] = useState<SessionContext | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

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
        if (!cancelled) {
          setInitialError(
            err instanceof Error
              ? err.message
              : "No se pudo preparar el contacto."
          );
        }
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
    queryKey: [
      "contact",
      contactId,
      context?.storageKey,
    ],
    queryFn: async () => {
      await assertSession();
      const contact = await getContact(contactId);
      await assertSession();
      return contact;
    },
    enabled: Boolean(context),
    retry: false,
  });

  const membersQuery = useQuery({
    queryKey: [
      "workspaceMembers",
      context?.storageKey,
    ],
    queryFn: async () => {
      await assertSession();
      const members = await listWorkspaceMembers();
      await assertSession();
      return members;
    },
    enabled: Boolean(context) && Boolean(contactQuery.data),
    retry: false,
  });

  const members: WorkspaceMember[] = membersQuery.data ?? [];
  const contact = contactQuery.data;

  const canManageSharing =
    contact?.can_manage_sharing === true;

  const canCopy =
    canManageSharing && context?.isAdmin === true;

  useEffect(() => {
    if (!contact || saveStarted) return;

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
  }, [contact, saveStarted]);

  async function refreshRelated() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["contact", contactId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["contacts"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["contacts-all"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["activities"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["notes"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["deals"],
      }),
    ]);
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      await assertSession();

      if (!name.trim()) {
        throw new Error("El nombre es obligatorio.");
      }

      if (
        canManageSharing &&
        (
          !sharing.visibility ||
          (
            sharing.visibility === "selected" &&
            sharing.shared_user_ids.length === 0
          )
        )
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
          (
            choice.visibility === "selected" &&
            choice.shared_user_ids.length === 0
          )
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
          progress = {
            id: uid(),
            saved: false,
          };

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
      setNotice("Cambios guardados.");
      await refreshRelated();
    },

    onError: (err) => {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron guardar los cambios."
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await assertSession();
      await deleteContact(contactId);
    },

    onSuccess: async () => {
      await refreshRelated();

      queryClient.removeQueries({
        queryKey: ["contact", contactId],
      });

      router.back();
    },

    onError: (err) => {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el contacto."
      );
    },
  });

  const busy =
    updateMutation.isPending || deleteMutation.isPending;

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
        ? "Se actualizará el contacto y se crearán las copias " +
            "pendientes en los workspaces seleccionados."
        : "¿Quieres guardar los cambios de este contacto?"
    );

    if (confirmed) updateMutation.mutate();
  }

  async function handleDelete() {
    if (formLocked) return;

    const confirmed = await confirmAction(
      "Eliminar contacto",
      "Se eliminará el contacto de este workspace. " +
        "¿Deseas continuar?"
    );

    if (confirmed) deleteMutation.mutate();
  }

  const loading =
    initialLoading ||
    (Boolean(context) && contactQuery.isLoading);

  const loadError =
    initialError ||
    (
      contactQuery.isError
        ? (
            contactQuery.error instanceof Error
              ? contactQuery.error.message
              : "No se pudo cargar el contacto."
          )
        : null
    );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Detalle de contacto",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: {
            color: TEXT,
            fontWeight: "800",
          },
        }}
      />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={ACCENT} />
            <Text style={styles.subtle}>Cargando contacto…</Text>
          </View>
        ) : loadError ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{loadError}</Text>

            {context && (
              <Pressable
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => {
                  void contactQuery.refetch();
                }}
              >
                <Text style={styles.btnText}>Reintentar</Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => router.back()}
            >
              <Text style={styles.btnText}>Volver</Text>
            </Pressable>
          </View>
        ) : !contact ? (
          <Text style={styles.subtle}>
            Contacto no encontrado o sin acceso.
          </Text>
        ) : (
          <>
                        <View style={styles.contactHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(contact.name?.trim().charAt(0) || "C").toUpperCase()}
                </Text>
              </View>

              <View style={styles.headerInfo}>
                <Text style={styles.eyebrow}>FICHA DE CONTACTO</Text>

                <Text style={styles.contactTitle}>
                  {contact.name || "Contacto"}
                </Text>

                {!!contact.company && (
                  <Text style={styles.subtle}>{contact.company}</Text>
                )}

                <View style={styles.visibilityBadge}>
                  <Text style={styles.visibilityBadgeText}>
                    {visibilityLabel(contact.visibility)}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.section}>Información general</Text>

            {!!contact.created_by_name && (
              <View style={styles.infoBox}>
                <Text style={styles.creatorLabel}>Creado por</Text>
                <Text style={styles.label}>
                  {contact.created_by_name}
                </Text>

                {!!contact.created_by_email && (
                  <Text style={styles.subtle}>
                    {contact.created_by_email}
                  </Text>
                )}
              </View>
            )}

            <Text style={styles.label}>Nombre *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              editable={!formLocked}
              style={[styles.input, styles.nameInput]}
              placeholder="Nombre del contacto"
              placeholderTextColor={SUBTLE}
            />

            <Text style={styles.label}>Tipo de contacto</Text>

            <View style={styles.chipRow}>
              {CLIENT_TYPES.map((item) => {
                const selected = clientType === item.value;

                return (
                  <Pressable
                    key={item.value}
                    disabled={formLocked}
                    onPress={() =>
                      setClientType((previous) =>
                        previous === item.value ? null : item.value
                      )
                    }
                    style={[
                      styles.chip,
                      selected && styles.chipActive,
                    ]}
                  >
                    <Text style={styles.chipText}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Empresa</Text>
            <TextInput
              value={company}
              onChangeText={setCompany}
              editable={!formLocked}
              style={styles.input}
              placeholder="Empresa"
              placeholderTextColor={SUBTLE}
            />

            <Text style={styles.label}>Cargo / Skill</Text>
            <TextInput
              value={position}
              onChangeText={setPosition}
              editable={!formLocked}
              style={styles.input}
              placeholder="Cargo / Skill"
              placeholderTextColor={SUBTLE}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              editable={!formLocked}
              style={styles.input}
              placeholder="usuario@dominio.com"
              placeholderTextColor={SUBTLE}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />

            <Text style={styles.label}>Teléfono</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              editable={!formLocked}
              style={styles.input}
              placeholder="+56 9 1234 5678"
              placeholderTextColor={SUBTLE}
              keyboardType="phone-pad"
            />

            {canManageSharing && context ? (
              <ContactVisibilitySelector
              theme="light"
                tenantId={context.tenantId}
                value={sharing}
                onChange={setSharing}
                disabled={formLocked}
              />
            ) : (
              <View style={styles.infoBox}>
                <Text style={styles.label}>Visibilidad</Text>
                <Text style={styles.subtle}>
                  {visibilityLabel(contact.visibility)}
                </Text>
                <Text style={styles.subtle}>
                  Solo el administrador creador puede modificar
                  con quién se comparte.
                </Text>
              </View>
            )}

            {canCopy && (
              <>
                <Text style={styles.section}>
                  Copiar a otros workspaces
                </Text>

                <Text style={styles.subtle}>
                  Cada copia tendrá sus propios permisos.
                  Los cambios posteriores no se sincronizan.
                </Text>

                <View style={styles.chipRow}>
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
                          disabled={formLocked || copied}
                          onPress={() => toggleCopy(workspace.id)}
                          style={[
                            styles.chip,
                            (selected || copied) && styles.chipActive,
                            copied && styles.disabled,
                          ]}
                        >
                          <Text style={styles.chipText}>
                            {workspace.name}
                            {copied ? " · Copia creada" : ""}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>

                {selectedCopies.map((tenantId) => (
                  <ContactVisibilitySelector
                  theme="light"
                    key={tenantId}
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
              </>
            )}

            {!!notice && (
              <View style={styles.infoBox}>
                <Text style={styles.success}>{notice}</Text>
              </View>
            )}

            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.error}>{error}</Text>

                {saveStarted && (
                  <Text style={styles.error}>
                    Los cambios o copias confirmados se conservaron.
                    Puedes reintentar las operaciones pendientes.
                    Si hubo una pérdida de conexión, comprueba
                    las copias antes de volver a crearlas.
                  </Text>
                )}
              </View>
            )}

            <Pressable
              style={[
                styles.btn,
                styles.btnPrimary,
                busy && styles.disabled,
              ]}
              disabled={busy}
              onPress={() => {
                void handleSave();
              }}
            >
              <Text style={styles.btnText}>
                {updateMutation.isPending
                  ? "Guardando…"
                  : saveStarted
                  ? "Reintentar guardado"
                  : "Guardar cambios"}
              </Text>
            </Pressable>
            {membersQuery.isLoading ? (
              <Text style={styles.subtle}>
                Cargando integrantes…
              </Text>
            ) : membersQuery.isError ? (
              <View style={styles.errorBox}>
                <Text style={styles.error}>
                  No se pudieron cargar los integrantes
                  para asignar actividades.
                </Text>
                <Pressable
                  onPress={() => {
                    void membersQuery.refetch();
                  }}
                >
                  <Text style={styles.link}>Reintentar</Text>
                </Pressable>
              </View>
            ) : (
              <RelatedActivities
                filters={{ contact_id: contactId }}
                members={members}
              />
            )}

            <RelatedNotes filters={{ contact_id: contactId }} />

            <Pressable
              style={[
                styles.btn,
                styles.btnDanger,
                formLocked && styles.disabled,
              ]}
              disabled={formLocked}
              onPress={() => {
                void handleDelete();
              }}
            >
              <Text style={styles.btnText}>
                {deleteMutation.isPending
                  ? "Eliminando…"
                  : "Eliminar contacto"}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.btn,
                styles.btnGhost,
                busy && styles.disabled,
              ]}
              disabled={busy}
              onPress={() => router.back()}
            >
              <Text style={styles.btnText}>Volver</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },

  container: {
    width: "100%",
    maxWidth: 1000,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
    gap: 12,
  },

  contactHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    padding: 20,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    marginBottom: 8,
  },

  avatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "#eee8f9",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  avatarText: {
    color: ACCENT,
    fontSize: 25,
    fontWeight: "700",
  },

  headerInfo: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },

  eyebrow: {
    color: SUBTLE,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },

  contactTitle: {
    color: TEXT,
    fontSize: 24,
    fontWeight: "700",
    flexShrink: 1,
  },

  visibilityBadge: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    backgroundColor: "#f1ecfa",
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 3,
  },

  visibilityBadgeText: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },

  loading: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
  },

  section: {
    color: TEXT,
    fontWeight: "700",
    fontSize: 17,
    marginTop: 22,
    marginBottom: 4,
  },

  label: {
    color: TEXT,
    fontWeight: "600",
    fontSize: 13,
    marginTop: 6,
  },

  subtle: {
    color: SUBTLE,
    fontSize: 13,
    lineHeight: 20,
  },

  input: {
    width: "100%",
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
  },

  nameInput: {
    fontSize: 16,
    fontWeight: "600",
  },

  infoBox: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 15,
    gap: 5,
  },

  creatorLabel: {
    color: SUBTLE,
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  chip: {
    maxWidth: "100%",
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: CARD,
  },

  chipActive: {
    borderColor: "#b49bdc",
    backgroundColor: "#eee8f8",
  },

  chipText: {
    color: TEXT,
    fontWeight: "600",
    fontSize: 12,
    flexShrink: 1,
  },

  btn: {
    minHeight: 44,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  btnPrimary: {
    backgroundColor: ACCENT,
  },

  btnDanger: {
    backgroundColor: "#b42332",
    marginTop: 28,
  },

  btnGhost: {
    backgroundColor: "#596274",
  },

  btnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },

  disabled: {
    opacity: 0.55,
  },

  errorBox: {
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderRadius: 10,
    padding: 15,
    gap: 8,
  },

  error: {
    color: "#a12637",
    fontSize: 13,
    lineHeight: 20,
  },

  success: {
    color: "#18734b",
    fontWeight: "600",
    fontSize: 13,
  },

  link: {
    color: ACCENT,
    fontWeight: "600",
    paddingVertical: 8,
  },
});