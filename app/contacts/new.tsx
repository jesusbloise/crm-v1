// app/contacts/new.tsx
import {
  authFetch,
  fetchTenants,
  getAuthStorageScope,
  getRoleNow,
} from "@/src/api/auth";
import {
  createContact,
  type ClientType,
  type SharingSelection,
} from "@/src/api/contacts";
import ContactVisibilitySelector from "@/src/components/ContactVisibilitySelector";
import { uid } from "@/src/utils/uid";
import { Feather } from "@expo/vector-icons";
import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
  useWindowDimensions,
} from "react-native";

const COLORS = {
  background: "#f5f6fa",
  surface: "#ffffff",
  field: "#fbfcfe",
  border: "#e7e9f0",
  text: "#202536",
  muted: "#737b8e",
  primary: "#7551c8",
  primarySoft: "#f0ebfb",
  error: "#ae354b",
  errorBackground: "#fff2f4",
};

type TenantItem = {
  id: string;
  name: string;
};

type SaveProgress = {
  contactId: string;
  contactSaved: boolean;
  noteSaved: boolean;
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

function FormSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon: "user" | "briefcase" | "shield" | "file-text";
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}>
          <Feather
            name={icon}
            size={18}
            color={COLORS.primary}
          />
        </View>

        <View style={styles.sectionHeadingText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {!!description && (
            <Text style={styles.sectionDescription}>
              {description}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Field({
  label,
  required = false,
  half = false,
  children,
}: {
  label: string;
  required?: boolean;
  half?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[styles.fieldGroup, half && styles.halfField]}>
      <Text style={styles.label}>
        {label}
        {required && (
          <Text style={styles.required}> *</Text>
        )}
      </Text>
      {children}
    </View>
  );
}

export default function NewContact() {
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();

  const twoColumns = Platform.OS === "web" && width >= 1100;

  const [name, setName] = useState("");
  const [clientType, setClientType] = useState<ClientType>(null);
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);

  const [sharing, setSharing] = useState<
    Record<string, SharingSelection>
  >({});

  const [role, setRole] = useState<
    "owner" | "admin" | "member" | null
  >(null);

  const [initialScopeKey, setInitialScopeKey] = useState<
    string | null
  >(null);

  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [saveStarted, setSaveStarted] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const progressRef = useRef<Record<string, SaveProgress>>({});

  const isAdmin = role === "admin" || role === "owner";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setInitialError(null);

        const scope = await getAuthStorageScope();

        if (!scope) {
          throw new Error(
            "No se pudo comprobar tu sesión. Vuelve a iniciar sesión."
          );
        }

        const [currentRole, tenantResponse] = await Promise.all([
          getRoleNow(),
          fetchTenants(),
        ]);

        const currentScope = await getAuthStorageScope();

        if (currentScope?.storageKey !== scope.storageKey) {
          throw new Error(
            "Cambió la sesión o el workspace. Reabre el formulario."
          );
        }

        if (!currentRole) {
          throw new Error(
            "No se pudo comprobar tu rol. Reabre el formulario."
          );
        }

        const items: TenantItem[] = (
          tenantResponse.items ?? []
        ).map((tenant) => ({
          id: tenant.id,
          name: tenant.name || tenant.id,
        }));

        if (!items.some((tenant) => tenant.id === scope.tenantId)) {
          items.push({
            id: scope.tenantId,
            name: scope.tenantId,
          });
        }

        if (cancelled) return;

        setRole(currentRole);
        setInitialScopeKey(scope.storageKey);
        setTenants(items);
        setSelectedTenants([scope.tenantId]);
      } catch (err) {
        if (!cancelled) {
          setInitialError(
            err instanceof Error
              ? err.message
              : "No se pudo preparar el formulario."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function assertSession() {
    const scope = await getAuthStorageScope();

    if (
      !scope ||
      !initialScopeKey ||
      scope.storageKey !== initialScopeKey
    ) {
      throw new Error(
        "Cambió la sesión o el workspace. Reabre el formulario."
      );
    }
  }

  function validate(): string | null {
    if (!name.trim()) return "El nombre es obligatorio.";

    if (!role || !initialScopeKey) {
      return "No se pudieron comprobar tus permisos.";
    }

    if (selectedTenants.length === 0) {
      return "Selecciona al menos un workspace.";
    }

    if (isAdmin) {
      for (const tenantId of selectedTenants) {
        const choice = sharing[tenantId];
        const tenantName =
          tenants.find((tenant) => tenant.id === tenantId)?.name ||
          tenantId;

        if (!choice?.visibility) {
          return `Elige la visibilidad del contacto en ${tenantName}.`;
        }

        if (
          choice.visibility === "selected" &&
          choice.shared_user_ids.length === 0
        ) {
          return `Selecciona al menos una persona en ${tenantName}.`;
        }
      }
    }

    return null;
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const validationError = validate();

      if (validationError) {
        throw new Error(validationError);
      }

      await assertSession();

      setError(null);
      setSaveStarted(true);

      const noteBody = notes.trim();

      for (const tenantId of selectedTenants) {
        await assertSession();

        let progress = progressRef.current[tenantId];

        if (!progress) {
          progress = {
            contactId: uid(),
            contactSaved: false,
            noteSaved: false,
          };

          progressRef.current[tenantId] = progress;
        }

        const choice = sharing[tenantId];

        if (!progress.contactSaved) {
          try {
            await createContact(
              {
                id: progress.contactId,
                name: name.trim(),
                company: company.trim() || null,
                position: position.trim() || null,
                email: email.trim() || null,
                phone: phone.trim() || null,
                client_type: clientType,
                visibility: isAdmin
                  ? choice.visibility!
                  : "workspace",
                shared_user_ids:
                  isAdmin && choice.visibility === "selected"
                    ? choice.shared_user_ids
                    : [],
              },
              tenantId
            );
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : "No se pudo crear el contacto.";

            if (message === "contact_exists") {
              throw new Error(
                "El ID de una copia ya existe. Puede que un intento " +
                  "anterior se haya guardado sin recibir confirmación. " +
                  "Comprueba el contacto antes de volver a crearlo."
              );
            }

            throw err;
          }

          progress.contactSaved = true;

          setSavedCount(
            Object.values(progressRef.current).filter(
              (item) => item.contactSaved
            ).length
          );
        }

        if (noteBody && !progress.noteSaved) {
          await assertSession();

          await authFetch("/notes", {
            method: "POST",
            headers: {
              "X-Tenant-Id": tenantId,
            },
            body: JSON.stringify({
              body: noteBody,
              contact_id: progress.contactId,
            }),
          });

          progress.noteSaved = true;
        }
      }
    },

    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["contacts"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["contacts-all"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["notes"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["activities"],
        }),
      ]);

      const message =
        selectedTenants.length > 1
          ? "Contactos guardados en los workspaces seleccionados"
          : "Contacto guardado";

      if (Platform.OS === "android") {
        ToastAndroid.show(message, ToastAndroid.SHORT);
      } else if (Platform.OS === "ios") {
        Alert.alert("Listo", message);
      }

      router.replace("/contacts");
    },

    onError: (err) => {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el contacto."
      );
    },
  });

  const formLocked = mutation.isPending || saveStarted;

  function toggleTenant(tenantId: string) {
    if (formLocked) return;

    setSelectedTenants((previous) =>
      previous.includes(tenantId)
        ? previous.filter((id) => id !== tenantId)
        : [...previous, tenantId]
    );
  }

  function handleSave() {
    if (mutation.isPending) return;

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    mutation.mutate();
  }

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/contacts");
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: "Nuevo contacto",
          headerStyle: {
            backgroundColor: COLORS.surface,
          },
          headerTintColor: COLORS.text,
          headerTitleStyle: {
            color: COLORS.text,
            fontWeight: "600",
          },
        }}
      />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          !twoColumns && styles.scrollContentCompact,
        ]}
      >
        <View style={styles.formContainer}>
          <View style={styles.breadcrumb}>
            <Pressable
              onPress={() => router.replace("/contacts")}
              disabled={mutation.isPending}
            >
              <Text style={styles.breadcrumbLink}>Contactos</Text>
            </Pressable>

            <Feather
              name="chevron-right"
              size={12}
              color={COLORS.muted}
            />

            <Text style={styles.breadcrumbCurrent}>Nuevo contacto</Text>
          </View>

          <View style={styles.pageHeading}>
            <View style={styles.pageHeadingText}>
              <Text style={styles.pageTitle}>Nuevo contacto</Text>
              <Text style={styles.pageDescription}>
                Organiza sus datos y decide con quién compartirlo.
              </Text>
            </View>

            <View style={styles.newBadge}>
              <View style={styles.newBadgeDot} />
              <Text style={styles.newBadgeText}>Sin guardar</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.description}>
                Preparando formulario…
              </Text>
            </View>
          ) : initialError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{initialError}</Text>

              <Pressable
                onPress={goBack}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Volver</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <FormSection
                title="Información del contacto"
                description="Los campos con asterisco son obligatorios."
                icon="user"
              >
                <View style={styles.fields}>
                  <Field label="Nombre completo" required>
                    <TextInput
                      accessibilityLabel="Nombre completo obligatorio"
                      style={[
                        styles.input,
                        formLocked && styles.lockedInput,
                      ]}
                      value={name}
                      onChangeText={setName}
                      editable={!formLocked}
                      placeholder="Ej: Juan Pérez"
                      placeholderTextColor={COLORS.muted}
                    />
                  </Field>

                  <Field label="Tipo de contacto">
                    <View style={styles.chipRow}>
                      {CLIENT_TYPES.map((item) => {
                        const selected = clientType === item.value;

                        return (
                          <Pressable
                            key={item.value}
                            disabled={formLocked}
                            accessibilityRole="button"
                            accessibilityState={{
                              selected,
                              disabled: formLocked,
                            }}
                            onPress={() =>
                              setClientType((previous) =>
                                previous === item.value
                                  ? null
                                  : item.value
                              )
                            }
                            style={[
                              styles.typeChip,
                              selected && styles.typeChipActive,
                              formLocked && styles.disabled,
                            ]}
                          >
                            {selected && (
                              <Feather
                                name="check"
                                size={13}
                                color={COLORS.primary}
                              />
                            )}

                            <Text
                              style={[
                                styles.typeChipText,
                                selected && styles.typeChipTextActive,
                              ]}
                            >
                              {item.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Field>

                  <Field label="Empresa" half={twoColumns}>
                    <TextInput
                      accessibilityLabel="Empresa"
                      style={[
                        styles.input,
                        formLocked && styles.lockedInput,
                      ]}
                      value={company}
                      onChangeText={setCompany}
                      editable={!formLocked}
                      placeholder="Nombre de la empresa"
                      placeholderTextColor={COLORS.muted}
                    />
                  </Field>

                  <Field label="Cargo / Skill" half={twoColumns}>
                    <TextInput
                      accessibilityLabel="Cargo o skill"
                      style={[
                        styles.input,
                        formLocked && styles.lockedInput,
                      ]}
                      value={position}
                      onChangeText={setPosition}
                      editable={!formLocked}
                      placeholder="Ej: Director de producción"
                      placeholderTextColor={COLORS.muted}
                    />
                  </Field>

                  <Field label="Correo electrónico" half={twoColumns}>
                    <TextInput
                      accessibilityLabel="Correo electrónico"
                      style={[
                        styles.input,
                        formLocked && styles.lockedInput,
                      ]}
                      value={email}
                      onChangeText={setEmail}
                      editable={!formLocked}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      placeholder="usuario@empresa.com"
                      placeholderTextColor={COLORS.muted}
                    />
                  </Field>

                  <Field label="Teléfono" half={twoColumns}>
                    <TextInput
                      accessibilityLabel="Teléfono"
                      style={[
                        styles.input,
                        formLocked && styles.lockedInput,
                      ]}
                      value={phone}
                      onChangeText={setPhone}
                      editable={!formLocked}
                      keyboardType="phone-pad"
                      placeholder="+56 9 1234 5678"
                      placeholderTextColor={COLORS.muted}
                    />
                  </Field>
                </View>
              </FormSection>

              <FormSection
                title="Workspaces"
                description="Elige dónde estará disponible este contacto."
                icon="briefcase"
              >
                <View style={styles.workspaceGrid}>
                  {tenants.map((tenant) => {
                    const selected = selectedTenants.includes(
                      tenant.id
                    );

                    return (
                      <Pressable
                        key={tenant.id}
                        disabled={formLocked}
                        accessibilityRole="checkbox"
                        accessibilityState={{
                          checked: selected,
                          disabled: formLocked,
                        }}
                        onPress={() => toggleTenant(tenant.id)}
                        style={[
                          styles.workspaceOption,
                          twoColumns && styles.workspaceOptionWide,
                          selected && styles.workspaceOptionActive,
                          formLocked && styles.disabled,
                        ]}
                      >
                        <View
                          style={[
                            styles.workspaceIcon,
                            selected && styles.workspaceIconActive,
                          ]}
                        >
                          <Feather
                            name="briefcase"
                            size={17}
                            color={
                              selected
                                ? COLORS.primary
                                : COLORS.muted
                            }
                          />
                        </View>

                        <Text
                          numberOfLines={1}
                          style={[
                            styles.workspaceName,
                            selected && styles.workspaceNameActive,
                          ]}
                        >
                          {tenant.name}
                        </Text>

                        <View
                          style={[
                            styles.checkbox,
                            selected && styles.checkboxActive,
                          ]}
                        >
                          {selected && (
                            <Feather
                              name="check"
                              size={12}
                              color="#fff"
                            />
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.infoRow}>
                  <Feather
                    name="info"
                    size={15}
                    color={COLORS.muted}
                  />
                  <Text style={styles.infoText}>
                    Cada workspace tendrá una copia independiente,
                    con sus propios permisos.
                  </Text>
                </View>
              </FormSection>

              <FormSection
                title="Privacidad y acceso"
                description={
                  isAdmin
                    ? "Define quién podrá consultar el contacto en cada workspace."
                    : "El contacto se compartirá con el workspace."
                }
                icon="shield"
              >
                {isAdmin ? (
                  <View style={styles.visibilitySections}>
                    {selectedTenants.length === 0 && (
                      <Text style={styles.description}>
                        Selecciona un workspace para definir la
                        visibilidad.
                      </Text>
                    )}

                    {selectedTenants.map((tenantId) => {
                      const tenantName =
                        tenants.find(
                          (tenant) => tenant.id === tenantId
                        )?.name || tenantId;

                      return (
                        <ContactVisibilitySelector
                          key={tenantId}
                          tenantId={tenantId}
                          theme="light"
                          title={`Visibilidad · ${tenantName}`}
                          value={
                            sharing[tenantId] || {
                              visibility: null,
                              shared_user_ids: [],
                            }
                          }
                          onChange={(selection) =>
                            setSharing((previous) => ({
                              ...previous,
                              [tenantId]: selection,
                            }))
                          }
                          disabled={formLocked}
                        />
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.infoBox}>
                    <Text style={styles.description}>
                      El contacto será visible para los integrantes
                      de cada workspace seleccionado.
                    </Text>
                  </View>
                )}
              </FormSection>

              <FormSection
                title="Nota inicial"
                description="Añade contexto para el seguimiento del contacto."
                icon="file-text"
              >
                <TextInput
                  accessibilityLabel="Nota inicial"
                  style={[
                    styles.input,
                    styles.noteInput,
                    formLocked && styles.lockedInput,
                  ]}
                  value={notes}
                  onChangeText={setNotes}
                  editable={!formLocked}
                  placeholder="Ej: Conversamos sobre un próximo proyecto…"
                  placeholderTextColor={COLORS.muted}
                  multiline
                />

                <Text style={styles.fieldHint}>
                  La nota respetará los permisos del contacto.
                </Text>
              </FormSection>

              {saveStarted && (
                <View style={styles.progressBox}>
                  <Feather
                    name="save"
                    size={19}
                    color={COLORS.primary}
                  />

                  <View style={styles.progressText}>
                    <Text style={styles.progressTitle}>
                      {savedCount} de {selectedTenants.length} copias
                      confirmadas
                    </Text>

                    <Text style={styles.description}>
                      Los datos quedan bloqueados durante este guardado.
                      Si ocurre un fallo, puedes reintentar los pasos
                      pendientes sin repetir las copias confirmadas.
                    </Text>
                  </View>
                </View>
              )}

              {!!error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorTitle}>
                    No se pudo completar el guardado
                  </Text>

                  <Text style={styles.errorText}>{error}</Text>

                  {saveStarted && (
                    <Text style={styles.errorText}>
                      Los cambios ya confirmados se conservaron.
                      Una nota cuyo envío no se confirmó podría haberse
                      guardado; compruébala antes de reintentar.
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.footer}>
                <View style={styles.footerText}>
                  <Text style={styles.footerTitle}>
                    {selectedTenants.length === 1
                      ? "1 workspace seleccionado"
                      : `${selectedTenants.length} workspaces seleccionados`}
                  </Text>

                  <Text style={styles.fieldHint}>
                    Revisa los datos y la visibilidad antes de guardar.
                  </Text>
                </View>

                <View style={styles.footerActions}>
                  <Pressable
                    style={[
                      styles.secondaryButton,
                      mutation.isPending && styles.disabled,
                    ]}
                    disabled={mutation.isPending}
                    onPress={goBack}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {saveStarted ? "Volver" : "Cancelar"}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.primaryButton,
                      mutation.isPending && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    onPress={handleSave}
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Feather name="check" size={17} color="#fff" />
                    )}

                    <Text style={styles.primaryButtonText}>
                      {mutation.isPending
                        ? "Guardando…"
                        : saveStarted
                          ? "Reintentar pendientes"
                          : "Guardar contacto"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: 28,
    paddingBottom: 40,
  },
  scrollContentCompact: {
    padding: 16,
    paddingBottom: 30,
  },
  formContainer: {
    width: "100%",
    maxWidth: 1080,
    alignSelf: "center",
    gap: 20,
  },

  breadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  breadcrumbLink: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "500",
  },
  breadcrumbCurrent: {
    color: COLORS.muted,
    fontSize: 12,
  },
  pageHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 4,
  },
  pageHeadingText: {
    flex: 1,
    minWidth: 200,
    gap: 6,
  },
  pageTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
  pageDescription: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 21,
  },
  newBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  newBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#a4aabc",
  },
  newBadgeText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "500",
  },

  section: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeadingText: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  sectionDescription: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 19,
  },
  sectionBody: {
    padding: 20,
    gap: 15,
  },

  fields: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 20,
  },
  fieldGroup: {
    width: "100%",
    gap: 8,
  },
  halfField: {
    width: "48.5%",
  },
  label: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600",
  },
  required: {
    color: COLORS.primary,
  },
  input: {
    minHeight: 43,
    borderWidth: 1,
    borderColor: "#dfe3ec",
    backgroundColor: COLORS.field,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 13,
  },
  lockedInput: {
    backgroundColor: "#f1f2f6",
    color: COLORS.muted,
  },
  noteInput: {
    minHeight: 115,
    textAlignVertical: "top",
    lineHeight: 21,
  },
  fieldHint: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 18,
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    minHeight: 35,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  typeChipActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: "#cfbfea",
  },
  typeChipText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  typeChipTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },

  workspaceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  workspaceOption: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    backgroundColor: COLORS.surface,
  },
  workspaceOptionWide: {
    width: "48.5%",
  },
  workspaceOptionActive: {
    borderColor: "#c9b8e9",
    backgroundColor: "#faf8ff",
  },
  workspaceIcon: {
    width: 33,
    height: 33,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceIconActive: {
    backgroundColor: COLORS.primarySoft,
  },
  workspaceName: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "500",
  },
  workspaceNameActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  checkbox: {
    width: 17,
    height: 17,
    borderWidth: 1,
    borderColor: "#cdd2df",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  checkboxActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingTop: 4,
  },
  infoText: {
    flex: 1,
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 19,
  },
  infoBox: {
    padding: 14,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  visibilitySections: {
    gap: 16,
  },
  description: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 20,
  },

  loadingBox: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 60,
    alignItems: "center",
    gap: 14,
  },
  progressBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 18,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 10,
  },
  progressText: {
    flex: 1,
    gap: 5,
  },
  progressTitle: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  errorBox: {
    backgroundColor: COLORS.errorBackground,
    borderWidth: 1,
    borderColor: "#f2d2d9",
    borderRadius: 10,
    padding: 16,
    gap: 9,
  },
  errorTitle: {
    color: COLORS.error,
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    lineHeight: 20,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
    paddingVertical: 8,
  },
  footerText: {
    gap: 4,
    flexShrink: 1,
  },
  footerTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600",
  },
  footerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  primaryButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  secondaryButton: {
    alignSelf: "flex-start",
    minHeight: 42,
    paddingHorizontal: 18,
    paddingVertical: 11,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "500",
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.85,
  },
});