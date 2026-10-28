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
import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import {
  useEffect,
  useRef,
  useState,
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
} from "react-native";

const PRIMARY = "#7C3AED";
const BG = "#0F1115";
const CARD = "#171923";
const FIELD = "#121318";
const BORDER = "#2B3140";
const TEXT = "#F3F4F6";
const SUBTLE = "#A4ADBD";

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

export default function NewContact() {
  const queryClient = useQueryClient();

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

  const [initialScopeKey, setInitialScopeKey] = useState<string | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [saveStarted, setSaveStarted] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  // Conserva los IDs y los pasos confirmados durante los reintentos.
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

        // Mantiene disponible el workspace activo aunque no aparezca
        // en la respuesta del listado.
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
        if (!cancelled) {
          setLoading(false);
        }
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
    if (!name.trim()) {
      return "El nombre es obligatorio.";
    }

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
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo guardar el contacto.";

      setError(message);
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

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: "Nuevo contacto",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: {
            color: TEXT,
            fontWeight: "800",
          },
        }}
      />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={PRIMARY} />
            <Text style={styles.subtle}>
              Preparando formulario…
            </Text>
          </View>
        ) : initialError ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{initialError}</Text>

            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => router.back()}
            >
              <Text style={styles.btnText}>Volver</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.label}>Nombre *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              editable={!formLocked}
              placeholder="Ej: Juan Pérez"
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
                      styles.chip,
                      selected && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected && styles.chipTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Empresa</Text>
            <TextInput
              style={styles.input}
              value={company}
              onChangeText={setCompany}
              editable={!formLocked}
              placeholder="Opcional"
              placeholderTextColor={SUBTLE}
            />

            <Text style={styles.label}>Cargo / Skill</Text>
            <TextInput
              style={styles.input}
              value={position}
              onChangeText={setPosition}
              editable={!formLocked}
              placeholder="Opcional"
              placeholderTextColor={SUBTLE}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              editable={!formLocked}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="usuario@dominio.com"
              placeholderTextColor={SUBTLE}
            />

            <Text style={styles.label}>Teléfono</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              editable={!formLocked}
              keyboardType="phone-pad"
              placeholder="+56 9 1234 5678"
              placeholderTextColor={SUBTLE}
            />

            <Text style={styles.label}>Workspaces</Text>
            <Text style={styles.subtle}>
              Selecciona dónde crear el contacto. Cada workspace
              tendrá una copia independiente con sus propios permisos.
            </Text>

            <View style={styles.chipRow}>
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
                      styles.chip,
                      selected && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected && styles.chipTextActive,
                      ]}
                    >
                      {tenant.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {isAdmin &&
              selectedTenants.map((tenantId) => {
                const tenantName =
                  tenants.find(
                    (tenant) => tenant.id === tenantId
                  )?.name || tenantId;

                return (
                  <ContactVisibilitySelector
                    key={tenantId}
                    tenantId={tenantId}
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

            {!isAdmin && (
              <View style={styles.infoBox}>
                <Text style={styles.subtle}>
                  El contacto será visible para los integrantes
                  de cada workspace seleccionado.
                </Text>
              </View>
            )}

            <Text style={styles.label}>Nota</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={notes}
              onChangeText={setNotes}
              editable={!formLocked}
              placeholder="Escribe una nota para este contacto…"
              placeholderTextColor={SUBTLE}
              multiline
            />

            {saveStarted && (
              <View style={styles.infoBox}>
                <Text style={styles.subtle}>
                  Copias confirmadas: {savedCount} de{" "}
                  {selectedTenants.length}.
                  {"\n"}
                  Los datos quedan bloqueados durante este guardado.
                  Si ocurre un fallo, puedes reintentar los pasos
                  pendientes sin repetir las copias confirmadas.
                </Text>
              </View>
            )}

            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.error}>{error}</Text>

                {saveStarted && (
                  <Text style={styles.error}>
                    Los cambios ya confirmados se conservaron.
                    Una nota cuyo envío no se confirmó podría haberse
                    guardado; compruébala antes de reintentar.
                  </Text>
                )}
              </View>
            )}

            <Pressable
              style={[
                styles.btn,
                styles.btnPrimary,
                mutation.isPending && styles.disabled,
              ]}
              onPress={handleSave}
              disabled={mutation.isPending}
            >
              <Text style={styles.btnText}>
                {mutation.isPending
                  ? "Guardando…"
                  : saveStarted
                  ? "Reintentar pendientes"
                  : "Guardar contacto"}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.btn,
                styles.btnGhost,
                mutation.isPending && styles.disabled,
              ]}
              disabled={mutation.isPending}
              onPress={() => router.back()}
            >
              <Text style={styles.btnText}>
                {saveStarted ? "Volver" : "Cancelar"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },

  container: {
    padding: 16,
    paddingBottom: 100,
    gap: 12,
  },

  label: {
    color: TEXT,
    fontWeight: "900",
    marginTop: 2,
  },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 12,
    padding: 12,
  },

  noteInput: {
    minHeight: 90,
    textAlignVertical: "top",
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },

  chipActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },

  chipText: {
    color: TEXT,
    fontWeight: "800",
    fontSize: 12,
  },

  chipTextActive: {
    color: "#ffffff",
  },

  subtle: {
    color: SUBTLE,
    fontSize: 13,
    lineHeight: 20,
  },

  loadingBox: {
    paddingVertical: 30,
    alignItems: "center",
    gap: 12,
  },

  infoBox: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
  },

  errorBox: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },

  error: {
    color: "#fecaca",
    lineHeight: 20,
  },

  btn: {
    marginTop: 6,
    padding: 13,
    borderRadius: 12,
    alignItems: "center",
  },

  btnText: {
    color: "#ffffff",
    fontWeight: "900",
  },

  btnPrimary: {
    backgroundColor: PRIMARY,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },

  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  disabled: {
    opacity: 0.6,
  },
});