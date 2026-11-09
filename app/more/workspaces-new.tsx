// app/more/workspaces-new.tsx
import { switchTenant } from "@/src/api/auth";
import { api } from "@/src/api/http";
import { Stack, router } from "expo-router";
import { useMemo, useState } from "react";
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

const BG = "#f5f6fa";
const CARD = "#ffffff";
const BORDER = "#e7e9f0";
const TEXT = "#202536";
const SUBTLE = "#737b8e";
const ACCENT = "#7551c8";

const idRegex = /^[a-zA-Z0-9_-]+$/;

export default function WorkspaceNew() {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);

  const suggestedId = useMemo(
    () =>
      name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32)
        .toLowerCase(),
    [name]
  );

  const finalId = id || suggestedId;
  const validId =
    finalId.length >= 3 && idRegex.test(finalId);

  const canSubmit =
    Boolean(createdId) ||
    (validId && name.trim().length >= 3);

  const locked = busy || Boolean(createdId);

  async function onCreate() {
    if (!canSubmit || busy) return;

    setBusy(true);
    setError("");

    let workspaceId = createdId;

    try {
      if (!workspaceId) {
        await api.post("/tenants", {
          id: finalId,
          name: name.trim(),
        });

        workspaceId = finalId;
        setCreatedId(workspaceId);
      }

      await switchTenant(workspaceId);
      router.replace("/tasks");
    } catch (error: unknown) {
      const details = error as {
        status?: number;
        message?: string;
      };

      if (workspaceId) {
        setError(
          "El workspace ya fue creado, pero no pudimos entrar. Pulsa «Reintentar entrada»."
        );
      } else if (
        details?.status === 409 ||
        details?.message?.includes("tenant_exists")
      ) {
        setError("Este ID ya está en uso. Elige otro.");
      } else {
        setError(
          "No se pudo confirmar la creación. Si se perdió la conexión, revisa tus workspaces antes de reintentar."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ title: "Nuevo workspace" }} />

      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.heading}>
          <Text style={s.eyebrow}>ESPACIOS DE TRABAJO</Text>
          <Text style={s.title}>Nuevo workspace</Text>
          <Text style={s.subtitle}>
            Crea un espacio para organizar tus contactos,
            oportunidades y actividades.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.section}>Información del workspace</Text>

          <View style={s.field}>
            <Text style={s.label}>Nombre</Text>
            <TextInput
              accessibilityLabel="Nombre del workspace"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setError("");
              }}
              editable={!locked}
              placeholder="Ej.: Agencia Norte"
              placeholderTextColor="#9299a7"
              style={s.input}
              autoCapitalize="words"
              autoCorrect={false}
            />
            <Text style={s.help}>
              Usa al menos 3 caracteres.
            </Text>
          </View>

          <View style={s.field}>
            <Text style={s.label}>ID único</Text>
            <TextInput
              accessibilityLabel="Identificador único del workspace"
              value={id}
              onChangeText={(value) => {
                setId(value);
                setError("");
              }}
              editable={!locked}
              placeholder={suggestedId || "ej: agencia-norte"}
              placeholderTextColor="#9299a7"
              style={s.input}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => void onCreate()}
            />

            <Text style={s.help}>
              Mínimo 3 caracteres. Puedes usar letras, números,
              guiones y guiones bajos. Este es el identificador
              que puedes compartir para acceder al workspace.
            </Text>

            {!!finalId && (
              <View style={s.preview}>
                <Text style={s.previewLabel}>
                  ID que se utilizará
                </Text>
                <Text selectable style={s.previewValue}>
                  {createdId || finalId}
                </Text>
              </View>
            )}

            {!!finalId && !idRegex.test(finalId) && (
              <Text style={s.error}>
                El ID solo admite letras, números, "-" o "_".
              </Text>
            )}
          </View>

          {!!createdId && (
            <View style={s.successBox}>
              <Text style={s.success}>
                Workspace creado. Falta completar la entrada.
              </Text>
            </View>
          )}

          {!!error && (
            <View style={s.errorBox}>
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            </View>
          )}

          <View style={s.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void onCreate()}
              disabled={!canSubmit || busy}
              style={[
                s.button,
                s.primary,
                (!canSubmit || busy) && s.disabled,
              ]}
            >
              {busy && (
                <ActivityIndicator size="small" color="#ffffff" />
              )}
              <Text style={s.primaryText}>
                {busy
                  ? createdId
                    ? "Entrando…"
                    : "Creando…"
                  : createdId
                  ? "Reintentar entrada"
                  : "Crear y entrar"}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                if (createdId) {
                  router.replace("/more");
                } else {
                  router.back();
                }
              }}
              style={[
                s.button,
                s.secondary,
                busy && s.disabled,
              ]}
            >
              <Text style={s.secondaryText}>
                {createdId ? "Ir a mis workspaces" : "Cancelar"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 48,
    gap: 20,
  },
  heading: {
    gap: 8,
  },
  eyebrow: {
    color: "#8a819e",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  title: {
    color: TEXT,
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    color: SUBTLE,
    fontSize: 13,
    lineHeight: 22,
  },
  card: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    gap: 20,
  },
  section: {
    color: TEXT,
    fontSize: 16,
    fontWeight: "700",
  },
  field: {
    minWidth: 0,
    gap: 8,
  },
  label: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "600",
  },
  input: {
    width: "100%",
    minWidth: 0,
    minHeight: 46,
    backgroundColor: "#ffffff",
    color: TEXT,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce0e9",
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14,
  },
  help: {
    color: SUBTLE,
    fontSize: 11,
    lineHeight: 19,
  },
  preview: {
    backgroundColor: "#f7f4fc",
    borderRadius: 8,
    padding: 12,
    gap: 5,
  },
  previewLabel: {
    color: "#8a819e",
    fontSize: 10,
    fontWeight: "600",
  },
  previewValue: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primary: {
    backgroundColor: ACCENT,
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  secondary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ded5ef",
  },
  secondaryText: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
  errorBox: {
    backgroundColor: "#fff3f3",
    borderWidth: 1,
    borderColor: "#f3d6db",
    borderRadius: 8,
    padding: 12,
  },
  error: {
    color: "#b42332",
    fontSize: 12,
    lineHeight: 20,
  },
  successBox: {
    backgroundColor: "#edf8f1",
    borderRadius: 8,
    padding: 12,
  },
  success: {
    color: "#23744d",
    fontSize: 12,
    lineHeight: 20,
  },
});