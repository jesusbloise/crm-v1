// app/deals/new.tsx
import { listAccounts } from "@/src/api/accounts";
import { listContacts } from "@/src/api/contacts";
import { createDeal, type DealStage } from "@/src/api/deals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/* Etapas */
const STAGES: DealStage[] = ["nuevo","calificado","propuesta","negociacion","ganado","perdido"];
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/* 🎨 Tema (consistente con Home y Board) */
const BG       = "#0b0c10";
const CARD     = "#14151a";
const FIELD    = "#121318";
const BORDER   = "#272a33";
const TEXT     = "#e8ecf1";
const SUBTLE   = "#a9b0bd";
const ACCENT   = "#7c3aed";   // morado principal
const ACCENT_2 = "#22d3ee";   // cian (no imprescindible aquí)
const DANGER   = "#ef4444";

/* (Opcional, por si luego usamos secciones claras)
const LIGHT_CARD   = "#ECEFF4";
const LIGHT_BORDER = "#CBD5E1";
const DARK_TEXT    = "#0F172A";
const DARK_SUBTLE  = "#475569";
*/

export default function NewDeal() {
  const qc = useQueryClient();
  const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [stage, setStage] = useState<DealStage>("nuevo");
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [contactId, setContactId] = useState<string | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      setErr(null);
      if (!title.trim()) throw new Error("Título requerido");
      await createDeal({
        id: uid(),
        title: title.trim(),
        amount: amount ? Number(amount) : undefined,
        stage,
        account_id: accountId || null,
        contact_id: contactId || null,
        close_date: null,
        created_at: 0,
        updated_at: 0,
      } as any);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["deals"] });
      router.back();
    },
    onError: (e: any) => setErr(String(e?.message || e)),
  });

  const accounts = qAcc.data ?? [];
  const contacts = useMemo(() => {
    if (!accountId) return qCon.data ?? [];
    return (qCon.data ?? []).filter((c) => c.account_id === accountId);
  }, [qCon.data, accountId]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen
        options={{
          title: "Nueva Oportunidad",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />

      <ScrollView contentContainerStyle={styles.container}>
        {err ? <Text style={styles.err}>⚠️ {err}</Text> : null}

        <Text style={styles.label}>Título *</Text>
        <TextInput
          placeholder="Ej: Propuesta CRM para Acme"
          placeholderTextColor={SUBTLE}
          style={styles.input}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Monto</Text>
        <TextInput
          placeholder="Ej: 15000"
          placeholderTextColor={SUBTLE}
          style={styles.input}
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />

        <Text style={styles.label}>Etapa</Text>
        <View style={styles.pillsRow}>
          {STAGES.map((s) => (
            <Pressable
              key={s}
              onPress={() => setStage(s)}
              style={[styles.pill, stage === s && styles.pillActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: stage === s }}
              hitSlop={8}
            >
              <Text style={[styles.pillText, stage === s && styles.pillTextActive]}>
                {labelStage(s)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Cuenta (opcional)</Text>
        {qAcc.isLoading ? (
          <Text style={styles.subtle}>Cargando cuentas…</Text>
        ) : accounts.length === 0 ? (
          <Text style={styles.subtle}>No hay cuentas.</Text>
        ) : (
          <View style={styles.listBox}>
            {accounts.map((a, idx) => {
              const selected = accountId === a.id;
              const isLast = idx === accounts.length - 1;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => setAccountId(selected ? undefined : a.id)}
                  style={[
                    styles.row,
                    !isLast && styles.rowDivider,
                    selected && styles.rowActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{a.name}</Text>
                    {a.phone ? <Text style={styles.rowSub}>{a.phone}</Text> : null}
                  </View>
                  <View style={[styles.dot, selected && styles.dotActive]} />
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.section}>Contacto (opcional)</Text>
        {qCon.isLoading ? (
          <Text style={styles.subtle}>Cargando contactos…</Text>
        ) : contacts.length === 0 ? (
          <Text style={styles.subtle}>No hay contactos.</Text>
        ) : (
          <View style={styles.listBox}>
            {contacts.map((c, idx) => {
              const selected = contactId === c.id;
              const isLast = idx === contacts.length - 1;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setContactId(selected ? undefined : c.id)}
                  style={[
                    styles.row,
                    !isLast && styles.rowDivider,
                    selected && styles.rowActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{c.name}</Text>
                    {c.email ? <Text style={styles.rowSub}>{c.email}</Text> : null}
                  </View>
                  <View style={[styles.dot, selected && styles.dotActive]} />
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            pressed && styles.pressed,
            m.isPending && { opacity: 0.9 },
          ]}
          onPress={() => m.mutate()}
          disabled={m.isPending}
          accessibilityRole="button"
        >
          <Text style={styles.saveBtnText}>
            {m.isPending ? "Guardando..." : "Guardar"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function labelStage(s: DealStage) {
  switch (s) {
    case "nuevo": return "Nuevo";
    case "calificado": return "Calificado";
    case "propuesta": return "Propuesta";
    case "negociacion": return "Negociación";
    case "ganado": return "Ganado";
    case "perdido": return "Perdido";
    default: return "—";
  }
}

const DOT_SIZE = 10;

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  label: { fontWeight: "800", color: TEXT },
  section: { fontWeight: "900", marginTop: 12, fontSize: 16, color: TEXT },
  subtle: { color: SUBTLE },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: FIELD,
    color: TEXT,
  },

  /* Chips de etapa */
  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: CARD,
  },
  pillActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  pillText: { fontSize: 12, color: TEXT, fontWeight: "700" },
  pillTextActive: { color: "#fff", fontWeight: "900" },

  /* Lista de cuentas/contactos */
  listBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: CARD,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  rowActive: {
    backgroundColor: "rgba(124,58,237,0.16)",  // tinte morado suave
    borderLeftWidth: 2,
    borderLeftColor: ACCENT,
  },
  rowTitle: { fontWeight: "800", color: TEXT },
  rowSub: { fontSize: 12, color: SUBTLE },

  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 1,
    borderColor: "#3a3f4a",
    backgroundColor: "#121318",
  },
  dotActive: { backgroundColor: ACCENT_2, borderColor: ACCENT_2 },

  /* Botón guardar (morado) */
  saveBtn: {
    backgroundColor: ACCENT,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  saveBtnText: { color: "#fff", fontWeight: "900" },

  err: { color: "#fecaca" },
  pressed: { opacity: 0.92 },
});

// // app/deals/new.tsx
// import { listAccounts } from "@/src/api/accounts";
// import { listContacts } from "@/src/api/contacts";
// import { createDeal, DealStage } from "@/src/api/deals";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { router, Stack } from "expo-router";
// import { useMemo, useState } from "react";
// import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

// const STAGES: DealStage[] = ["nuevo","calificado","propuesta","negociacion","ganado","perdido"];
// const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// export default function NewDeal() {
//   const qc = useQueryClient();
//   const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
//   const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

//   const [title, setTitle] = useState("");
//   const [amount, setAmount] = useState<string>("");
//   const [stage, setStage] = useState<DealStage>("nuevo");
//   const [accountId, setAccountId] = useState<string | undefined>(undefined);
//   const [contactId, setContactId] = useState<string | undefined>(undefined);
//   const [err, setErr] = useState<string | null>(null);

//   const m = useMutation({
//     mutationFn: async () => {
//       setErr(null);
//       if (!title.trim()) throw new Error("Título requerido");
//       await createDeal({
//         id: uid(),
//         title: title.trim(),
//         amount: amount ? Number(amount) : undefined,
//         stage,
//         account_id: accountId || null,
//         contact_id: contactId || null,
//         close_date: null,
//         created_at: 0, // server lo ignora
//         updated_at: 0,
//       } as any);
//     },
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["deals"] });
//       router.back();
//     },
//     onError: (e: any) => setErr(String(e?.message || e)),
//   });

//   const accounts = qAcc.data ?? [];
//   const contacts = useMemo(() => {
//     // Si seleccionas cuenta, filtramos contactos por esa cuenta (con fallback a todos)
//     if (!accountId) return qCon.data ?? [];
//     return (qCon.data ?? []).filter(c => c.account_id === accountId);
//   }, [qCon.data, accountId]);

//   return (
//     <View style={{ flex: 1 }}>
//       <Stack.Screen options={{ title: "Nueva Oportunidad" }} />
//       <ScrollView contentContainerStyle={styles.container}>
//         {err ? <Text style={styles.err}>⚠️ {err}</Text> : null}

//         <Text style={styles.label}>Título *</Text>
//         <TextInput
//           placeholder="Ej: Propuesta CRM para Acme"
//           style={styles.input}
//           value={title}
//           onChangeText={setTitle}
//         />

//         <Text style={styles.label}>Monto</Text>
//         <TextInput
//           placeholder="Ej: 15000"
//           style={styles.input}
//           keyboardType="numeric"
//           value={amount}
//           onChangeText={setAmount}
//         />

//         <Text style={styles.label}>Etapa</Text>
//         <View style={styles.pillsRow}>
//           {STAGES.map(s => (
//             <Pressable
//               key={s}
//               onPress={() => setStage(s)}
//               style={[styles.pill, stage === s && styles.pillActive]}
//             >
//               <Text style={[styles.pillText, stage === s && styles.pillTextActive]}>{s}</Text>
//             </Pressable>
//           ))}
//         </View>

//         <Text style={styles.section}>Cuenta (opcional)</Text>
//         {qAcc.isLoading ? (
//           <Text style={{ opacity: 0.6 }}>Cargando cuentas…</Text>
//         ) : accounts.length === 0 ? (
//           <Text style={{ opacity: 0.6 }}>No hay cuentas.</Text>
//         ) : (
//           <View style={styles.listBox}>
//             {accounts.map(a => {
//               const selected = accountId === a.id;
//               return (
//                 <Pressable
//                   key={a.id}
//                   onPress={() => setAccountId(selected ? undefined : a.id)}
//                   style={[styles.row, selected && styles.rowActive]}
//                 >
//                   <Text style={styles.rowTitle}>{a.name}</Text>
//                   {a.phone ? <Text style={styles.rowSub}>{a.phone}</Text> : null}
//                 </Pressable>
//               );
//             })}
//           </View>
//         )}

//         <Text style={styles.section}>Contacto (opcional)</Text>
//         {qCon.isLoading ? (
//           <Text style={{ opacity: 0.6 }}>Cargando contactos…</Text>
//         ) : contacts.length === 0 ? (
//           <Text style={{ opacity: 0.6 }}>No hay contactos.</Text>
//         ) : (
//           <View style={styles.listBox}>
//             {contacts.map(c => {
//               const selected = contactId === c.id;
//               return (
//                 <Pressable
//                   key={c.id}
//                   onPress={() => setContactId(selected ? undefined : c.id)}
//                   style={[styles.row, selected && styles.rowActive]}
//                 >
//                   <Text style={styles.rowTitle}>{c.name}</Text>
//                   {c.email ? <Text style={styles.rowSub}>{c.email}</Text> : null}
//                 </Pressable>
//               );
//             })}
//           </View>
//         )}

//         <Pressable
//           style={styles.saveBtn}
//           onPress={() => m.mutate()}
//           disabled={m.isPending}
//         >
//           <Text style={styles.saveBtnText}>{m.isPending ? "Guardando..." : "Guardar"}</Text>
//         </Pressable>
//       </ScrollView>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { padding: 16, gap: 12 },
//   label: { fontWeight: "700" },
//   section: { fontWeight: "800", marginTop: 12, fontSize: 16 },
//   input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 10 },
//   pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
//   pill: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
//   pillActive: { backgroundColor: "#111827", borderColor: "#111827" },
//   pillText: { fontSize: 12 },
//   pillTextActive: { color: "white", fontWeight: "700" },

//   listBox: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, overflow: "hidden" },
//   row: { padding: 10, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
//   rowActive: { backgroundColor: "#eef2ff" },
//   rowTitle: { fontWeight: "700" },
//   rowSub: { fontSize: 12, opacity: 0.7 },

//   saveBtn: { backgroundColor: "#16a34a", padding: 12, borderRadius: 10, alignItems: "center", marginTop: 8 },
//   saveBtnText: { color: "white", fontWeight: "800" },
//   err: { color: "crimson" },
// });
