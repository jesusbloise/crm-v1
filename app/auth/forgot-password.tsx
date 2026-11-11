// app/auth/forgot-password.tsx
import { api } from "@/src/api/http";
import { router, Stack } from "expo-router";
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

export default function ForgotPasswordScreen() {
  const submitting = useRef(false);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = Boolean(email.trim());

  const onSubmit = async () => {
    if (submitting.current) return;

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setErr("Ingresa tu correo electrónico.");
      return;
    }

    submitting.current = true;
    setErr(null);
    setLoading(true);

    try {
      await api.post("/auth/forgot-password", {
        email: trimmedEmail,
      });

      router.push({
        pathname: "/auth/reset-password",
        params: { email: trimmedEmail },
      });
    } catch (error: unknown) {
      setErr(
        error instanceof Error
          ? error.message
          : "No se pudo enviar la solicitud. Inténtalo nuevamente."
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
              <Text style={styles.title}>Recuperar contraseña</Text>

              <Text style={styles.subtitle}>
                Ingresa tu correo electrónico. Si existe una cuenta asociada,
                recibirás un código para restablecer tu contraseña.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Correo electrónico</Text>

              <TextInput
                accessibilityLabel="Correo electrónico"
                value={email}
                onChangeText={setEmail}
                editable={!loading}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="go"
                onSubmitEditing={() => void onSubmit()}
                placeholder="tu@correo.com"
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
              accessibilityLabel="Enviar código de recuperación"
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
                  <Text style={styles.primaryText}>Enviando…</Text>
                </View>
              ) : (
                <Text style={styles.primaryText}>Enviar código</Text>
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