// app/auth/reset-password.tsx
import { api } from "@/src/api/http";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const COLORS = {
  bg: "#f5f6fa",
  card: "#ffffff",
  text: "#202536",
  subtle: "#737b8e",
  placeholder: "#98a0af",
  border: "#dce0e9",
  accent: "#7551c8",
  error: "#b42332",
};

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{
    email?: string | string[];
    token?: string | string[];
  }>();

  const initialToken = Array.isArray(params.token)
    ? params.token[0]
    : params.token;

  const passwordInput = useRef<TextInput>(null);
  const confirmInput = useRef<TextInput>(null);
  const submitting = useRef(false);

  const [token, setToken] = useState(initialToken ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = Boolean(token.trim() && newPassword && confirm);

  const onSubmit = async () => {
    if (submitting.current) return;

    setErr(null);

    if (!token.trim()) {
      setErr("Ingresa el código de recuperación que recibiste por correo.");
      return;
    }

    if (newPassword.length < 6) {
      setErr("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirm) {
      setErr("Las contraseñas no coinciden.");
      return;
    }

    submitting.current = true;
    setLoading(true);

    try {
      await api.post("/auth/reset-password", {
        token: token.trim(),
        newPassword,
      });

      router.replace("/auth/login");
    } catch (error: unknown) {
      setErr(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la contraseña. Inténtalo nuevamente."
      );
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <View style={styles.brand}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>CRM</Text>
            </View>

            <Text style={styles.brandCaption}>Gestión comercial</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.heading}>
              <Text style={styles.title}>Nueva contraseña</Text>

              <Text style={styles.subtitle}>
                Ingresa el código que recibiste por correo y elige tu nueva
                contraseña.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Código de recuperación</Text>

              <TextInput
                accessibilityLabel="Código de recuperación"
                value={token}
                onChangeText={setToken}
                editable={!loading}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordInput.current?.focus()}
                placeholder="Pega aquí el código"
                placeholderTextColor={COLORS.placeholder}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Nueva contraseña</Text>

              <TextInput
                ref={passwordInput}
                accessibilityLabel="Nueva contraseña"
                value={newPassword}
                onChangeText={setNewPassword}
                editable={!loading}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                returnKeyType="next"
                onSubmitEditing={() => confirmInput.current?.focus()}
                placeholder="Crea tu nueva contraseña"
                placeholderTextColor={COLORS.placeholder}
                style={styles.input}
              />

              <Text style={styles.help}>
                Usa al menos 6 caracteres.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Confirmar contraseña</Text>

              <TextInput
                ref={confirmInput}
                accessibilityLabel="Confirmar contraseña"
                value={confirm}
                onChangeText={setConfirm}
                editable={!loading}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                returnKeyType="go"
                onSubmitEditing={() => void onSubmit()}
                placeholder="Repite tu nueva contraseña"
                placeholderTextColor={COLORS.placeholder}
                style={styles.input}
              />
            </View>

            {!!err && (
              <View style={styles.errorBox}>
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {err}
                </Text>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Guardar contraseña"
              disabled={!canSubmit || loading}
              onPress={() => void onSubmit()}
              style={({ pressed }) => [
                styles.primaryButton,
                (!canSubmit || loading) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.primaryText}>Guardando…</Text>
                </View>
              ) : (
                <Text style={styles.primaryText}>Guardar contraseña</Text>
              )}
            </Pressable>

            <View style={styles.backSection}>
              <Pressable
                accessibilityRole="link"
                disabled={loading}
                onPress={() => router.replace("/auth/login")}
                style={styles.backButton}
              >
                <Text style={styles.link}>Volver a iniciar sesión</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  container: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    gap: 24,
  },
  brand: {
    alignItems: "center",
    gap: 10,
  },
  brandBadge: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  brandBadgeText: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "700",
    letterSpacing: 1,
  },
  brandCaption: {
    color: COLORS.subtle,
    fontSize: 12,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "#e7e9f0",
    borderRadius: 16,
    padding: 24,
    gap: 20,
  },
  heading: {
    gap: 8,
    marginBottom: 4,
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    color: COLORS.subtle,
    fontSize: 13,
    lineHeight: 20,
  },
  field: {
    gap: 8,
  },
  label: {
    color: "#475467",
    fontSize: 13,
    fontWeight: "500",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    fontSize: 14,
  },
  help: {
    color: COLORS.subtle,
    fontSize: 11,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: "#fff3f3",
    borderWidth: 1,
    borderColor: "#f3d6d6",
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    lineHeight: 19,
  },
  primaryButton: {
    minHeight: 48,
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  backSection: {
    borderTopWidth: 1,
    borderTopColor: "#e7e9f0",
    paddingTop: 16,
    alignItems: "center",
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  link: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "600",
  },
});