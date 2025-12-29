// app/auth/forgot-password.tsx
import { api } from "@/src/api/http";
import { router, Stack } from "expo-router";
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

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    try {
      setErr(null);
      setMsg(null);
      setLoading(true);

      const res = await api.post("/auth/forgot-password", { email });

      setMsg(res?.message || "Si el correo existe, te enviamos un código.");
      // Lo mandamos directo a reset para que pegue el token
      router.push({ pathname: "/auth/reset-password", params: { email } });
    } catch (e: any) {
      setErr(e?.message || "No se pudo enviar la solicitud");
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
          title: "Recuperar contraseña",
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
          Recuperar contraseña
        </Text>

        <Text style={{ color: COLORS.subtle }}>
          Ingresa tu email. Si existe una cuenta, te enviaremos un código/token
          de recuperación.
        </Text>

        <Text style={{ color: COLORS.text }}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="tu@correo.com"
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
              Enviar código
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          style={{ alignItems: "center", marginTop: 8 }}
        >
          <Text style={{ color: COLORS.subtle }}>Volver</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
