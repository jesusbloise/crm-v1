// app/deals/new.tsx
import { listAccounts } from "@/src/api/accounts";
import { listContacts } from "@/src/api/contacts";
import { createDeal, DealStage } from "@/src/api/deals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

const STAGES: DealStage[] = ["nuevo","calificado","propuesta","negociacion","ganado","perdido"];
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// 🎨 Tema
const ORANGE = "#FF6A00";
const BG = "#0e0e0f";
const CARD = "#151517";
const FIELD = "#1a1b1d";
const BORDER = "#2a2a2c";
const TEXT = "#f3f4f6";
const SUBTLE = "rgba(255,255,255,0.7)";

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
        created_at: 0, // lo ignora el server
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
      <Stack.Screen options={{ title: "Nueva Oportunidad" }} />
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
            >
              <Text
                style={[styles.pillText, stage === s && styles.pillTextActive]}
              >
                {s}
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
            {accounts.map((a) => {
              const selected = accountId === a.id;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => setAccountId(selected ? undefined : a.id)}
                  style={[styles.row, selected && styles.rowActive]}
                >
                  <Text style={styles.rowTitle}>{a.name}</Text>
                  {a.phone ? <Text style={styles.rowSub}>{a.phone}</Text> : null}
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
            {contacts.map((c) => {
              const selected = contactId === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setContactId(selected ? undefined : c.id)}
                  style={[styles.row, selected && styles.rowActive]}
                >
                  <Text style={styles.rowTitle}>{c.name}</Text>
                  {c.email ? <Text style={styles.rowSub}>{c.email}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          style={styles.saveBtn}
          onPress={() => m.mutate()}
          disabled={m.isPending}
        >
          <Text style={styles.saveBtnText}>
            {m.isPending ? "Guardando..." : "Guardar"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  label: { fontWeight: "800", color: TEXT },
  section: { fontWeight: "900", marginTop: 12, fontSize: 16, color: TEXT },
  subtle: { color: SUBTLE },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 10,
    backgroundColor: FIELD,
    color: TEXT,
  },

  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: CARD,
  },
  pillActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  pillText: { fontSize: 12, color: TEXT },
  pillTextActive: { color: "#fff", fontWeight: "900" },

  listBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: CARD,
  },
  row: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  rowActive: { backgroundColor: "#241b15" }, // toque oscuro al seleccionar
  rowTitle: { fontWeight: "800", color: TEXT },
  rowSub: { fontSize: 12, color: SUBTLE },

  saveBtn: {
    backgroundColor: ORANGE,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: { color: "#fff", fontWeight: "900" },

  err: { color: "#fecaca" },
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
