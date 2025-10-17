import { listAccounts } from "@/src/api/accounts";
import { createActivity, type ActivityType } from "@/src/api/activities";
import { listContacts } from "@/src/api/contacts";
import { listDeals } from "@/src/api/deals";
import { listLeads } from "@/src/api/leads";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
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
  // Si vienes desde /deals/[id]? -> puedes pasar ?deal_id=xxx (mismo para account_id, contact_id, lead_id)
  const params = useLocalSearchParams<{
    account_id?: string;
    contact_id?: string;
    deal_id?: string;
    lead_id?: string;
  }>();

  const qc = useQueryClient();

  // Queries catálogos
  const qAcc  = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const qCon  = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
  const qDeal = useQuery({ queryKey: ["deals"],    queryFn: listDeals    });
  const qLead = useQuery({ queryKey: ["leads"],    queryFn: listLeads    });

  // Estado del formulario
  const [type, setType] = useState<ActivityType>("task");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dateStr, setDateStr] = useState(""); // YYYY-MM-DD
  const [error, setError] = useState<string | null>(null);

  // Vínculos (solo uno opcional)
  const [accountId, setAccountId] = useState<string | undefined>();
  const [contactId, setContactId] = useState<string | undefined>();
  const [dealId, setDealId]       = useState<string | undefined>();
  const [leadId, setLeadId]       = useState<string | undefined>();

  // Si vino bloqueado por parámetro, preselecciona y bloquea
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

  // Helper: construir due_date a partir de YYYY-MM-DD
  const parseDueDate = (s: string): number | null => {
    if (!s.trim()) return null;
    // formato simple YYYY-MM-DD
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return NaN as any;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return NaN as any;
    return d.getTime();
  };

  // Validación antes de enviar
  const validate = () => {
    if (!title.trim()) return "El título es obligatorio.";
    if (dateStr.trim()) {
      const ts = parseDueDate(dateStr);
      if (isNaN(ts as any)) return "La fecha debe ser YYYY-MM-DD.";
    }
    // No exigir vínculo, pero si viene bloqueado, respetar
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
        // vínculos (solo 1 recomendado, pero permitimos múltiples si el usuario insiste)
        account_id: accountId || null,
        contact_id: contactId || null,
        deal_id:    dealId    || null,
        lead_id:    leadId    || null,
      };
      return createActivity(payload);
    },
    onSuccess: async () => {
      // Invalidaciones mínimas
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["activities"] }),
        // si se creó desde una entidad, refrescamos sus listas
        accountId && qc.invalidateQueries({ queryKey: ["activities", { account_id: accountId }] }),
        contactId && qc.invalidateQueries({ queryKey: ["activities", { contact_id: contactId }] }),
        dealId    && qc.invalidateQueries({ queryKey: ["activities", dealId] }),
        leadId    && qc.invalidateQueries({ queryKey: ["activities", { lead_id: leadId }] }),
      ]);
      router.back();
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

  // Normalizar catálogos a {id,label}
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

        <Text style={styles.label}>Notas</Text>
        <TextInput
          style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Detalles adicionales…"
          placeholderTextColor={SUBTLE}
          multiline
        />

        {/* Vínculos (solo uno; si vienen bloqueados, quedan activos y deshabilitados) */}
        <Chips
          title="Cuenta"
          items={accOpts}
          selected={accountId}
          onSelect={setAccountId}
          locked={!!locked.account_id}
        />
        <Chips
          title="Contacto"
          items={conOpts}
          selected={contactId}
          onSelect={setContactId}
          locked={!!locked.contact_id}
        />
        <Chips
          title="Oportunidad"
          items={dealOpts}
          selected={dealId}
          onSelect={setDealId}
          locked={!!locked.deal_id}
        />
        <Chips
          title="Lead"
          items={leadOpts}
          selected={leadId}
          onSelect={setLeadId}
          locked={!!locked.lead_id}
        />

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


// // app/tasks/new.tsx
// import { createActivity, type ActivityStatus, type ActivityType } from "@/src/api/activities";
// import { uid } from "@/src/utils";
// import { useMutation, useQueryClient } from "@tanstack/react-query";
// import { Link, Stack, router, useLocalSearchParams } from "expo-router";
// import React, { useMemo, useState } from "react";
// import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

// /* 🎨 Tema morado/cian + dark */
// const BG = "#0F1115";
// const CARD = "#171923";
// const BORDER = "#2B3140";
// const TEXT = "#F3F4F6";
// const SUBTLE = "#A4ADBD";
// const PRIMARY = "#7C3AED";
// const DANGER = "#EF4444";

// const TYPES: ActivityType[] = ["task", "call", "meeting"];
// const DEFAULT_STATUS: ActivityStatus = "open";

// export default function NewTask() {
//   // 👇 si llegamos desde cuenta/oportunidad/contacto/lead, nos pasan el id
//   const { account_id, deal_id, contact_id, lead_id } = useLocalSearchParams<{
//     account_id?: string;
//     deal_id?: string;
//     contact_id?: string;
//     lead_id?: string;
//   }>();

//   const qc = useQueryClient();

//   // campos básicos
//   const [title, setTitle] = useState("");
//   const [type, setType] = useState<ActivityType>("task");
//   const [due, setDue] = useState<string>(""); // yyyy-mm-dd (input simple)
//   const [notes, setNotes] = useState("");

//   // relación fija si vino en la URL
//   const relation = useMemo(() => {
//     if (account_id) return { kind: "account" as const, id: account_id };
//     if (deal_id)    return { kind: "deal" as const,    id: deal_id };
//     if (contact_id) return { kind: "contact" as const, id: contact_id };
//     if (lead_id)    return { kind: "lead" as const,    id: lead_id };
//     return null;
//   }, [account_id, deal_id, contact_id, lead_id]);

//   const m = useMutation({
//     mutationFn: async () => {
//       if (!title.trim()) throw new Error("Título requerido");

//       const dueDate = due ? new Date(due).getTime() : null;

//       // payload base
//       const base = {
//         id: uid(),
//         type,
//         title,
//         status: DEFAULT_STATUS,
//         notes: notes || null,
//         due_date: dueDate,
//         // relaciones (solo si vinieron)
//         account_id: relation?.kind === "account" ? relation.id : null,
//         deal_id:    relation?.kind === "deal"    ? relation.id : null,
//         contact_id: relation?.kind === "contact" ? relation.id : null,
//         lead_id:    relation?.kind === "lead"    ? relation.id : null,
//         created_at: 0,
//         updated_at: 0,
//       } as any;

//       await createActivity(base);
//     },
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["activities"] });
//       router.back();
//     },
//   });

//   return (
//     <>
//       <Stack.Screen options={{ title: "Nueva actividad" }} />
//       <View style={styles.screen}>
//         <View style={styles.card}>
//           {/* Relación fija (si llegó en la URL) */}
//           {relation ? (
//             <View style={styles.relationRow}>
//               <Text style={styles.label}>Relacionado con:</Text>
//               <Text style={styles.badge}>
//                 {relationLabel(relation.kind)} • {shortId(relation.id)}
//               </Text>
//               {/* link a limpiar e ir sin relación (opcional) */}
//               <Link href="/tasks/new" asChild>
//                 <Pressable>
//                   <Text style={styles.link}>cambiar</Text>
//                 </Pressable>
//               </Link>
//             </View>
//           ) : (
//             <Text style={styles.subtle}>
//               (Opcional) Puedes crearla “sin relación” o abrir este formulario
//               desde una Cuenta/Oportunidad/Contacto/Lead para ligarla.
//             </Text>
//           )}

//           <Text style={styles.label}>Título*</Text>
//           <TextInput
//             placeholder="Llamar a … / Reunión con …"
//             placeholderTextColor={SUBTLE}
//             value={title}
//             onChangeText={setTitle}
//             style={styles.input}
//           />

//           <Text style={styles.label}>Tipo</Text>
//           <View style={styles.typeRow}>
//             {TYPES.map((t) => {
//               const active = t === type;
//               return (
//                 <Pressable
//                   key={t}
//                   onPress={() => setType(t)}
//                   style={[styles.chip, active && styles.chipActive]}
//                 >
//                   <Text style={[styles.chipText, active && styles.chipTextActive]}>
//                     {iconByType(t)} {t}
//                   </Text>
//                 </Pressable>
//               );
//             })}
//           </View>

//           <Text style={styles.label}>Fecha límite</Text>
//           <TextInput
//             placeholder="yyyy-mm-dd"
//             placeholderTextColor={SUBTLE}
//             value={due}
//             onChangeText={setDue}
//             style={styles.input}
//           />

//           <Text style={styles.label}>Notas</Text>
//           <TextInput
//             placeholder="Detalles…"
//             placeholderTextColor={SUBTLE}
//             value={notes}
//             onChangeText={setNotes}
//             style={[styles.input, { height: 90, textAlignVertical: "top" }]}
//             multiline
//           />

//           <Pressable
//             style={[styles.btnPrimary, m.isPending && { opacity: 0.9 }]}
//             onPress={() => m.mutate()}
//             disabled={m.isPending}
//           >
//             <Text style={styles.btnText}>
//               {m.isPending ? "Guardando…" : "Guardar"}
//             </Text>
//           </Pressable>

//           <Link href="/tasks" asChild>
//             <Pressable style={styles.btnGhost}>
//               <Text style={styles.btnGhostText}>Cancelar</Text>
//             </Pressable>
//           </Link>
//         </View>
//       </View>
//     </>
//   );
// }

// function relationLabel(kind: "account" | "deal" | "contact" | "lead") {
//   if (kind === "account") return "Cuenta";
//   if (kind === "deal") return "Oportunidad";
//   if (kind === "contact") return "Contacto";
//   return "Prospecto";
// }

// function shortId(id: string) {
//   return id.length > 10 ? id.slice(0, 6) + "…" : id;
// }

// function iconByType(t: ActivityType) {
//   if (t === "call") return "📞";
//   if (t === "meeting") return "📅";
//   return "✅";
// }

// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG, padding: 16 },
//   card: {
//     backgroundColor: CARD,
//     borderWidth: 1,
//     borderColor: BORDER,
//     borderRadius: 14,
//     padding: 14,
//     gap: 10,
//   },
//   label: { color: SUBTLE, fontWeight: "700", marginTop: 2 },
//   input: {
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: "#1a1b1d",
//     borderRadius: 10,
//     padding: 12,
//     color: TEXT,
//   },

//   typeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
//   chip: {
//     paddingHorizontal: 10,
//     paddingVertical: 8,
//     borderRadius: 999,
//     backgroundColor: "#1a1b1d",
//     borderWidth: 1,
//     borderColor: BORDER,
//   },
//   chipActive: {
//     backgroundColor: "rgba(124,58,237,0.18)",
//     borderColor: PRIMARY,
//   },
//   chipText: { color: SUBTLE, fontWeight: "700", fontSize: 12 },
//   chipTextActive: { color: "#E9D5FF" },

//   relationRow: { flexDirection: "row", gap: 8, alignItems: "center" },
//   badge: {
//     color: TEXT,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: "#1a1b1d",
//     paddingHorizontal: 8,
//     paddingVertical: 3,
//     borderRadius: 999,
//     fontWeight: "800",
//     fontSize: 11,
//   } as any,
//   link: { color: PRIMARY, textDecorationLine: "underline" },

//   btnPrimary: {
//     backgroundColor: PRIMARY,
//     borderRadius: 12,
//     padding: 12,
//     alignItems: "center",
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.12)",
//   },
//   btnText: { color: "#fff", fontWeight: "900" },
//   btnGhost: {
//     marginTop: 6,
//     alignItems: "center",
//     padding: 8,
//   },
//   btnGhostText: { color: SUBTLE, fontWeight: "800" },

//   subtle: { color: SUBTLE },
// });
