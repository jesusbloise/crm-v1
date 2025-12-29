// app/auth/login.tsx
import { login } from "@/src/api/auth";
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

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    try {
      setErr(null);
      setLoading(true);
      await login({ email, password });
      router.replace("/");
    } catch (e: any) {
      setErr(e.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: COLORS.bg }}
    >
      <Stack.Screen options={{ headerShown: false }} />

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
        <Text
          style={{
            color: COLORS.text,
            fontWeight: "bold",
            fontSize: 24,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          Iniciar sesión
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

        <Text style={{ color: COLORS.text }}>Contraseña</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
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

        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Pressable onPress={() => router.push("/auth/forgot-password")}>
            <Text style={{ color: COLORS.subtle, fontWeight: "700" }}>
              ¿Olvidaste tu contraseña?
            </Text>
          </Pressable>
        </View>

        {err ? <Text style={{ color: "salmon" }}>{err}</Text> : null}

        <Pressable
          onPress={onSubmit}
          style={{
            padding: 14,
            backgroundColor: COLORS.accent,
            borderRadius: 12,
            alignItems: "center",
            marginTop: 4,
          }}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={{ color: "white", fontWeight: "bold" }}>Entrar</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.push("/auth/register")}
          style={{ alignItems: "center", marginTop: 8 }}
        >
          <Text style={{ color: COLORS.subtle }}>
            ¿No tienes cuenta? Regístrate
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setEmail("admin@demo.local");
            setPassword("demo");
          }}
          style={{ alignItems: "center", marginTop: 12 }}
        >
          <Text style={{ color: COLORS.subtle, fontSize: 12, opacity: 0.8 }}>
            Autocompletar usuario demo
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}



// // app/auth/login.tsx
// import { login } from "@/src/api/auth";
// import { router, Stack } from "expo-router";
// import React, { useState } from "react";
// import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";

// const COLORS = {
//   bg: "#0b0c10",
//   text: "#e8ecf1",
//   subtle: "#a9b0bd",
//   border: "#272a33",
//   accent: "#7C3AED",
// };

// export default function LoginScreen() {
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [loading, setLoading] = useState(false);
//   const [err, setErr] = useState<string | null>(null);

//   const onSubmit = async () => {
//     try {
//       setErr(null);
//       setLoading(true);
//       await login({ email, password });
//       router.replace("/"); // éxito -> home
//     } catch (e: any) {
//       setErr(e.message || "Error al iniciar sesión");
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: COLORS.bg }}>
//       {/* Oculta el header en esta pantalla */}
//       <Stack.Screen options={{ headerShown: false }} />

//       <View style={{ flex: 1, padding: 16, justifyContent: "center", gap: 12, maxWidth: 520, width: "100%", alignSelf: "center" }}>
//         <Text style={{ color: COLORS.text, fontWeight: "bold", fontSize: 24, textAlign: "center", marginBottom: 8 }}>
//           Iniciar sesión
//         </Text>

//         <Text style={{ color: COLORS.text }}>Email</Text>
//         <TextInput
//           value={email}
//           onChangeText={setEmail}
//           autoCapitalize="none"
//           keyboardType="email-address"
//           placeholder="tu@correo.com"
//           placeholderTextColor={COLORS.subtle}
//           style={{ borderWidth: 1, borderColor: COLORS.border, padding: 12, borderRadius: 10, color: COLORS.text, backgroundColor: "rgba(255,255,255,0.02)" }}
//         />

//         <Text style={{ color: COLORS.text }}>Contraseña</Text>
//         <TextInput
//           value={password}
//           onChangeText={setPassword}
//           secureTextEntry
//           placeholder="••••••••"
//           placeholderTextColor={COLORS.subtle}
//           style={{ borderWidth: 1, borderColor: COLORS.border, padding: 12, borderRadius: 10, color: COLORS.text, backgroundColor: "rgba(255,255,255,0.02)" }}
//         />

//         {err ? <Text style={{ color: "salmon" }}>{err}</Text> : null}

//         <Pressable
//           onPress={onSubmit}
//           style={{ padding: 14, backgroundColor: COLORS.accent, borderRadius: 12, alignItems: "center", marginTop: 4 }}
//           disabled={loading}
//         >
//           {loading ? <ActivityIndicator /> : <Text style={{ color: "white", fontWeight: "bold" }}>Entrar</Text>}
//         </Pressable>

//         <Pressable onPress={() => router.push("/auth/register")} style={{ alignItems: "center", marginTop: 8 }}>
//           <Text style={{ color: COLORS.subtle }}>¿No tienes cuenta? Regístrate</Text>
//         </Pressable>

//         {/* Atajo DEV */}
//         <Pressable
//           onPress={() => {
//             setEmail("admin@demo.local");
//             setPassword("demo");
//           }}
//           style={{ alignItems: "center", marginTop: 12 }}
//         >
//           <Text style={{ color: COLORS.subtle, fontSize: 12, opacity: 0.8 }}>Autocompletar usuario demo</Text>
//         </Pressable>
//       </View>
//     </KeyboardAvoidingView>
//   );
// }
