import { listAccounts } from "@/src/api/accounts";
import { createActivity, type ActivityType } from "@/src/api/activities";
import { listContacts } from "@/src/api/contacts";
import { listDeals } from "@/src/api/deals";
import { listLeads } from "@/src/api/leads";
import { initNotifications, scheduleActivityReminder } from "@/src/utils/notifications"; // 🔔
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

/* 🎨 Paleta consistente */
const PRIMARY = "#7C3AED";  // morado acciones
const ACCENT  = "#22D3EE";  // cian detalles
const BG      = "#0F1115";  // fondo
const CARD    = "#171923";  // tarjetas
const FIELD   = "#121318";  // inputs
const BORDER  = "#2B3140";  // bordes
const TEXT    = "#F3F4F6";  // texto principal
const SUBTLE  = "#A4ADBD";  // subtítulos
const DANGER  = "#EF4444";  // eliminar/errores

type RelKey = "account_id" | "contact_id" | "deal_id" | "lead_id";
const TYPES: ActivityType[] = ["task", "call", "meeting"];

export default function NewActivity() {
  const params = useLocalSearchParams<{
    account_id?: string;
    contact_id?: string;
    deal_id?: string;
    lead_id?: string;
  }>();

  const qc = useQueryClient();

  // catálogos
  const qAcc  = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const qCon  = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
  const qDeal = useQuery({ queryKey: ["deals"],    queryFn: listDeals    });
  const qLead = useQuery({ queryKey: ["leads"],    queryFn: listLeads    });

  // formulario
  const [type, setType] = useState<ActivityType>("task");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dateStr, setDateStr] = useState(""); // YYYY-MM-DD
  const [timeStr, setTimeStr] = useState(""); // 🔔 HH:MM
  const [remind, setRemind] = useState(false); // 🔔 activar recordatorio
  const [error, setError] = useState<string | null>(null);

  // vínculos
  const [accountId, setAccountId] = useState<string | undefined>();
  const [contactId, setContactId] = useState<string | undefined>();
  const [dealId, setDealId]       = useState<string | undefined>();
  const [leadId, setLeadId]       = useState<string | undefined>();

  // bloquear si vienen por query
  const locked: Partial<Record<RelKey, true>> = useMemo(() => {
    const lk: Partial<Record<RelKey, true>> = {};
    (["account_id", "contact_id", "deal_id", "lead_id"] as RelKey[]).forEach((k) => {
      if (params[k]) lk[k] = true;
    });
    return lk;
  }, [params]);

  useEffect(() => {
    if (params.account_id) setAccountId(String(params.account_id));
    if (params.contact_id) setContactId(String(params.contact_id));
    if (params.deal_id)    setDealId(String(params.deal_id));
    if (params.lead_id)    setLeadId(String(params.lead_id));
  }, [params]);

  // 🔔 aseguramos permisos/canal una vez
  useEffect(() => {
    initNotifications().catch(() => {});
  }, []);

  // helpers fecha/hora
  const parseDueDate = (s: string): number | null => {
    if (!s.trim()) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return NaN as any;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return NaN as any;
    return d.getTime();
  };
  const parseTime = (s: string): {h: number; m: number} | null => {
    if (!s.trim()) return null;
    const m = s.match(/^(\d{2}):([0-5]\d)$/);
    if (!m) return null;
    return { h: Number(m[1]), m: Number(m[2]) };
  };

  const validate = () => {
    if (!title.trim()) return "El título es obligatorio.";
    if (dateStr.trim()) {
      const ts = parseDueDate(dateStr);
      if (isNaN(ts as any)) return "La fecha debe ser YYYY-MM-DD.";
    }
    if (remind) {
      if (!dateStr.trim()) return "Para recordar, ingresa una fecha.";
      if (!timeStr.trim() || !parseTime(timeStr)) return "La hora debe ser HH:MM (24h).";
      // opcional: no permitir tiempos pasados
      const due = parseDueDate(dateStr)!;
      const t = parseTime(timeStr)!;
      const when = new Date(due);
      when.setHours(t.h, t.m, 0, 0);
      if (when.getTime() <= Date.now()) return "El recordatorio debe ser en el futuro.";
    }
    return null;
  };

  const mCreate = useMutation({
    mutationFn: async () => {
      const err = validate();
      if (err) {
        setError(err);
        throw new Error(err);
      }
      setError(null);

      const due = parseDueDate(dateStr); // puede ser null
      const payload: any = {
        id: uid(),
        type,
        title: title.trim(),
        status: "open",
        notes: notes.trim() ? notes.trim() : null,
        due_date: due || null,
        account_id: accountId || null,
        contact_id: contactId || null,
        deal_id:    dealId    || null,
        lead_id:    leadId    || null,
      };

      // creamos actividad
      await createActivity(payload);

      // 🔔 si “Recordarme” está activo programamos notificación
      if (remind) {
        const base = parseDueDate(dateStr)!;
        const t = parseTime(timeStr)!;
        const when = new Date(base);
        when.setHours(t.h, t.m, 0, 0);

        await scheduleActivityReminder({
  activityId: "act_123",
  title: "Llamar al cliente",
  body: "No olvides la reunión de seguimiento",
  when: new Date(Date.now() + 5 * 60 * 1000), // en 5 minutos
});
      }
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["activities"] }),
        accountId && qc.invalidateQueries({ queryKey: ["activities", { account_id: accountId }] }),
        contactId && qc.invalidateQueries({ queryKey: ["activities", { contact_id: contactId }] }),
        dealId    && qc.invalidateQueries({ queryKey: ["activities", dealId] }),
        leadId    && qc.invalidateQueries({ queryKey: ["activities", { lead_id: leadId }] }),
      ]);
      router.back();
    },
    onError: (e: any) => {
      alert(String(e?.message ?? "No se pudo crear la actividad"));
    },
  });

  // util: chips renderer
  function Chips<T extends { id: string; label: string }>(props: {
    title: string;
    items: T[];
    selected?: string;
    onSelect?: (id?: string) => void;
    locked?: boolean;
  }) {
    const { title, items, selected, onSelect, locked } = props;
    return (
      <View style={{ marginTop: 10 }}>
        <Text style={styles.label}>{title}</Text>
        <View style={styles.chipsRow}>
          {items.map((it) => {
            const active = selected === it.id;
            return (
              <Pressable
                key={it.id}
                onPress={() => !locked && onSelect?.(active ? undefined : it.id)}
                style={[styles.chip, (active || locked) && styles.chipActive, locked && { opacity: 0.8 }]}
                disabled={locked}
              >
                <Text style={[styles.chipText, (active || locked) && styles.chipTextActive]} numberOfLines={1}>
                  {it.label}
                </Text>
              </Pressable>
            );
          })}
          {items.length === 0 && (
            <Text style={styles.subtle}>— vacío —</Text>
          )}
        </View>
      </View>
    );
  }

  const accOpts  = useMemo(() => (qAcc.data  ?? []).map(a => ({ id: a.id,  label: a.name   })), [qAcc.data]);
  const conOpts  = useMemo(() => (qCon.data  ?? []).map(c => ({ id: c.id,  label: c.name   })), [qCon.data]);
  const dealOpts = useMemo(() => (qDeal.data ?? []).map(d => ({ id: d.id, label: d.title  })), [qDeal.data]);
  const leadOpts = useMemo(() => (qLead.data ?? []).map(l => ({ id: l.id, label: l.name   })), [qLead.data]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: "Nueva actividad",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.label}>Tipo</Text>
        <View style={styles.pillsRow}>
          {TYPES.map((t) => {
            const active = type === t;
            return (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                style={[styles.pill, active && styles.pillActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                hitSlop={8}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {t === "task" ? "Tarea" : t === "call" ? "Llamada" : "Reunión"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Título *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Ej: Llamar para confirmar demo"
          placeholderTextColor={SUBTLE}
        />

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

        {/* 🔔 Hora y switch de recordatorio */}
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

        <Text style={styles.label}>Notas</Text>
        <TextInput
          style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Detalles adicionales…"
          placeholderTextColor={SUBTLE}
          multiline
        />

        {/* Vínculos */}
        <Chips title="Cuenta"      items={accOpts}  selected={accountId} onSelect={setAccountId} locked={!!locked.account_id} />
        <Chips title="Contacto"    items={conOpts}  selected={contactId} onSelect={setContactId} locked={!!locked.contact_id} />
        <Chips title="Oportunidad" items={dealOpts} selected={dealId}    onSelect={setDealId}    locked={!!locked.deal_id} />
        <Chips title="Lead"        items={leadOpts} selected={leadId}    onSelect={setLeadId}    locked={!!locked.lead_id} />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.btn, styles.btnPrimary, mCreate.isPending && { opacity: 0.9 }]}
          onPress={() => mCreate.mutate()}
          disabled={mCreate.isPending}
        >
          <Text style={styles.btnText}>
            {mCreate.isPending ? "Creando…" : "Crear actividad"}
          </Text>
        </Pressable>

        <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => router.back()}>
          <Text style={styles.btnText}>Cancelar</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// util id
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ——— Estilos ——— */
const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  label: { color: TEXT, fontWeight: "900", marginTop: 2 },

  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: CARD,
  },
  pillActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  pillText: { fontSize: 12, color: TEXT, fontWeight: "700" },
  pillTextActive: { color: "#fff", fontWeight: "900" },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 12,
    padding: 12,
  },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },
  chipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  chipText: { color: TEXT, fontWeight: "800", fontSize: 12, maxWidth: 180 },
  chipTextActive: { color: "#fff" },

  btn: { marginTop: 6, padding: 12, borderRadius: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "900" },
  btnPrimary: { backgroundColor: PRIMARY, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  subtle: { color: SUBTLE },
  error: { color: "#fecaca" },
});

