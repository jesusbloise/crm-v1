// app/more/workspaces-new.tsx
import { switchTenant } from "@/src/api/auth";
import { api } from "@/src/api/http";
import { Stack, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const BG = "#0b0c10",
  CARD = "#14151a",
  BORDER = "#272a33",
  TEXT = "#e8ecf1",
  SUBTLE = "#a9b0bd",
  ACCENT = "#7c3aed";

const idRegex = /^[a-zA-Z0-9_-]+$/;

export default function WorkspaceNew() {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [idError, setIdError] = useState("");

  // Sugerir id a partir del name si aún no lo tocó el usuario
  const suggestedId = useMemo(() => {
    if (!name) return "";
    return name
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar acentos
      .replace(/[^a-zA-Z0-9_-]+/g, "-")                // espacios y otros -> "-"
      .replace(/^-+|-+$/g, "")                          // trim guiones
      .slice(0, 32)
      .toLowerCase();
  }, [name]);

  const finalId = id || suggestedId;

  // Limpiar el error cuando el usuario cambie el ID
  useEffect(() => {
    setIdError("");
  }, [id]);

  const canSubmit = finalId.length >= 3 && idRegex.test(finalId) && name.trim().length >= 3;

  const onCreate = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setIdError(""); // Limpiar error anterior
    try {
      // Intentar crear el workspace
      await api.post("/tenants", { id: finalId, name: name.trim() });
      await switchTenant(finalId);
      router.replace("/");
    } catch (e: any) {
      if (e?.status === 409 || e?.message?.includes("tenant_exists")) {
        setIdError("Este ID ya está en uso. Por favor, elige otro ID.");
      } else {
        setIdError("No se pudo crear el workspace. Intenta de nuevo.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "Nuevo Workspace" }} />

      <View style={styles.card}>
        <Text style={styles.label}>Nombre</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ej: Acme Inc."
          placeholderTextColor={SUBTLE}
          style={styles.input}
          autoCapitalize="words"
          autoCorrect
        />

        <Text style={[styles.label, { marginTop: 14 }]}>ID (único)</Text>
        <TextInput
          value={id}
          onChangeText={setId}
          placeholder={suggestedId || "ej: acme"}
          placeholderTextColor={SUBTLE}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.help}>
          Letras, números, guion o guion_bajo. Se usará en las peticiones como <Text style={styles.kbd}>X-Tenant-Id</Text>.
        </Text>

        {!idRegex.test(finalId) && finalId.length > 0 && (
          <Text style={styles.error}>El ID solo puede tener letras, números, "-" o "_".</Text>
        )}
        
        {idError ? <Text style={[styles.error, { marginTop: 8 }]}>{idError}</Text> : null}
      </View>

      <Pressable
        onPress={onCreate}
        disabled={!canSubmit || busy}
        style={[
          styles.primaryBtn,
          (!canSubmit || busy) && { opacity: 0.6 },
        ]}
      >
        <Text style={styles.primaryTxt}>{busy ? "Creando…" : "Crear y entrar"}</Text>
      </Pressable>

      <Pressable onPress={() => router.back()} style={styles.linkBtn}>
        <Text style={styles.linkTxt}>Cancelar</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16 },
  card: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  label: { color: TEXT, fontWeight: "800", marginBottom: 6 },
  input: {
    backgroundColor: "#0f1015",
    color: TEXT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 8, default: 10 }),
  },
  help: { color: SUBTLE, marginTop: 8, fontSize: 12 },
  kbd: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    backgroundColor: "#0f1015",
    borderColor: BORDER,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    color: TEXT,
  },
  error: { color: "#fca5a5", marginTop: 8, fontWeight: "700" },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryTxt: { color: "#fff", fontWeight: "900" },
  linkBtn: { alignSelf: "center", marginTop: 12, padding: 8 },
  linkTxt: { color: SUBTLE, fontWeight: "800" },
});
