// app/more/admin-users.tsx
import { Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../src/api/http";
import { COLORS, RADIUS } from "../../src/theme";

interface User {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "member";  // ⭐ Rol GLOBAL
  active: boolean;
  created_at: number;
  updated_at: number;
  workspaces_created: number;  // ⭐ Cantidad de workspaces creados
}

interface ConfirmDialog {
  visible: boolean;
  title: string;
  message: string;
  type: "toggle-active" | "change-global-role" | null;
  userId?: string;
  currentActive?: boolean;
  currentRole?: "owner" | "admin" | "member";
  newRole?: "owner" | "admin" | "member";
}

type RoleNow = "owner" | "admin" | "member" | null;

export default function AdminUsers() {
  // Acceso según rol actual en el tenant
  const [roleNow, setRoleNow] = useState<RoleNow>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [roleError, setRoleError] = useState<string | null>(null);

  // Datos
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Confirmaciones
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>({
    visible: false,
    title: "",
    message: "",
    type: null,
  });

  /** ------------------------------------------
   * Guardia de acceso por rol actual
   * ------------------------------------------ */
  const refreshRole = useCallback(async () => {
    setCheckingRole(true);
    setRoleError(null);
    try {
      // Debe existir endpoint que responda { tenant_id, role }
      const res = await api.get<{ tenant_id: string | null; role: string | null }>(
        "/tenants/role?_=" + Date.now()
      );
      const r = (res?.role || "").toLowerCase() as RoleNow;
      if (r === "owner" || r === "admin" || r === "member") {
        setRoleNow(r);
      } else {
        setRoleNow(null);
      }
    } catch (e: any) {
      setRoleError(e?.message || "No se pudo verificar tu rol actual.");
      setRoleNow(null);
    } finally {
      setCheckingRole(false);
    }
  }, []);

  const hasAccess = useMemo(() => roleNow === "owner" || roleNow === "admin", [roleNow]);

  /** ------------------------------------------
   * Cargar usuarios
   * ------------------------------------------ */
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<{ users: User[] }>("/admin/users");
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err?.message || "Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  /** ------------------------------------------
   * Ciclo de vida / foco
   * ------------------------------------------ */
  useEffect(() => {
    refreshRole();
  }, [refreshRole]);

  useFocusEffect(
    useCallback(() => {
      // Al entrar en foco, revalida rol y recarga usuarios si corresponde
      (async () => {
        await refreshRole();
        // Si tiene acceso, carga usuarios
        // (si no, veremos la pantalla 403)
        // Evita doble carga si refreshRole está lento:
        setTimeout(() => {
          if (hasAccess) loadUsers();
        }, 0);
      })();
    }, [refreshRole, loadUsers, hasAccess])
  );

  /** ------------------------------------------
   * Acciones
   * ------------------------------------------ */
  const handleToggleActive = (userId: string, currentActive: boolean) => {
    setConfirmDialog({
      visible: true,
      title: currentActive ? "Desactivar usuario" : "Activar usuario",
      message: currentActive
        ? "¿Estás seguro de desactivar este usuario? No podrá iniciar sesión."
        : "¿Estás seguro de activar este usuario?",
      type: "toggle-active",
      userId,
      currentActive,
    });
  };

  const executeToggleActive = async () => {
    if (!confirmDialog.userId) return;
    setConfirmDialog((d) => ({ ...d, visible: false }));

    try {
      setUpdatingUserId(confirmDialog.userId);
      await api.post(`/admin/users/${confirmDialog.userId}/toggle-active`, {});
      await loadUsers();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "No se pudo cambiar el estado del usuario");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleChangeGlobalRole = (userId: string, currentRole: "owner" | "admin" | "member") => {
    // Mostrar modal con opciones de rol
    let newRole: "owner" | "admin" | "member";
    let message: string;
    
    if (currentRole === "member") {
      newRole = "admin";
      message = "¿Promover este usuario a Admin? Podrá crear workspaces y ver todos los datos.";
    } else if (currentRole === "admin") {
      newRole = "member";
      message = "¿Degradar este usuario a Member? Solo podrá ver sus propios datos.";
    } else {
      // owner - no debería llegar aquí
      return;
    }
    
    setConfirmDialog({
      visible: true,
      title: "Cambiar Rol Global",
      message,
      type: "change-global-role",
      userId,
      currentRole,
      newRole,
    });
  };

 const executeChangeGlobalRole = async () => {
  if (!confirmDialog.userId || !confirmDialog.newRole) return;

  setConfirmDialog((d) => ({ ...d, visible: false }));

  try {
    setUpdatingUserId(confirmDialog.userId);

    // 👇 Coincide con tu backend: POST + /change-role + body.newRole
    await api.post(`/admin/users/${confirmDialog.userId}/change-role`, {
      newRole: confirmDialog.newRole,
    });

    Alert.alert(
      "Éxito",
      `Usuario actualizado a ${
        confirmDialog.newRole === "admin" ? "Admin 🔑" :
        confirmDialog.newRole === "owner" ? "Owner 👑" :
        "Member 👤"
      }`
    );

    await loadUsers();
  } catch (err: any) {
    console.error("❌ Error cambiando rol global:", err);
    Alert.alert("Error", err?.message || "No se pudo cambiar el rol");
  } finally {
    setUpdatingUserId(null);
  }
};


  const handleConfirm = () => {
    if (confirmDialog.type === "toggle-active") executeToggleActive();
    if (confirmDialog.type === "change-global-role") executeChangeGlobalRole();
  };

  const handleCancel = () => {
    setConfirmDialog({ visible: false, title: "", message: "", type: null });
  };

  /** ------------------------------------------
   * Helpers UI
   * ------------------------------------------ */
  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "owner":
        return { bg: COLORS.tints.primary, text: COLORS.primary };
      case "admin":
        return { bg: COLORS.tints.primary, text: COLORS.primary };
      default:
        return { bg: COLORS.tints.neutral, text: COLORS.sub };
    }
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  /** ------------------------------------------
   * Render
   * ------------------------------------------ */

  // Verificando permisos
  if (checkingRole) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: "Administrador",
            headerStyle: { backgroundColor: COLORS.card },
            headerTintColor: COLORS.text,
          }}
        />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Verificando permisos…</Text>
        </View>
      </View>
    );
  }

  // Sin acceso
  if (!hasAccess) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: "Administrador",
            headerStyle: { backgroundColor: COLORS.card },
            headerTintColor: COLORS.text,
          }}
        />
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>
            {roleError
              ? roleError
              : "No tienes permisos para acceder al panel de administración."}
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={[styles.retryButton, { backgroundColor: COLORS.tints.neutral }]}
          >
            <Text style={[styles.retryButtonText, { color: COLORS.text }]}>Volver</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Cargando usuarios
  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: "Administrador",
            headerStyle: { backgroundColor: COLORS.card },
            headerTintColor: COLORS.text,
          }}
        />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando usuarios…</Text>
        </View>
      </View>
    );
  }

  // Error al cargar
  if (error) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: "Administrador",
            headerStyle: { backgroundColor: COLORS.card },
            headerTintColor: COLORS.text,
          }}
        />
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={loadUsers} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // OK
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Administrador",
          headerStyle: { backgroundColor: COLORS.card },
          headerTintColor: COLORS.text,
        }}
      />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Usuarios Registrados</Text>
        <Text style={styles.headerSubtitle}>
          {users.length} usuario{users.length !== 1 ? "s" : ""} en total
        </Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {users.map((user) => (
          <View key={user.id} style={styles.userCard}>
            <View style={styles.userHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user.name?.charAt(0)?.toUpperCase() ||
                    user.email?.charAt(0)?.toUpperCase() ||
                    "?"}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.userName}>{user.name || "Sin nombre"}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: user.active
                          ? COLORS.tints.success
                          : COLORS.tints.danger,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: user.active ? COLORS.success : COLORS.danger },
                      ]}
                    >
                      {user.active ? "Activo" : "Inactivo"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.userEmail}>{user.email}</Text>
                <Text style={styles.userDate}>Registro: {formatDate(user.created_at)}</Text>
              </View>
            </View>

            {/* Botones de acción global (activar/desactivar) */}
            <View style={styles.actionsContainer}>
              <Pressable
                onPress={() => handleToggleActive(user.id, user.active)}
                disabled={updatingUserId === user.id}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: user.active
                      ? COLORS.tints.danger
                      : COLORS.tints.success,
                  },
                  pressed && styles.actionButtonPressed,
                  updatingUserId === user.id && styles.actionButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    { color: user.active ? COLORS.danger : COLORS.success },
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

            {/* Rol global del usuario */}
            <View style={styles.roleContainer}>
              <Text style={styles.roleLabel}>Rol Global:</Text>
              <View
                style={[
                  styles.roleBadge,
                  { backgroundColor: getRoleBadgeColor(user.role).bg },
                ]}
              >
                <Text
                  style={[
                    styles.roleText,
                    { color: getRoleBadgeColor(user.role).text },
                  ]}
                >
                  {user.role === "owner"
                    ? "👑 Owner"
                    : user.role === "admin"
                    ? "🔑 Admin"
                    : "👤 Member"}
                </Text>
              </View>
              
              {/* Botón para cambiar rol */}
              {roleNow === "owner" && user.role !== "owner" && (
                <Pressable
                  onPress={() => handleChangeGlobalRole(user.id, user.role)}
                  disabled={updatingUserId === user.id}
                  style={({ pressed }) => [
                    styles.changeRoleButton,
                    pressed && styles.changeRoleButtonPressed,
                    updatingUserId === user.id && styles.actionButtonDisabled,
                  ]}
                >
                  <Text style={styles.changeRoleButtonText}>Cambiar Rol</Text>
                </Pressable>
              )}
            </View>

            {/* Info de workspaces creados */}
            <View style={styles.statsContainer}>
              <Text style={styles.statsText}>
                📁 Workspaces creados: {user.workspaces_created}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Modal de confirmación */}
      <Modal
        visible={confirmDialog.visible}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{confirmDialog.title}</Text>
            <Text style={styles.modalMessage}>{confirmDialog.message}</Text>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={handleCancel}
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.modalButtonCancel,
                  pressed && styles.modalButtonPressed,
                ]}
              >
                <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
              </Pressable>

              <Pressable
                onPress={handleConfirm}
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.modalButtonConfirm,
                  pressed && styles.modalButtonPressed,
                ]}
              >
                <Text style={styles.modalButtonTextConfirm}>
                  {confirmDialog.type === "toggle-active" ? "Confirmar" : "Cambiar"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.sub,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.danger,
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: RADIUS.sm,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
  },
  header: {
    backgroundColor: COLORS.card,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.sub,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  userCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.sm,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userHeader: {
    flexDirection: "row",
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "600",
  },
  userInfo: {
    flex: 1,
    justifyContent: "center",
  },
  userName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: COLORS.sub,
    marginBottom: 2,
  },
  userDate: {
    fontSize: 12,
    color: COLORS.muted,
  },
  workspacesContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  roleContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  roleLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.sub,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statsContainer: {
    paddingTop: 8,
  },
  statsText: {
    fontSize: 13,
    color: COLORS.sub,
  },
  workspacesTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.sub,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  workspaceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  workspaceName: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    marginRight: 8,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  roleText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  noWorkspaces: {
    fontSize: 14,
    color: COLORS.muted,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  actionsContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
    alignItems: "center",
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  changeRoleButton: {
    minWidth: 76,
    height: 32,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.tints.primary,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  changeRoleButtonPressed: {
    opacity: 0.7,
  },
  changeRoleButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 16,
    color: COLORS.sub,
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: RADIUS.sm,
    alignItems: "center",
  },
  modalButtonCancel: {
    backgroundColor: COLORS.tints.neutral,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtonConfirm: {
    backgroundColor: COLORS.primary,
  },
  modalButtonPressed: {
    opacity: 0.7,
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
  },
  modalButtonTextConfirm: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
  },
});
