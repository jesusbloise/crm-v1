// app/auth/reset-password.tsx
import { api } from "@/src/api/http";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";

const COLORS = {
  bg: "#0b0c10",
  text: "#e8ecf1",
  subtle: "#a9b0bd",
  border: "#272a33",
  accent: "#7C3AED",
};

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string; token?: string }>();

  const [token, setToken] = useState(String(params?.token || ""));
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    try {
      setErr(null);
      setMsg(null);

      if (!token.trim()) {
        setErr("Ingresa el código/token que te llegó al correo.");
        return;
      }
      if (!newPassword || newPassword.length < 6) {
        setErr("La contraseña debe tener al menos 6 caracteres.");
        return;
      }
      if (newPassword !== confirm) {
        setErr("Las contraseñas no coinciden.");
        return;
      }

      setLoading(true);
      const res = await api.post("/auth/reset-password", {
        token: token.trim(),
        newPassword,
      });

      setMsg(res?.message || "Contraseña actualizada");
      // volver al login
      router.replace("/auth/login");
    } catch (e: any) {
      setErr(e?.message || "No se pudo actualizar la contraseña");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: COLORS.bg }}
    >
      <Stack.Screen
        options={{
          title: "Nueva contraseña",
          headerStyle: { backgroundColor: COLORS.bg },
          headerTintColor: COLORS.text,
        }}
      />

      <View
        style={{
          flex: 1,
          padding: 16,
          justifyContent: "center",
          gap: 12,
          maxWidth: 520,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 22 }}>
          Nueva contraseña
        </Text>

        <Text style={{ color: COLORS.subtle }}>
          Pega aquí el código/token que recibiste por email.
        </Text>

        <Text style={{ color: COLORS.text }}>Código / Token</Text>
        <TextInput
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          placeholder="pega el token"
          placeholderTextColor={COLORS.subtle}
          style={{
            borderWidth: 1,
            borderColor: COLORS.border,
            padding: 12,
            borderRadius: 10,
            color: COLORS.text,
            backgroundColor: "rgba(255,255,255,0.02)",
          }}
        />

        <Text style={{ color: COLORS.text }}>Nueva contraseña</Text>
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={COLORS.subtle}
          style={{
            borderWidth: 1,
            borderColor: COLORS.border,
            padding: 12,
            borderRadius: 10,
            color: COLORS.text,
            backgroundColor: "rgba(255,255,255,0.02)",
          }}
        />

        <Text style={{ color: COLORS.text }}>Confirmar contraseña</Text>
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={COLORS.subtle}
          style={{
            borderWidth: 1,
            borderColor: COLORS.border,
            padding: 12,
            borderRadius: 10,
            color: COLORS.text,
            backgroundColor: "rgba(255,255,255,0.02)",
          }}
        />

        {msg ? <Text style={{ color: COLORS.subtle }}>{msg}</Text> : null}
        {err ? <Text style={{ color: "salmon" }}>{err}</Text> : null}

        <Pressable
          onPress={onSubmit}
          disabled={loading}
          style={{
            padding: 14,
            backgroundColor: COLORS.accent,
            borderRadius: 12,
            alignItems: "center",
            marginTop: 4,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={{ color: "white", fontWeight: "900" }}>
              Guardar contraseña
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
