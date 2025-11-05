// app/more/workspaces-join.tsx
import { switchTenant } from "@/src/api/auth";
import { api } from "@/src/api/http";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const BG = "#0b0c10", CARD = "#14151a", BORDER = "#272a33", TEXT = "#e8ecf1", SUBTLE = "#a9b0bd", ACCENT = "#7c3aed";

export default function WorkspaceJoin() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string; is_creator: boolean }>>([]);
  const [busy, setBusy] = useState<"search"|"join"|null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<{ id: string; name: string; is_creator: boolean } | null>(null);
  const [verifyId, setVerifyId] = useState("");
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);

  const onSearch = async () => {
    if (!query.trim()) return;
    setBusy("search");
    try {
      const data = await api.get<{ items: Array<{ id: string; name: string; is_creator: boolean }> }>(
        `/tenants/discover?query=${encodeURIComponent(query.trim())}`
      );
      setResults(data.items || []);
    } catch (e: any) {
      Alert.alert("Ups", e?.message || "No se pudo buscar");
    } finally {
      setBusy(null);
    }
  };

  const startJoin = (workspace: { id: string; name: string; is_creator: boolean }) => {
    setSelectedWorkspace(workspace);
    if (workspace.is_creator) {
      // Si es el creador, unirse directamente
      void onJoin(workspace.id);
    } else {
      // Si no es el creador, mostrar diálogo de verificación
      setVerifyId("");
      setShowVerifyDialog(true);
    }
  };

  const onJoin = async (tenant_id: string) => {
    setBusy("join");
    try {
      const res = await api.post<{ ok: boolean; joined?: boolean; tenant?: { id: string; name: string } }>(
        "/tenants/join", 
        { tenant_id }
      );
      if (!res?.ok) throw new Error("join_failed");
      await switchTenant(tenant_id);
      router.replace("/");
    } catch (e: any) {
      Alert.alert("No se pudo entrar", e?.message || "Verifica el ID o usa una invitación");
    } finally {
      setBusy(null);
      setShowVerifyDialog(false);
      setSelectedWorkspace(null);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "Unirse a workspace" }} />
      <View style={styles.card}>
        <Text style={styles.label}>Buscar por ID o nombre</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="ej: acme"
          placeholderTextColor={SUBTLE}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable onPress={onSearch} disabled={busy==="search"} style={[styles.btn, busy==="search" && {opacity:0.6}]}>
          <Text style={styles.btnTxt}>{busy==="search" ? "Buscando…" : "Buscar"}</Text>
        </Pressable>
      </View>

      <FlatList
        data={results}
        keyExtractor={(it) => it.id}
        style={{ marginTop: 16 }}
        renderItem={({ item }) => (
          <View style={styles.resultItem}>
            <View>
              <Text style={styles.resultTitle}>{item.name || item.id}</Text>
              <Text style={styles.resultSub}>ID: {item.id}</Text>
            </View>
            <Pressable 
              onPress={() => startJoin(item)} 
              disabled={busy==="join"} 
              style={[styles.joinBtn, busy==="join" && {opacity:0.6}]}
            >
              <Text style={styles.joinTxt}>
                {item.is_creator ? "Entrar" : "Verificar"}
              </Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: SUBTLE, marginTop: 12 }}>
            {results.length === 0 ? "No hay resultados aún." : ""}
          </Text>
        }
      />

      {/* Modal de verificación */}
      {showVerifyDialog && selectedWorkspace && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.label, { textAlign: "center" }]}>Verificar acceso</Text>
            <Text style={styles.modalText}>
              Para unirte a "{selectedWorkspace.name}" necesitas verificar el ID del workspace.
              Solicita este ID al administrador.
            </Text>

            <TextInput
              value={verifyId}
              onChangeText={setVerifyId}
              placeholder="Ingresa el ID del workspace"
              placeholderTextColor={SUBTLE}
              style={[styles.input, { marginTop: 12 }]}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <Pressable
                onPress={() => setShowVerifyDialog(false)}
                style={[styles.modalBtn, { backgroundColor: "#1f2430", flex: 1 }]}
              >
                <Text style={[styles.modalBtnText, { color: TEXT }]}>Cancelar</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (verifyId.trim() === selectedWorkspace.id) {
                    void onJoin(selectedWorkspace.id);
                  } else {
                    Alert.alert("Error", "El ID ingresado no coincide con el workspace");
                  }
                }}
                disabled={!verifyId.trim()}
                style={[
                  styles.modalBtn,
                  { backgroundColor: ACCENT, flex: 1 },
                  !verifyId.trim() && { opacity: 0.6 }
                ]}
              >
                <Text style={styles.modalBtnText}>Verificar y unirme</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>);
  
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16 },
  card: { backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 14 },
  label: { color: TEXT, fontWeight: "800", marginBottom: 6 },
  input: {
    backgroundColor: "#0f1015", color: TEXT, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: Platform.select({ ios: 12, android: 8, default: 10 }),
  },
  btn: { marginTop: 12, backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  btnTxt: { color: "#fff", fontWeight: "900" },

  resultItem: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    padding: 12, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  resultTitle: { color: TEXT, fontWeight: "800" },
  resultSub: { color: SUBTLE, fontSize: 12, marginTop: 2 },

  joinBtn: { backgroundColor: "#22c55e", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  joinTxt: { color: "#fff", fontWeight: "800" },

  // Estilos para el modal de verificación
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  modalText: {
    color: SUBTLE,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  modalBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  modalBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
});
