// src/components/ContactVisibilitySelector.tsx
import {
    authFetch,
    getAuthStorageScope,
} from "@/src/api/auth";
import type {
    ContactVisibility,
    SharingSelection,
} from "@/src/api/contacts";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
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
  theme?: "light" | "dark";
};

type Identity = {
  storageKey: string;
  userId: string;
};

const OPTIONS: Array<{
  value: ContactVisibility;
  title: string;
  description: string;
  icon: "lock" | "users" | "user-check";
}> = [
  {
    value: "private",
    title: "Solo yo",
    description: "Únicamente tú podrás ver este contacto.",
    icon: "lock",
  },
  {
    value: "workspace",
    title: "Todo el workspace",
    description: "Visible para todos sus integrantes.",
    icon: "users",
  },
  {
    value: "selected",
    title: "Usuarios seleccionados",
    description: "Tú y las personas que elijas.",
    icon: "user-check",
  },
];

const PALETTES = {
  light: {
    surface: "#ffffff",
    field: "#fbfcfe",
    text: "#202536",
    muted: "#737b8e",
    border: "#e7e9f0",
    primary: "#7551c8",
    selected: "#f5f0fd",
    selectedBorder: "#c9b8e9",
    iconBackground: "#f0ebfb",
    error: "#ae354b",
    errorBackground: "#fff2f4",
    hintBackground: "#f7f8fb",
  },
  dark: {
    surface: "#171923",
    field: "#121318",
    text: "#f3f4f6",
    muted: "#a4adbd",
    border: "#343b4c",
    primary: "#c4b5fd",
    selected: "#28203d",
    selectedBorder: "#a78bfa",
    iconBackground: "#30234f",
    error: "#fecaca",
    errorBackground: "#35202a",
    hintBackground: "#20232e",
  },
};

function memberInitials(member: Member) {
  return (member.name || member.email || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

export default function ContactVisibilitySelector({
  tenantId,
  value,
  onChange,
  disabled = false,
  title = "¿Quién puede ver este contacto?",
  theme = "dark",
}: Props) {
  const colors = PALETTES[theme];
  const styles = useMemo(() => createStyles(theme), [theme]);

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
        if (!cancelled) setSessionLoading(false);
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
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.muted}>Comprobando sesión…</Text>
        </View>
      )}

      {!!sessionError && (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{sessionError}</Text>
        </View>
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
              style={({ pressed }) => [
                styles.option,
                checked && styles.optionActive,
                controlsDisabled && styles.disabled,
                pressed && !controlsDisabled && styles.pressed,
              ]}
            >
              <View style={styles.optionIcon}>
                <Feather
                  name={option.icon}
                  size={18}
                  color={colors.primary}
                />
              </View>

              <View style={styles.grow}>
                <Text
                  style={[
                    styles.label,
                    checked && styles.activeLabel,
                  ]}
                >
                  {option.title}
                </Text>

                <Text style={styles.muted}>
                  {option.description}
                </Text>
              </View>

              <View
                style={[
                  styles.radio,
                  checked && styles.radioActive,
                ]}
              >
                {checked && <View style={styles.radioDot} />}
              </View>
            </Pressable>
          );
        })}
      </View>

      {value.visibility === "selected" && (
        <View style={styles.people}>
          <View style={styles.peopleHeading}>
            <Text style={styles.label}>Compartir con</Text>

            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {value.shared_user_ids.length} seleccionados
              </Text>
            </View>
          </View>

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
                    <Text style={styles.chipText}>{label}</Text>
                    <Feather
                      name="x"
                      size={13}
                      color={colors.primary}
                    />
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.searchBox}>
            <Feather
              name="search"
              size={16}
              color={colors.muted}
            />

            <TextInput
              editable={!controlsDisabled}
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar por nombre o correo"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Buscar integrantes del workspace"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />

            {!!search && (
              <Pressable
                accessibilityLabel="Limpiar búsqueda"
                disabled={controlsDisabled}
                onPress={() => setSearch("")}
                hitSlop={8}
              >
                <Feather name="x" size={16} color={colors.muted} />
              </Pressable>
            )}
          </View>

          {identity && membersQuery.isLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator
                size="small"
                color={colors.primary}
              />
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
                <Feather
                  name="refresh-cw"
                  size={13}
                  color={colors.primary}
                />
                <Text style={styles.retryText}>Reintentar</Text>
              </Pressable>
            </View>
          )}

          {membersQuery.isSuccess &&
            filteredMembers.length > 0 && (
              <ScrollView
                style={styles.memberList}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {filteredMembers.map((member) => {
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
                        checked && styles.memberActive,
                        controlsDisabled && styles.disabled,
                      ]}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {memberInitials(member)}
                        </Text>
                      </View>

                      <View style={styles.grow}>
                        <Text style={styles.label}>
                          {member.name || member.email || "Usuario"}
                        </Text>

                        {!!member.email && (
                          <Text style={styles.muted}>
                            {member.email}
                          </Text>
                        )}
                      </View>

                      <View
                        style={[
                          styles.checkbox,
                          checked && styles.checkboxActive,
                        ]}
                      >
                        {checked && (
                          <Feather
                            name="check"
                            size={12}
                            color={theme === "light" ? "#fff" : "#171923"}
                          />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

          {membersQuery.isSuccess &&
            filteredMembers.length === 0 && (
              <View style={styles.emptyBox}>
                <Feather
                  name="users"
                  size={22}
                  color={colors.muted}
                />
                <Text style={styles.emptyText}>
                  {search.trim()
                    ? "No hay integrantes que coincidan con la búsqueda."
                    : "No hay otros integrantes disponibles en este workspace."}
                </Text>
              </View>
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

      <View style={styles.hintBox}>
        <Feather
          name="info"
          size={15}
          color={colors.muted}
        />
        <Text style={styles.hint}>
          Las notas respetan el acceso al contacto. Las actividades
          requieren además ser su creador, estar asignado o contar
          con los permisos de administración correspondientes.
        </Text>
      </View>
    </View>
  );
}

function createStyles(theme: "light" | "dark") {
  const colors = PALETTES[theme];

  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 16,
      gap: 14,
    },
    heading: {
      color: colors.text,
      fontWeight: "600",
      fontSize: 13,
    },
    options: {
      gap: 9,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 72,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 9,
      padding: 13,
      backgroundColor: colors.field,
    },
    optionActive: {
      borderColor: colors.selectedBorder,
      backgroundColor: colors.selected,
    },
    optionIcon: {
      width: 36,
      height: 36,
      borderRadius: 9,
      backgroundColor: colors.iconBackground,
      alignItems: "center",
      justifyContent: "center",
    },
    grow: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    label: {
      color: colors.text,
      fontWeight: "600",
      fontSize: 12,
      lineHeight: 18,
    },
    activeLabel: {
      color: colors.primary,
    },
    muted: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 19,
    },
    radio: {
      height: 17,
      width: 17,
      borderWidth: 1,
      borderColor: colors.muted,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    radioActive: {
      borderColor: colors.primary,
    },
    radioDot: {
      height: 9,
      width: 9,
      borderRadius: 5,
      backgroundColor: colors.primary,
    },
    people: {
      gap: 12,
      paddingTop: 6,
    },
    peopleHeading: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 8,
    },
    countBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: colors.iconBackground,
    },
    countText: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: "600",
    },
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
    },
    chip: {
      maxWidth: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      backgroundColor: colors.iconBackground,
      borderRadius: 7,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    chipText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "600",
      flexShrink: 1,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingHorizontal: 12,
      minHeight: 42,
      backgroundColor: colors.field,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      paddingVertical: 11,
      fontSize: 12,
    },
    memberList: {
      maxHeight: 280,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
    },
    member: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    memberActive: {
      backgroundColor: colors.selected,
    },
    avatar: {
      width: 33,
      height: 33,
      borderRadius: 9,
      backgroundColor: colors.iconBackground,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: "700",
    },
    checkbox: {
      height: 17,
      width: 17,
      borderWidth: 1,
      borderColor: colors.muted,
      borderRadius: 4,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 6,
    },
    hintBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      padding: 12,
      borderRadius: 8,
      backgroundColor: colors.hintBackground,
    },
    hint: {
      flex: 1,
      color: colors.muted,
      fontSize: 11,
      lineHeight: 19,
    },
    errorBox: {
      backgroundColor: colors.errorBackground,
      padding: 12,
      borderRadius: 8,
      gap: 8,
    },
    error: {
      color: colors.error,
      fontSize: 12,
      lineHeight: 19,
    },
    retryButton: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 7,
      backgroundColor: colors.iconBackground,
    },
    retryText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "600",
    },
    emptyBox: {
      alignItems: "center",
      padding: 20,
      gap: 10,
    },
    emptyText: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 19,
      textAlign: "center",
    },
    disabled: {
      opacity: 0.65,
    },
    pressed: {
      opacity: 0.85,
    },
  });
}