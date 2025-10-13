// app/deals/[id].tsx
import { listAccounts } from "@/src/api/accounts";
import { listContacts } from "@/src/api/contacts";
import {
    deleteDeal,
    getDeal,
    updateDeal,
    type Deal,
    type DealStage,
} from "@/src/api/deals";

// 👇 NUEVO: APIs de actividades y notas
import {
    createActivity,
    deleteActivity,
    listActivitiesByDeal,
    updateActivity,
    type Activity,
} from "@/src/api/activities";
import {
    createNote,
    deleteNote,
    listNotesByDeal,
    type Note,
} from "@/src/api/notes";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";


const STAGES: DealStage[] = [
  "nuevo",
  "calificado",
  "propuesta",
  "negociacion",
  "ganado",
  "perdido",
];

// 🎨 Tema
const ORANGE = "#FF6A00";
const BG = "#0e0e0f";
const CARD = "#151517";
const BORDER = "#2a2a2c";
const TEXT = "#f3f4f6";
const SUBTLE = "rgba(255,255,255,0.7)";

export default function DealDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const dealId = Array.isArray(id) ? id[0] : id;
  const qc = useQueryClient();

  // Deal + relacionados
  const qDeal = useQuery({
    queryKey: ["deal", dealId],
    queryFn: () => getDeal(dealId!),
    enabled: !!dealId,
  });
  const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

  // Actividades del deal
  const qAct = useQuery({
    queryKey: ["activities", { dealId }],
    queryFn: () => listActivitiesByDeal(dealId!),
    enabled: !!dealId,
  });

  // Notas del deal
  const qNotes = useQuery({
    queryKey: ["notes", { dealId }],
    queryFn: () => listNotesByDeal(dealId!),
    enabled: !!dealId,
  });

  // Estado editable del deal
  const [title, setTitle] = useState("");
  const [amountText, setAmountText] = useState("");
  const [stage, setStage] = useState<DealStage>("nuevo");

  useEffect(() => {
    if (qDeal.data) {
      setTitle(qDeal.data.title ?? "");
      setAmountText(qDeal.data.amount != null ? String(qDeal.data.amount) : "");
      setStage((qDeal.data.stage as DealStage) ?? "nuevo");
    }
  }, [qDeal.data]);

  const mSave = useMutation({
    mutationFn: async () => {
      if (!dealId) return;
      await updateDeal(dealId, {
        title: title.trim(),
        amount: amountText ? Number(amountText) : null,
        stage,
      } as Partial<Deal>);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["deal", dealId] }),
        qc.invalidateQueries({ queryKey: ["deals"] }),
        qc.invalidateQueries({ queryKey: ["activities", { dealId }] }),
      ]);
    },
  });

  const mDelete = useMutation({
    mutationFn: async () => {
      if (!dealId) return;
      await deleteDeal(dealId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["deals"] });
      router.back();
    },
  });

  // Derivados
  const account = useMemo(
    () => (qAcc.data ?? []).find((a) => a.id === qDeal.data?.account_id),
    [qAcc.data, qDeal.data?.account_id]
  );
  const contact = useMemo(
    () => (qCon.data ?? []).find((c) => c.id === qDeal.data?.contact_id),
    [qCon.data, qDeal.data?.contact_id]
  );

  // ---- Actividades (crear rápido / toggle done / borrar) ----
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const mCreateAct = useMutation({
    mutationFn: async () => {
      if (!dealId) return;
      const t = newTaskTitle.trim();
      if (!t) return;
      await createActivity({
        id: uid(),
        type: "task",
        title: t,
        status: "open",
        deal_id: dealId,
      } as Partial<Activity>);
    },
    onSuccess: async () => {
      setNewTaskTitle("");
      await qc.invalidateQueries({ queryKey: ["activities", { dealId }] });
    },
  });

  const mToggleDone = useMutation({
    mutationFn: async (a: Activity) => {
      await updateActivity(a.id, { status: a.status === "open" ? "done" : "open" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["activities", { dealId }] });
    },
  });

  const mDelAct = useMutation({
    mutationFn: async (id: string) => deleteActivity(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["activities", { dealId }] });
    },
  });

  // ---- Notas (crear rápido / borrar) ----
  const [newNote, setNewNote] = useState("");

  const mCreateNote = useMutation({
    mutationFn: async () => {
      if (!dealId) return;
      const b = newNote.trim();
      if (!b) return;
      await createNote({
        id: uid(),
        body: b,
        deal_id: dealId,
      } as Partial<Note>);
    },
    onSuccess: async () => {
      setNewNote("");
      await qc.invalidateQueries({ queryKey: ["notes", { dealId }] });
    },
  });

  const mDelNote = useMutation({
    mutationFn: async (id: string) => deleteNote(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notes", { dealId }] });
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen
        options={{
          title: "Oportunidad",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT },
        }}
      />

      <ScrollView contentContainerStyle={styles.container}>
        {qDeal.isLoading ? (
          <Text style={{ color: SUBTLE }}>Cargando…</Text>
        ) : qDeal.isError ? (
          <Text style={{ color: "#fecaca" }}>
            Error: {String((qDeal.error as any)?.message || qDeal.error)}
          </Text>
        ) : !qDeal.data ? (
          <Text style={{ color: TEXT }}>No encontrado</Text>
        ) : (
          <>
            {/* Campos editables */}
            <Text style={styles.label}>Título</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Título del deal"
              placeholderTextColor={SUBTLE}
            />

            <Text style={styles.label}>Monto</Text>
            <TextInput
              style={styles.input}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="numeric"
              placeholder="Ej: 15000"
              placeholderTextColor={SUBTLE}
            />

            <Text style={styles.label}>Etapa</Text>
            <View style={styles.pillsRow}>
              {STAGES.map((s) => {
                const active = stage === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setStage(s)}
                    style={[styles.pill, active && styles.pillActive]}
                  >
                    <Text
                      style={[styles.pillText, active && styles.pillTextActive]}
                    >
                      {s}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Relacionados */}
            <Text style={styles.section}>Relacionados</Text>
            <View style={styles.box}>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Cuenta</Text>
                {account ? (
                  <Link href={`/accounts/${account.id}`} asChild>
                    <Pressable>
                      <Text style={styles.link}>{account.name}</Text>
                    </Pressable>
                  </Link>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Contacto</Text>
                {contact ? (
                  <Link href={`/contacts/${contact.id}`} asChild>
                    <Pressable>
                      <Text style={styles.link}>{contact.name}</Text>
                    </Pressable>
                  </Link>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>
            </View>

          

            {/* ----------------- ACTIVIDADES ----------------- */}
            <Text style={styles.section}>Actividades</Text>
            <View style={styles.box}>
              {/* Crear rápida */}
              <View style={[styles.row, { alignItems: "center", gap: 8 }]}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Nueva tarea (ej: Llamar al cliente)"
                  placeholderTextColor={SUBTLE}
                  value={newTaskTitle}
                  onChangeText={setNewTaskTitle}
                />
                <Pressable
                  onPress={() => mCreateAct.mutate()}
                  style={[styles.smallBtn, { backgroundColor: ORANGE }]}
                >
                  <Text style={styles.smallBtnText}>Crear</Text>
                </Pressable>
              </View>

              {/* Lista */}
              <View>
                {(qAct.data ?? []).map((a) => (
                  <View key={a.id} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.rowTitle,
                          a.status !== "open" && { textDecorationLine: "line-through", color: SUBTLE },
                        ]}
                      >
                        {a.title}
                      </Text>
                      <Text style={{ color: SUBTLE, fontSize: 12 }}>
                        {a.type} · {a.status}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => mToggleDone.mutate(a)}
                      style={[styles.smallBtn, { backgroundColor: "#374151" }]}
                    >
                      <Text style={styles.smallBtnText}>
                        {a.status === "open" ? "Hecha" : "Abrir"}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => mDelAct.mutate(a.id)}
                      style={[styles.smallBtn, { backgroundColor: "#ef4444" }]}
                    >
                      <Text style={styles.smallBtnText}>Borrar</Text>
                    </Pressable>
                  </View>
                ))}

                {(qAct.data ?? []).length === 0 && (
                  <Text style={{ color: SUBTLE, padding: 12 }}>
                    Sin actividades todavía.
                  </Text>
                )}
              </View>
            </View>

            {/* ----------------- NOTAS ----------------- */}
            <Text style={styles.section}>Notas</Text>
            <View style={styles.box}>
              <View style={[styles.row, { alignItems: "center", gap: 8 }]}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Escribe una nota…"
                  placeholderTextColor={SUBTLE}
                  value={newNote}
                  onChangeText={setNewNote}
                />
                <Pressable
                  onPress={() => mCreateNote.mutate()}
                  style={[styles.smallBtn, { backgroundColor: ORANGE }]}
                >
                  <Text style={styles.smallBtnText}>Agregar</Text>
                </Pressable>
              </View>

              {(qNotes.data ?? []).map((n) => (
                <View key={n.id} style={styles.row}>
                  <Text style={{ color: TEXT, flex: 1 }}>{n.body}</Text>
                  <Pressable
                    onPress={() => mDelNote.mutate(n.id)}
                    style={[styles.smallBtn, { backgroundColor: "#ef4444" }]}
                  >
                    <Text style={styles.smallBtnText}>Borrar</Text>
                  </Pressable>
                </View>
              ))}

              {(qNotes.data ?? []).length === 0 && (
                <Text style={{ color: SUBTLE, padding: 12 }}>
                  No hay notas.
                </Text>
              )}
            </View>
              {/* Acciones */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
              ]}
              onPress={() => mSave.mutate()}
              disabled={mSave.isPending}
            >
              <Text style={styles.primaryBtnText}>
                {mSave.isPending ? "Guardando..." : "Guardar cambios"}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.dangerBtn,
                pressed && styles.pressed,
              ]}
              onPress={() => mDelete.mutate()}
              disabled={mDelete.isPending}
            >
              <Text style={styles.primaryBtnText}>
                {mDelete.isPending ? "Eliminando..." : "Eliminar"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// util id
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  label: { color: TEXT, fontWeight: "800" },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    color: TEXT,
    borderRadius: 12,
    padding: 12,
  },

  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: CARD,
  },
  pillActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  pillText: { fontSize: 12, color: TEXT, fontWeight: "600" },
  pillTextActive: { color: "#fff", fontWeight: "900" },

  section: { marginTop: 6, color: TEXT, fontWeight: "900", fontSize: 16 },

  box: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: CARD,
  },
  row: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  rowTitle: { color: TEXT, fontWeight: "800" },
  link: { color: ORANGE, textDecorationLine: "underline", fontWeight: "800" },
  muted: { color: SUBTLE },

  primaryBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: ORANGE,
  },
  dangerBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#ef4444",
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  pressed: { opacity: 0.9 },

  smallBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  smallBtnText: { color: "#fff", fontWeight: "800" },
});


// // app/deals/[id].tsx
// import { listAccounts } from "@/src/api/accounts";
// import { listContacts } from "@/src/api/contacts";
// import { deleteDeal, getDeal, updateDeal, type Deal, type DealStage } from "@/src/api/deals";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { Link, router, Stack, useLocalSearchParams } from "expo-router";
// import { useEffect, useMemo, useState } from "react";
// import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

// const STAGES: DealStage[] = ["nuevo","calificado","propuesta","negociacion","ganado","perdido"];

// export default function DealDetail() {
//   const { id } = useLocalSearchParams<{ id?: string | string[] }>();
//   const dealId = Array.isArray(id) ? id[0] : id;
//   const qc = useQueryClient();

//   const qDeal = useQuery({
//     queryKey: ["deal", dealId],
//     queryFn: () => getDeal(dealId!),
//     enabled: !!dealId,
//   });
//   const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
//   const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

//   // Estado editable
//   const [title, setTitle] = useState("");
//   const [amountText, setAmountText] = useState("");
//   const [stage, setStage] = useState<DealStage>("nuevo");

//   useEffect(() => {
//     if (qDeal.data) {
//       setTitle(qDeal.data.title ?? "");
//       setAmountText(qDeal.data.amount != null ? String(qDeal.data.amount) : "");
//       setStage((qDeal.data.stage as DealStage) ?? "nuevo");
//     }
//   }, [qDeal.data]);

//   const mSave = useMutation({
//     mutationFn: async () => {
//       if (!dealId) return;
//       await updateDeal(dealId, {
//         title: title.trim(),
//         amount: amountText ? Number(amountText) : null,
//         stage,
//       } as Partial<Deal>);
//     },
//     onSuccess: async () => {
//       await Promise.all([
//         qc.invalidateQueries({ queryKey: ["deal", dealId] }),
//         qc.invalidateQueries({ queryKey: ["deals"] }),
//       ]);
//     },
//   });

//   const mDelete = useMutation({
//     mutationFn: async () => {
//       if (!dealId) return;
//       await deleteDeal(dealId);
//     },
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["deals"] });
//       router.back();
//     },
//   });

//   // Derivados para mostrar nombres de cuenta/contacto y linkear
//   const account = useMemo(
//     () => (qAcc.data ?? []).find(a => a.id === qDeal.data?.account_id),
//     [qAcc.data, qDeal.data?.account_id]
//   );
//   const contact = useMemo(
//     () => (qCon.data ?? []).find(c => c.id === qDeal.data?.contact_id),
//     [qCon.data, qDeal.data?.contact_id]
//   );

//   return (
//     <View style={{ flex: 1 }}>
//       <Stack.Screen options={{ title: "Oportunidad" }} />
//       <ScrollView contentContainerStyle={styles.container}>
//         {qDeal.isLoading ? (
//           <Text style={{ opacity: 0.7 }}>Cargando…</Text>
//         ) : qDeal.isError ? (
//           <Text style={{ color: "crimson" }}>
//             Error: {String((qDeal.error as any)?.message || qDeal.error)}
//           </Text>
//         ) : !qDeal.data ? (
//           <Text>No encontrado</Text>
//         ) : (
//           <>
//             {/* Campos editables */}
//             <Text style={styles.label}>Título</Text>
//             <TextInput
//               style={styles.input}
//               value={title}
//               onChangeText={setTitle}
//               placeholder="Título del deal"
//             />

//             <Text style={styles.label}>Monto</Text>
//             <TextInput
//               style={styles.input}
//               value={amountText}
//               onChangeText={setAmountText}
//               keyboardType="numeric"
//               placeholder="Ej: 15000"
//             />

//             <Text style={styles.label}>Etapa</Text>
//             <View style={styles.pillsRow}>
//               {STAGES.map(s => (
//                 <Pressable
//                   key={s}
//                   onPress={() => setStage(s)}
//                   style={[styles.pill, stage === s && styles.pillActive]}
//                 >
//                   <Text style={[styles.pillText, stage === s && styles.pillTextActive]}>{s}</Text>
//                 </Pressable>
//               ))}
//             </View>

//             {/* Relacionados (solo vista + link) */}
//             <Text style={styles.section}>Relacionados</Text>
//             <View style={styles.box}>
//               <View style={styles.row}>
//                 <Text style={styles.rowTitle}>Cuenta</Text>
//                 {account ? (
//                   <Link href={`/accounts/${account.id}`} asChild>
//                     <Pressable><Text style={styles.link}>{account.name}</Text></Pressable>
//                   </Link>
//                 ) : (
//                   <Text style={styles.muted}>—</Text>
//                 )}
//               </View>
//               <View style={styles.row}>
//                 <Text style={styles.rowTitle}>Contacto</Text>
//                 {contact ? (
//                   <Link href={`/contacts/${contact.id}`} asChild>
//                     <Pressable><Text style={styles.link}>{contact.name}</Text></Pressable>
//                   </Link>
//                 ) : (
//                   <Text style={styles.muted}>—</Text>
//                 )}
//               </View>
//             </View>

//             {/* Acciones */}
//             <Pressable
//               style={[styles.btn, { backgroundColor: "#16a34a" }]}
//               onPress={() => mSave.mutate()}
//               disabled={mSave.isPending}
//             >
//               <Text style={styles.btnText}>{mSave.isPending ? "Guardando..." : "Guardar cambios"}</Text>
//             </Pressable>

//             <Pressable
//               style={[styles.btn, { backgroundColor: "#ef4444" }]}
//               onPress={() => mDelete.mutate()}
//               disabled={mDelete.isPending}
//             >
//               <Text style={styles.btnText}>{mDelete.isPending ? "Eliminando..." : "Eliminar"}</Text>
//             </Pressable>
//           </>
//         )}
//       </ScrollView>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { padding: 16, gap: 12 },
//   label: { fontWeight: "700" },
//   input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 10 },
//   pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
//   pill: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
//   pillActive: { backgroundColor: "#111827", borderColor: "#111827" },
//   pillText: { fontSize: 12 },
//   pillTextActive: { color: "white", fontWeight: "700" },

//   section: { marginTop: 10, fontWeight: "800", fontSize: 16 },
//   box: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, overflow: "hidden" },
//   row: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", flexDirection: "row", justifyContent: "space-between" },
//   rowTitle: { fontWeight: "700" },
//   link: { color: "#1e90ff", textDecorationLine: "underline", fontWeight: "700" },
//   muted: { opacity: 0.6 },

//   btn: { marginTop: 12, padding: 12, borderRadius: 10, alignItems: "center" },
//   btnText: { color: "white", fontWeight: "800" },
// });
