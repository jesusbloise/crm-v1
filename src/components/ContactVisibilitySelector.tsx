// src/components/ContactVisibilitySelector.tsx
import {
    authFetch,
    getAuthStorageScope,
} from "@/src/api/auth";
import type {
    ContactVisibility,
    SharingSelection,
} from "@/src/api/contacts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

type Member = {
  id: string;
  name: string | null;
  email: string | null;
};

type Props = {
  tenantId: string;
  value: SharingSelection;
  onChange: (value: SharingSelection) => void;
  disabled?: boolean;
  title?: string;
};

type Identity = {
  storageKey: string;
  userId: string;
};

const OPTIONS: Array<{
  value: ContactVisibility;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    value: "private",
    title: "Solo yo",
    description: "Únicamente tú podrás ver este contacto.",
    icon: "🔒",
  },
  {
    value: "workspace",
    title: "Todo el workspace",
    description: "Visible para todos sus integrantes.",
    icon: "👥",
  },
  {
    value: "selected",
    title: "Usuarios seleccionados",
    description: "Tú y las personas que elijas.",
    icon: "✓",
  },
];

export default function ContactVisibilitySelector({
  tenantId,
  value,
  onChange,
  disabled = false,
  title = "¿Quién puede ver este contacto?",
}: Props) {
  const [search, setSearch] = useState("");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadIdentity() {
      setSessionLoading(true);
      setSessionError(null);
      setIdentity(null);
      setSearch("");

      try {
        const scope = await getAuthStorageScope();

        if (cancelled) return;

        if (!scope) {
          setSessionError(
            "No se pudo comprobar tu sesión. Reabre el formulario."
          );
          return;
        }

        setIdentity({
          storageKey: scope.storageKey,
          userId: scope.userId,
        });
      } catch {
        if (!cancelled) {
          setSessionError(
            "No se pudo comprobar tu sesión. Reabre el formulario."
          );
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }

    void loadIdentity();

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const membersQuery = useQuery<Member[]>({
    queryKey: [
      "contact-sharing-members",
      identity?.storageKey,
      tenantId,
    ],

    queryFn: async () => {
      const current = await getAuthStorageScope();

      if (
        !identity ||
        current?.storageKey !== identity.storageKey
      ) {
        throw new Error(
          "La sesión cambió. Reabre el formulario."
        );
      }

      const members = await authFetch<Member[]>(
        "/workspace/members",
        {
          method: "GET",
          headers: {
            "X-Tenant-Id": tenantId,
          },
        }
      );

      const after = await getAuthStorageScope();

      if (after?.storageKey !== identity.storageKey) {
        throw new Error(
          "La sesión cambió. Reabre el formulario."
        );
      }

      if (!Array.isArray(members)) {
        throw new Error(
          "El servidor no devolvió una lista válida de integrantes."
        );
      }

      return members.filter(
        (member) => member.id !== identity.userId
      );
    },

    enabled:
      Boolean(identity) &&
      Boolean(tenantId) &&
      value.visibility === "selected",

    staleTime: 0,
    retry: false,
  });

  const members = membersQuery.data ?? [];

  const selectedIds = useMemo(
    () => new Set(value.shared_user_ids),
    [value.shared_user_ids]
  );

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();

    if (!query) return members;

    return members.filter((member) => {
      const text = [
        member.name ?? "",
        member.email ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase();

      return text.includes(query);
    });
  }, [members, search]);

  const controlsDisabled =
    disabled ||
    sessionLoading ||
    Boolean(sessionError);

  function selectVisibility(visibility: ContactVisibility) {
    if (controlsDisabled) return;

    onChange({
      visibility,
      shared_user_ids:
        visibility === "selected"
          ? value.shared_user_ids
          : [],
    });
  }

  function toggleMember(userId: string) {
    if (controlsDisabled) return;

    const nextIds = selectedIds.has(userId)
      ? value.shared_user_ids.filter((id) => id !== userId)
      : [...value.shared_user_ids, userId];

    onChange({
      visibility: "selected",
      shared_user_ids: nextIds,
    });
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{title}</Text>

      {sessionLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#a78bfa" />
          <Text style={styles.muted}>
            Comprobando sesión…
          </Text>
        </View>
      )}

      {!!sessionError && (
        <Text style={styles.error}>
          {sessionError}
        </Text>
      )}

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={title}
        style={styles.options}
      >
        {OPTIONS.map((option) => {
          const checked = value.visibility === option.value;

          return (
            <Pressable
              key={option.value}
              disabled={controlsDisabled}
              accessibilityRole="radio"
              accessibilityLabel={option.title}
              accessibilityState={{
                checked,
                disabled: controlsDisabled,
              }}
              onPress={() => selectVisibility(option.value)}
              style={[
                styles.option,
                checked && styles.optionActive,
                controlsDisabled && styles.disabled,
              ]}
            >
              <Text style={styles.icon}>
                {option.icon}
              </Text>

              <View style={styles.grow}>
                <Text style={styles.label}>
                  {option.title}
                </Text>

                <Text style={styles.muted}>
                  {option.description}
                </Text>
              </View>

              <Text style={styles.radio}>
                {checked ? "◉" : "○"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {value.visibility === "selected" && (
        <View style={styles.people}>
          <Text style={styles.label}>
            Compartir con
          </Text>

          <Text style={styles.muted}>
            Tú conservarás el acceso. Selecciona a las demás
            personas del workspace.
          </Text>

          {value.shared_user_ids.length > 0 && (
            <View style={styles.chips}>
              {value.shared_user_ids.map((userId) => {
                const member = members.find(
                  (item) => item.id === userId
                );

                const label =
                  member?.name ||
                  member?.email ||
                  "Usuario seleccionado";

                return (
                  <Pressable
                    key={userId}
                    disabled={controlsDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${label}`}
                    onPress={() => toggleMember(userId)}
                    style={[
                      styles.chip,
                      controlsDisabled && styles.disabled,
                    ]}
                  >
                    <Text style={styles.chipText}>
                      {label} ×
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <TextInput
            editable={!controlsDisabled}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nombre o correo"
            placeholderTextColor="#a4adbd"
            accessibilityLabel="Buscar integrantes del workspace"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.search}
          />

          {identity && membersQuery.isLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#a78bfa" />
              <Text style={styles.muted}>
                Cargando integrantes…
              </Text>
            </View>
          )}

          {membersQuery.isError && (
            <View style={styles.errorBox}>
              <Text style={styles.error}>
                No se pudieron cargar los integrantes.
              </Text>

              <Pressable
                disabled={controlsDisabled}
                accessibilityRole="button"
                onPress={() => {
                  void membersQuery.refetch();
                }}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>
                  Reintentar
                </Text>
              </Pressable>
            </View>
          )}

          {membersQuery.isSuccess &&
            filteredMembers.map((member) => {
              const checked = selectedIds.has(member.id);

              return (
                <Pressable
                  key={member.id}
                  disabled={controlsDisabled}
                  accessibilityRole="checkbox"
                  accessibilityLabel={
                    member.name || member.email || member.id
                  }
                  accessibilityState={{
                    checked,
                    disabled: controlsDisabled,
                  }}
                  onPress={() => toggleMember(member.id)}
                  style={[
                    styles.member,
                    controlsDisabled && styles.disabled,
                  ]}
                >
                  <Text style={styles.radio}>
                    {checked ? "☑" : "☐"}
                  </Text>

                  <View style={styles.grow}>
                    <Text style={styles.label}>
                      {member.name ||
                        member.email ||
                        "Usuario"}
                    </Text>

                    {!!member.email && (
                      <Text style={styles.muted}>
                        {member.email}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}

          {membersQuery.isSuccess &&
            filteredMembers.length === 0 && (
              <Text style={styles.muted}>
                {search.trim()
                  ? "No hay integrantes que coincidan con la búsqueda."
                  : "No hay otros integrantes disponibles en este workspace."}
              </Text>
            )}

          {value.shared_user_ids.length === 0 && (
            <Text style={styles.muted}>
              Selecciona al menos una persona.
            </Text>
          )}
        </View>
      )}

      {!value.visibility && (
        <Text style={styles.muted}>
          Elige una opción antes de guardar.
        </Text>
      )}

      <Text style={styles.hint}>
        Las actividades y notas de este contacto tendrán
        la misma visibilidad.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#171923",
    borderWidth: 1,
    borderColor: "#2b3140",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginVertical: 8,
  },

  heading: {
    color: "#f3f4f6",
    fontWeight: "800",
    fontSize: 16,
  },

  options: {
    gap: 8,
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#343b4c",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#121318",
  },

  optionActive: {
    borderColor: "#a78bfa",
    backgroundColor: "rgba(124,58,237,0.16)",
  },

  disabled: {
    opacity: 0.65,
  },

  grow: {
    flex: 1,
  },

  label: {
    color: "#f3f4f6",
    fontWeight: "700",
    fontSize: 13,
  },

  muted: {
    color: "#a4adbd",
    fontSize: 12,
    lineHeight: 18,
  },

  icon: {
    fontSize: 19,
    color: "#c4b5fd",
  },

  radio: {
    fontSize: 20,
    color: "#c4b5fd",
  },

  people: {
    gap: 10,
  },

  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },

  chip: {
    backgroundColor: "#30234f",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  chipText: {
    color: "#e9ddff",
    fontSize: 12,
    fontWeight: "700",
  },

  search: {
    color: "#f3f4f6",
    backgroundColor: "#121318",
    borderWidth: 1,
    borderColor: "#343b4c",
    borderRadius: 10,
    padding: 12,
  },

  member: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#2b3140",
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },

  hint: {
    color: "#b8c2d6",
    fontSize: 12,
    lineHeight: 18,
  },

  errorBox: {
    gap: 6,
  },

  error: {
    color: "#fecaca",
    fontSize: 12,
    lineHeight: 18,
  },

  retryButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#30234f",
  },

  retryText: {
    color: "#c4b5fd",
    fontWeight: "700",
  },
});