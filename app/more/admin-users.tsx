// app/more/admin-users.tsx
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api/http";
import { COLORS, RADIUS } from "../../src/theme";

interface Workspace {
  tenant_id: string;
  tenant_name: string;
  role: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  active: boolean;
  created_at: number;
  updated_at: number;
  workspaces: Workspace[];
}

interface ConfirmDialog {
  visible: boolean;
  title: string;
  message: string;
  type: "toggle-active" | "change-role" | null;
  userId?: string;
  currentActive?: boolean;
  tenantId?: string;
  newRole?: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>({
    visible: false,
    title: "",
    message: "",
    type: null,
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<{ users: User[] }>("/admin/users");
      setUsers(data.users || []);
    } catch (err: any) {
      console.error("Error loading users:", err);
      setError(err.message || "Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    console.log("🔵 handleToggleActive llamado:", { userId, currentActive });
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
    
    console.log("🟢 Usuario confirmó toggle-active");
    setConfirmDialog({ ...confirmDialog, visible: false });
    
    try {
      setUpdatingUserId(confirmDialog.userId);
      console.log("📡 Enviando POST a /admin/users/" + confirmDialog.userId + "/toggle-active");
      const result = await api.post(`/admin/users/${confirmDialog.userId}/toggle-active`, {});
      console.log("✅ Respuesta recibida:", result);
      await loadUsers();
    } catch (err: any) {
      console.error("❌ Error en toggle-active:", err);
      Alert.alert("Error", err.message || "No se pudo cambiar el estado del usuario");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleChangeRole = async (userId: string, tenantId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "member" : "admin";
    console.log("🔵 handleChangeRole llamado:", { userId, tenantId, currentRole, newRole });
    
    setConfirmDialog({
      visible: true,
      title: "Cambiar rol",
      message: `¿Cambiar rol de ${currentRole === "admin" ? "Admin" : "Miembro"} a ${newRole === "admin" ? "Admin" : "Miembro"}?`,
      type: "change-role",
      userId,
      tenantId,
      newRole,
    });
  };

  const executeChangeRole = async () => {
    if (!confirmDialog.userId || !confirmDialog.tenantId || !confirmDialog.newRole) return;
    
    console.log("🟢 Usuario confirmó change-role");
    setConfirmDialog({ ...confirmDialog, visible: false });
    
    try {
      setUpdatingUserId(confirmDialog.userId);
      console.log("📡 Enviando POST a /admin/users/" + confirmDialog.userId + "/change-role");
      const result = await api.post(`/admin/users/${confirmDialog.userId}/change-role`, {
        tenantId: confirmDialog.tenantId,
        newRole: confirmDialog.newRole
      });
      console.log("✅ Respuesta recibida:", result);
      await loadUsers();
    } catch (err: any) {
      console.error("❌ Error en change-role:", err);
      Alert.alert("Error", err.message || "No se pudo cambiar el rol");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleConfirm = () => {
    if (confirmDialog.type === "toggle-active") {
      executeToggleActive();
    } else if (confirmDialog.type === "change-role") {
      executeChangeRole();
    }
  };

  const handleCancel = () => {
    console.log("❌ Usuario canceló la acción");
    setConfirmDialog({ visible: false, title: "", message: "", type: null });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return { bg: COLORS.tints.primary, text: COLORS.primary };
      default: // member
        return { bg: COLORS.tints.neutral, text: COLORS.sub };
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

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
          <Text style={styles.loadingText}>Cargando usuarios...</Text>
        </View>
      </View>
    );
  }

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
          <Text style={styles.errorText}>❌ {error}</Text>
          <Pressable onPress={loadUsers} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
        <Text style={styles.headerTitle}>👥 Usuarios Registrados</Text>
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
                  {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || "?"}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.userName}>{user.name || "Sin nombre"}</Text>
                  <View style={[
                    styles.statusBadge, 
                    { backgroundColor: user.active ? COLORS.tints.success : COLORS.tints.danger }
                  ]}>
                    <Text style={[
                      styles.statusText, 
                      { color: user.active ? COLORS.success : COLORS.danger }
                    ]}>
                      {user.active ? "Activo" : "Inactivo"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.userEmail}>{user.email}</Text>
                <Text style={styles.userDate}>
                  Registro: {formatDate(user.created_at)}
                </Text>
              </View>
            </View>

            {/* Botones de acción */}
            <View style={styles.actionsContainer}>
              <Pressable
                onPress={() => handleToggleActive(user.id, user.active)}
                disabled={updatingUserId === user.id}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: user.active ? COLORS.tints.danger : COLORS.tints.success },
                  pressed && styles.actionButtonPressed,
                  updatingUserId === user.id && styles.actionButtonDisabled
                ]}
              >
                <Text style={[
                  styles.actionButtonText,
                  { color: user.active ? COLORS.danger : COLORS.success }
                ]}>
                  {updatingUserId === user.id ? "..." : (user.active ? "🚫 Desactivar" : "✅ Activar")}
                </Text>
              </Pressable>
            </View>

            {user.workspaces.length > 0 && (
              <View style={styles.workspacesContainer}>
                <Text style={styles.workspacesTitle}>Workspaces:</Text>
                {user.workspaces.map((ws) => {
                  const colors = getRoleBadgeColor(ws.role);
                  return (
                    <View key={ws.tenant_id} style={styles.workspaceItem}>
                      <Text style={styles.workspaceName} numberOfLines={1}>
                        {ws.tenant_name}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={[styles.roleBadge, { backgroundColor: colors.bg }]}>
                          <Text style={[styles.roleText, { color: colors.text }]}>
                            {ws.role === "admin" ? "Admin" : "Miembro"}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => handleChangeRole(user.id, ws.tenant_id, ws.role)}
                          disabled={updatingUserId === user.id}
                          style={({ pressed }) => [
                            styles.changeRoleButton,
                            pressed && styles.changeRoleButtonPressed,
                            updatingUserId === user.id && styles.actionButtonDisabled
                          ]}
                        >
                          <Text style={styles.changeRoleButtonText}>
                            {updatingUserId === user.id ? "..." : "🔄"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {user.workspaces.length === 0 && (
              <Text style={styles.noWorkspaces}>Sin workspaces asignados</Text>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Modal de confirmación */}
      <Modal
        visible={confirmDialog.visible}
        transparent={true}
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
                  pressed && styles.modalButtonPressed
                ]}
              >
                <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
              </Pressable>
              
              <Pressable
                onPress={handleConfirm}
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.modalButtonConfirm,
                  pressed && styles.modalButtonPressed
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
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.tints.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  changeRoleButtonPressed: {
    opacity: 0.7,
  },
  changeRoleButtonText: {
    fontSize: 16,
  },
  // Estilos del modal
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
