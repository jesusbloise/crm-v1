// app/contacts/new.tsx
import { createActivity } from "@/src/api/activities";
import { createContact } from "@/src/api/contacts";
import { createNote } from "@/src/api/notes";
import {
  initNotifications,
  scheduleActivityReminder,
} from "@/src/utils/notifications";
import { uid } from "@/src/utils/uid";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";

/* 🎨 Paleta */
const PRIMARY = "#7C3AED";
const ACCENT = "#22D3EE";
const BG = "#0F1115";
const CARD = "#171923";
const FIELD = "#121318";
const BORDER = "#2B3140";
const TEXT = "#F3F4F6";
const SUBTLE = "#A4ADBD";
const DANGER = "#EF4444";

type ClientType = "productora" | "agencia" | null;

export default function NewContact() {
  const qc = useQueryClient();

  // formulario contacto
  const [clientType, setClientType] = useState<ClientType>(null);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // nota + recordatorio
  const [notes, setNotes] = useState("");
  const [dateStr, setDateStr] = useState(""); // YYYY-MM-DD
  const [timeStr, setTimeStr] = useState(""); // HH:MM
  const [remind, setRemind] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initNotifications().catch(() => {});
  }, []);

  const placeholderTitle = useMemo(
    () => (name.trim() ? `Seguimiento a ${name.trim()}` : "Recordatorio"),
    [name]
  );

  const parseDueDate = (s: string): number | null => {
    if (!s.trim()) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return NaN as any;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return NaN as any;
    return d.getTime();
  };
  const parseTime = (s: string): { h: number; m: number } | null => {
    if (!s.trim()) return null;
    const m = s.match(/^(\d{2}):([0-5]\d)$/);
    if (!m) return null;
    return { h: Number(m[1]), m: Number(m[2]) };
  };

  const validate = () => {
    if (!name.trim()) return "El nombre es obligatorio.";
    if (dateStr.trim()) {
      const ts = parseDueDate(dateStr);
      if (isNaN(ts as any)) return "La fecha debe ser YYYY-MM-DD.";
    }
    if (remind) {
      if (!dateStr.trim()) return "Para recordar, ingresa una fecha.";
      if (!timeStr.trim() || !parseTime(timeStr))
        return "La hora debe ser HH:MM (24h).";
      const base = parseDueDate(dateStr)!;
      const t = parseTime(timeStr)!;
      const when = new Date(base);
      when.setHours(t.h, t.m, 0, 0);
      if (when.getTime() <= Date.now())
        return "El recordatorio debe ser en el futuro.";
    }
    return null;
  };

  const m = useMutation({
    mutationFn: async () => {
      const v = validate();
      if (v) {
        setError(v);
        throw new Error(v);
      }
      setError(null);

      // 1) Crear contacto
      const contactId = uid();
      await createContact({
        id: contactId,
        name: name.trim(),
        company: company || undefined,
        position: position || undefined,
        email: email || undefined,
        phone: phone || undefined,
        // 👇 IMPORTANTE: el tipo de cliente que luego lees en [id].tsx
        client_type: clientType || undefined,
      } as any);

      // 2) Crear nota (si hay)
      const noteBody = notes.trim();
      if (noteBody) {
        await createNote({
          id: uid(),
          body: noteBody,
          contact_id: contactId,
        } as any);

        // 2.1) ➕ Registrar también como ACTIVIDAD tipo "note"
        const noteActivityId = uid();
        await createActivity({
          id: noteActivityId,
          type: "note",
          title: noteBody.slice(0, 80) || "Nota",
          status: "done",
          notes: noteBody,
          due_date: null as any,
          contact_id: contactId,
        } as any);
      }

      // 3) Crear actividad (task) si hay recordatorio — con remind_at_ms
      if (remind) {
        const base = parseDueDate(dateStr)!; // día (00:00)
        const t = parseTime(timeStr)!;
        const when = new Date(base);
        when.setHours(t.h, t.m, 0, 0);

        const actId = uid();
        await createActivity({
          id: actId,
          type: "task",
          title: placeholderTitle,
          status: "open",
          notes: noteBody || null,
          due_date: base, // guarda el día
          remind_at_ms: when.getTime(), // ← instante exacto para re-agendar
          contact_id: contactId,
        } as any);

        // 🔔 Notificación local para la fecha+hora exactas
        await scheduleActivityReminder({
          activityId: actId,
          title: placeholderTitle,
          body: noteBody || "Tienes una actividad pendiente",
          when,
        });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contacts"] }),
        qc.invalidateQueries({ queryKey: ["notes"] }),
        qc.invalidateQueries({ queryKey: ["activities"] }),
      ]);

      const msg = "Contacto guardado";
      if (Platform.OS === "android") {
        ToastAndroid.show(msg, ToastAndroid.SHORT);
      } else {
        Alert.alert(msg);
      }
      router.replace("/contacts");
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "No se pudo crear el contacto");
      if (Platform.OS === "android") {
        ToastAndroid.show(msg, ToastAndroid.LONG);
      } else {
        Alert.alert("Error", msg);
      }
    },
  });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: "Nuevo contacto",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Datos del contacto */}
        <Text style={styles.label}>Nombre *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Ej: Juan Pérez"
          placeholderTextColor={SUBTLE}
        />

        {/* Cliente: Productora / Agencia */}
        <Text style={styles.label}>Cliente</Text>
        <View style={styles.clientRow}>
          <Pressable
            onPress={() =>
              setClientType((prev) =>
                prev === "productora" ? null : "productora"
              )
            }
            style={[
              styles.clientChip,
              clientType === "productora" && styles.clientChipActive,
            ]}
          >
            <Text
              style={[
                styles.clientChipText,
                clientType === "productora" && styles.clientChipTextActive,
              ]}
            >
              Productora
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              setClientType((prev) => (prev === "agencia" ? null : "agencia"))
            }
            style={[
              styles.clientChip,
              clientType === "agencia" && styles.clientChipActive,
            ]}
          >
            <Text
              style={[
                styles.clientChipText,
                clientType === "agencia" && styles.clientChipTextActive,
              ]}
            >
              Agencia
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Empresa</Text>
        <TextInput
          style={styles.input}
          value={company}
          onChangeText={setCompany}
          placeholder="Opcional"
          placeholderTextColor={SUBTLE}
        />
        <Text style={styles.label}>Cargo</Text>
        <TextInput
          style={styles.input}
          value={position}
          onChangeText={setPosition}
          placeholder="Opcional"
          placeholderTextColor={SUBTLE}
        />
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="usuario@dominio.com"
          placeholderTextColor={SUBTLE}
        />
        <Text style={styles.label}>Teléfono</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+58 412 000 0000"
          placeholderTextColor={SUBTLE}
        />

        {/* Nota */}
        <Text style={styles.label}>Nota</Text>
        <TextInput
          style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Escribe una nota para este contacto…"
          placeholderTextColor={SUBTLE}
          multiline
        />

        {/* Fecha/Hora + Recordarme */}
        <Text style={styles.label}>Fecha (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={dateStr}
          onChangeText={setDateStr}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          placeholder="2025-02-28"
          placeholderTextColor={SUBTLE}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Hora (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={timeStr}
              onChangeText={setTimeStr}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              placeholder="14:30"
              placeholderTextColor={SUBTLE}
            />
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={[styles.label, { marginBottom: 6 }]}>Recordarme</Text>
            <Switch
              value={remind}
              onValueChange={setRemind}
              trackColor={{ false: "#444", true: PRIMARY }}
              thumbColor={remind ? "#fff" : "#ccc"}
            />
          </View>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        {/* Acciones */}
        <Pressable
          style={[styles.btn, styles.btnPrimary, m.isPending && { opacity: 0.9 }]}
          onPress={() => m.mutate()}
          disabled={m.isPending}
        >
          <Text style={styles.btnText}>
            {m.isPending ? "Guardando…" : "Guardar contacto"}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={() => router.back()}
        >
          <Text style={styles.btnText}>Cancelar</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ——— Estilos ——— */
const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  label: { color: TEXT, fontWeight: "900", marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 12,
    padding: 12,
  },
  clientRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  clientChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },
  clientChipActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  clientChipText: { color: TEXT, fontWeight: "800", fontSize: 12 },
  clientChipTextActive: { color: "#fff" },
  btn: { marginTop: 6, padding: 12, borderRadius: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "900" },
  btnPrimary: {
    backgroundColor: PRIMARY,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  subtle: { color: SUBTLE },
  error: { color: "#fecaca" },
});
