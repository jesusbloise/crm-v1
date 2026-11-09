// app/more/admin-users.tsx
import { api } from "@/src/api/http";
import { Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Role = "owner" | "admin" | "member";

type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  created_at: number;
  updated_at: number;
  workspaces_created: number;
};

type Confirmation = {
  title: string;
  message: string;
  userId: string;
} & (
  | { type: "toggle-active" }
  | { type: "change-global-role"; newRole: Role }
);

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Administrador",
  member: "Miembro",
};

function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación.";
}

function formatDate(value: number | string) {
  const timestamp = Number(value);
  const date = new Date(timestamp);

  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) {
    return "No disponible";
  }

  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AdminUsers() {
  const [roleNow, setRoleNow] = useState<Role | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] =
    useState<string | null>(null);
  const [confirmation, setConfirmation] =
    useState<Confirmation | null>(null);
  const [reload, setReload] = useState(0);

  const actionLock = useRef(false);
  const hasAccess = roleNow === "owner" || roleNow === "admin";

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        setCheckingRole(true);
        setLoading(false);
        setError(null);
        setRoleNow(null);
        setUsers([]);
        setConfirmation(null);

        try {
          const response = await api.get<{
            tenant_id: string | null;
            role: string | null;
          }>(`/tenants/role?_=${Date.now()}`);

          if (cancelled) return;

          const value = response.role?.toLowerCase();
          const role: Role | null =
            value === "owner" ||
            value === "admin" ||
            value === "member"
              ? value
              : null;

          setRoleNow(role);
          setCheckingRole(false);

          if (role !== "owner" && role !== "admin") return;

          setLoading(true);

          const result = await api.get<{ users: User[] }>(
            "/admin/users"
          );

          if (cancelled) return;

          setUsers(result.users ?? []);
        } catch (error: unknown) {
          if (!cancelled) setError(messageOf(error));
        } finally {
          if (!cancelled) {
            setCheckingRole(false);
            setLoading(false);
          }
        }
      }

      void load();

      return () => {
        cancelled = true;
      };
    }, [reload])
  );

  function requestToggle(user: User) {
    if (!hasAccess || actionLock.current) return;

    setConfirmation({
      type: "toggle-active",
      userId: user.id,
      title: user.active ? "Desactivar usuario" : "Activar usuario",
      message: user.active
        ? `¿Quieres desactivar a ${user.name || user.email}? No podrá iniciar sesión.`
        : `¿Quieres activar a ${user.name || user.email}?`,
    });
  }

  function requestRoleChange(user: User) {
    if (
      roleNow !== "owner" ||
      user.role === "owner" ||
      actionLock.current
    ) {
      return;
    }

    const newRole: Role =
      user.role === "member" ? "admin" : "member";

    setConfirmation({
      type: "change-global-role",
      userId: user.id,
      newRole,
      title: "Cambiar rol global",
      message:
        newRole === "admin"
          ? `¿Asignar el rol Administrador a ${user.name || user.email}? Este cambio afecta sus permisos globales en el CRM.`
          : `¿Asignar el rol Miembro a ${user.name || user.email}? Perderá los permisos globales de administrador.`,
    });
  }

  async function executeAction() {
    if (!confirmation || actionLock.current || !hasAccess) return;

    const action = confirmation;

    if (
      action.type === "change-global-role" &&
      roleNow !== "owner"
    ) {
      return;
    }

    actionLock.current = true;
    setUpdatingUserId(action.userId);
    setConfirmation(null);
    setError(null);
    setNotice(null);

    try {
      const userId = encodeURIComponent(action.userId);

      if (action.type === "toggle-active") {
        await api.post(`/admin/users/${userId}/toggle-active`, {});
        setNotice("Estado del usuario actualizado.");
      } else {
        await api.post(`/admin/users/${userId}/change-role`, {
          newRole: action.newRole,
        });

        setNotice(
          `Rol actualizado a ${ROLE_LABELS[action.newRole]}.`
        );
      }

      // Volver a verificar permisos y cargar los datos guardados.
      setReload((value) => value + 1);
    } catch (error: unknown) {
      setError(messageOf(error));
    } finally {
      actionLock.current = false;
      setUpdatingUserId(null);
    }
  }

  const busy = updatingUserId !== null;

  return (
    <View style={s.screen}>
      <Stack.Screen
        options={{
          title: "Administrador",
          headerStyle: { backgroundColor: "#ffffff" },
          headerTintColor: "#202536",
        }}
      />

      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.header}>
          <View style={s.heading}>
            <Text style={s.eyebrow}>ADMINISTRACIÓN</Text>
            <Text style={s.title}>Usuarios registrados</Text>
            <Text style={s.subtitle}>
              Gestiona el acceso y los roles globales del CRM.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={checkingRole || loading || busy}
            onPress={() => setReload((value) => value + 1)}
            style={[
              s.button,
              (checkingRole || loading || busy) && s.disabled,
            ]}
          >
            <Text style={s.buttonText}>Actualizar</Text>
          </Pressable>
        </View>

        {!!notice && (
          <View style={s.successBox}>
            <Text accessibilityRole="alert" style={s.successText}>
              {notice}
            </Text>
          </View>
        )}

        {!!error && (
          <View style={s.errorBox}>
            <Text accessibilityRole="alert" style={s.errorText}>
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={checkingRole || loading || busy}
              onPress={() => setReload((value) => value + 1)}
              style={s.button}
            >
              <Text style={s.buttonText}>Reintentar carga</Text>
            </Pressable>
          </View>
        )}

        {checkingRole || loading ? (
          <View style={s.feedback}>
            <ActivityIndicator color="#7551c8" />
            <Text style={s.subtitle}>
              {checkingRole
                ? "Verificando permisos…"
                : "Cargando usuarios…"}
            </Text>
          </View>
        ) : !hasAccess ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Acceso restringido</Text>
            <Text style={s.subtitle}>
              {error
                ? "No pudimos verificar tu acceso."
                : "No tienes permisos para acceder al panel de administración."}
            </Text>
            <View style={s.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.back()}
                style={s.button}
              >
                <Text style={s.buttonText}>Volver</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <Text style={s.count}>
              {users.length} usuario{users.length === 1 ? "" : "s"}
              {" "}en total
            </Text>

            {!error && users.length === 0 && (
              <View style={s.card}>
                <Text style={s.subtitle}>
                  No hay usuarios para mostrar.
                </Text>
              </View>
            )}

            {users.map((user) => (
              <View key={user.id} style={s.card}>
                <View style={s.userHeader}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>
                      {(
                        user.name?.trim().charAt(0) ||
                        user.email?.charAt(0) ||
                        "?"
                      ).toUpperCase()}
                    </Text>
                  </View>

                  <View style={s.userInfo}>
                    <View style={s.nameRow}>
                      <Text style={s.userName}>
                        {user.name || "Sin nombre"}
                      </Text>

                      <View
                        style={[
                          s.badge,
                          user.active
                            ? s.activeBadge
                            : s.inactiveBadge,
                        ]}
                      >
                        <Text
                          style={[
                            s.badgeText,
                            user.active
                              ? s.activeText
                              : s.inactiveText,
                          ]}
                        >
                          {user.active ? "Activo" : "Inactivo"}
                        </Text>
                      </View>
                    </View>

                    <Text selectable style={s.subtitle}>
                      {user.email}
                    </Text>
                    <Text style={s.small}>
                      Registro: {formatDate(user.created_at)}
                    </Text>
                  </View>
                </View>

                <View style={s.roleRow}>
                  <Text style={s.label}>Rol global</Text>
                  <View style={[s.badge, s.roleBadge]}>
                    <Text style={s.roleText}>
                      {ROLE_LABELS[user.role] || user.role}
                    </Text>
                  </View>

                  {roleNow === "owner" && user.role !== "owner" && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Cambiar rol de ${user.name || user.email}`}
                      disabled={busy}
                      onPress={() => requestRoleChange(user)}
                      style={[s.button, busy && s.disabled]}
                    >
                      <Text style={s.buttonText}>Cambiar rol</Text>
                    </Pressable>
                  )}
                </View>

                <View style={s.footer}>
                  <Text style={s.small}>
                    Workspaces creados: {user.workspaces_created ?? 0}
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${user.active ? "Desactivar" : "Activar"} a ${user.name || user.email}`}
                    disabled={busy}
                    onPress={() => requestToggle(user)}
                    style={[
                      s.button,
                      user.active ? s.dangerButton : s.successButton,
                      busy && s.disabled,
                    ]}
                  >
                    <Text
                      style={[
                        s.buttonText,
                        user.active
                          ? s.inactiveText
                          : s.activeText,
                      ]}
                    >
                      {updatingUserId === user.id
                        ? "Procesando…"
                        : user.active
                        ? "Desactivar"
                        : "Activar"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal
        visible={confirmation !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmation(null)}
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>{confirmation?.title}</Text>
            <Text style={s.subtitle}>{confirmation?.message}</Text>

            <View style={s.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmation(null)}
                style={[s.button, s.modalButton]}
              >
                <Text style={s.buttonText}>Cancelar</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void executeAction()}
                style={[
                  s.button,
                  s.primary,
                  s.modalButton,
                  busy && s.disabled,
                ]}
              >
                <Text style={s.primaryText}>Confirmar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f6fa" },
  content: {
    width: "100%",
    maxWidth: 1100,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 48,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 6,
  },
  heading: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 230,
    minWidth: 0,
    gap: 7,
  },
  eyebrow: {
    color: "#8a819e",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  title: { color: "#202536", fontSize: 25, fontWeight: "700" },
  subtitle: { color: "#737b8e", fontSize: 12, lineHeight: 20 },
  small: { color: "#8991a2", fontSize: 11, lineHeight: 18 },
  count: { color: "#737b8e", fontSize: 12, marginBottom: 2 },
  card: {
    minWidth: 0,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e9f0",
    borderRadius: 14,
    padding: 20,
    gap: 16,
  },
  cardTitle: { color: "#202536", fontSize: 16, fontWeight: "700" },
  userHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#eee8f9",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: { color: "#7551c8", fontSize: 19, fontWeight: "700" },
  userInfo: { flex: 1, minWidth: 0, gap: 4 },
  nameRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  userName: {
    color: "#202536",
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
    flexShrink: 1,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgeText: { fontSize: 10, fontWeight: "600" },
  activeBadge: { backgroundColor: "#edf8f1" },
  inactiveBadge: { backgroundColor: "#fff1f2" },
  activeText: { color: "#23744d" },
  inactiveText: { color: "#b42332" },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#eef0f5",
    paddingTop: 14,
    gap: 10,
  },
  label: { color: "#737b8e", fontSize: 11, fontWeight: "600" },
  roleBadge: { backgroundColor: "#f1ecfa", alignSelf: "auto" },
  roleText: { color: "#7551c8", fontSize: 11, fontWeight: "600" },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ded5ef",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#7551c8", fontSize: 12, fontWeight: "600" },
  dangerButton: {
    borderColor: "#f3d6db",
    backgroundColor: "#fff3f3",
  },
  successButton: {
    borderColor: "#cce8d7",
    backgroundColor: "#edf8f1",
  },
  primary: { backgroundColor: "#7551c8", borderColor: "#7551c8" },
  primaryText: { color: "#ffffff", fontSize: 12, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  feedback: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 12,
  },
  errorBox: {
    backgroundColor: "#fff3f3",
    borderColor: "#f3d6db",
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    gap: 12,
    alignItems: "flex-start",
  },
  errorText: { color: "#b42332", fontSize: 12, lineHeight: 20 },
  successBox: {
    backgroundColor: "#edf8f1",
    borderRadius: 10,
    padding: 14,
  },
  successText: { color: "#23744d", fontSize: 12, lineHeight: 20 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(32,37,54,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modal: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e9f0",
    borderRadius: 14,
    padding: 22,
    gap: 16,
  },
  modalTitle: { color: "#202536", fontSize: 18, fontWeight: "700" },
  modalActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  modalButton: { flexGrow: 1 },
});