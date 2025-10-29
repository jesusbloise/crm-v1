// app/auth/register.tsx
import { register } from "@/src/api/auth";
import { router, Stack } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";

const COLORS = {
  bg: "#0b0c10",
  text: "#e8ecf1",
  subtle: "#a9b0bd",
  border: "#272a33",
  accent: "#7C3AED",
};

export default function RegisterScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName || !trimmedEmail || !password) {
      setErr("Completa nombre, email y contraseña");
      return;
    }
    try {
      setErr(null);
      setLoading(true);
      await register({ name: trimmedName, email: trimmedEmail, password });
      router.replace("/"); // éxito
    } catch (e: any) {
      setErr(e.message || "Error al registrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flex: 1, padding: 16, justifyContent: "center", gap: 12, maxWidth: 520, width: "100%", alignSelf: "center" }}>
        <Text style={{ color: COLORS.text, fontWeight: "bold", fontSize: 24, textAlign: "center", marginBottom: 8 }}>
          Crear cuenta
        </Text>

        <Text style={{ color: COLORS.text }}>Nombre</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Tu nombre"
          placeholderTextColor={COLORS.subtle}
          style={{ borderWidth: 1, borderColor: COLORS.border, padding: 12, borderRadius: 10, color: COLORS.text, backgroundColor: "rgba(255,255,255,0.02)" }}
        />

        <Text style={{ color: COLORS.text }}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="tu@correo.com"
          placeholderTextColor={COLORS.subtle}
          style={{ borderWidth: 1, borderColor: COLORS.border, padding: 12, borderRadius: 10, color: COLORS.text, backgroundColor: "rgba(255,255,255,0.02)" }}
        />

        <Text style={{ color: COLORS.text }}>Contraseña</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={COLORS.subtle}
          style={{ borderWidth: 1, borderColor: COLORS.border, padding: 12, borderRadius: 10, color: COLORS.text, backgroundColor: "rgba(255,255,255,0.02)" }}
        />

        {err ? <Text style={{ color: "salmon" }}>{err}</Text> : null}

        <Pressable onPress={onSubmit} style={{ padding: 14, backgroundColor: COLORS.accent, borderRadius: 12, alignItems: "center", marginTop: 4 }} disabled={loading}>
          {loading ? <ActivityIndicator /> : <Text style={{ color: "white", fontWeight: "bold" }}>Registrarme</Text>}
        </Pressable>

        <Pressable
          onPress={() => {
            const r = Math.random().toString(36).slice(2, 7);
            setName(`Demo ${r}`);
            setEmail(`demo_${r}@example.com`);
            setPassword("demo1234");
            Alert.alert("Rellenado", "Se autocompletaron campos demo.");
          }}
          style={{ alignItems: "center", marginTop: 12 }}
        >
          <Text style={{ color: COLORS.subtle, fontSize: 12, opacity: 0.8 }}>Autocompletar datos demo</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
