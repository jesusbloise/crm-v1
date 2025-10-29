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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// 🔁 Reutilizables
import RelatedActivities from "@/src/components/RelatedActivities";
import RelatedNotes from "@/src/components/RelatedNotes";

/* 🎨 Tema */
const BG       = "#0b0c10";
const CARD     = "#14151a";
const BORDER   = "#272a33";
const TEXT     = "#e8ecf1";
const SUBTLE   = "#a9b0bd";
const ACCENT   = "#7c3aed";  // morado
const ACCENT_2 = "#22d3ee";  // cian
const DANGER   = "#ef4444";

// 👉 Secciones claras (para mantener coherencia visual)
const LIGHT_CARD   = "#ECEFF4";
const LIGHT_BORDER = "#CBD5E1";
const DARK_TEXT    = "#0F172A";

const STAGES: DealStage[] = [
  "nuevo",
  "calificado",
  "propuesta",
  "negociacion",
  "ganado",
  "perdido",
];

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
        // Los componentes Related* se actualizan solos con sus keys
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

  // Relacionados
  const account = useMemo(
    () => (qAcc.data ?? []).find((a) => a.id === qDeal.data?.account_id),
    [qAcc.data, qDeal.data?.account_id]
  );
  const contact = useMemo(
    () => (qCon.data ?? []).find((c) => c.id === qDeal.data?.contact_id),
    [qCon.data, qDeal.data?.contact_id]
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen
        options={{
          title: "Oportunidad",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
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
            {/* ——— Campos editables ——— */}
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
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    hitSlop={8}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {s}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ——— Relacionados ——— */}
            <Text style={styles.section}>Relacionados</Text>
            <View style={styles.box}>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Cuenta</Text>
                {account ? (
                  <Link href={`/accounts/${account.id}`} asChild>
                    <Pressable accessibilityRole="link" hitSlop={8}>
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
                    <Pressable accessibilityRole="link" hitSlop={8}>
                      <Text style={styles.link}>{contact.name}</Text>
                    </Pressable>
                  </Link>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>
            </View>

            {/* ——— Actividades (reutilizable) ——— */}
            <View style={[styles.box, styles.emphasisBoxLight]}>
              <Text style={styles.sectionLight}>Actividades</Text>
              <RelatedActivities filters={{ deal_id: dealId! }} />
            </View>

            {/* ——— Notas (reutilizable) ——— */}
            <View style={[styles.box, styles.emphasisBoxLight]}>
              <Text style={styles.sectionLight}>Notas</Text>
              <RelatedNotes filters={{ deal_id: dealId! }} />
            </View>

            {/* ——— Acciones ——— */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
                mSave.isPending && { opacity: 0.8 },
              ]}
              onPress={() => mSave.mutate()}
              disabled={mSave.isPending}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.primaryBtnText}>
                {mSave.isPending ? "Guardando..." : "Guardar cambios"}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.dangerBtn,
                pressed && styles.pressed,
                mDelete.isPending && { opacity: 0.8 },
              ]}
              onPress={() => mDelete.mutate()}
              disabled={mDelete.isPending}
              accessibilityRole="button"
              hitSlop={8}
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

/* ——— Styles ——— */
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
  pillActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  pillText: { fontSize: 12, color: TEXT, fontWeight: "600" },
  pillTextActive: { color: "#fff", fontWeight: "900" },

  section: { marginTop: 6, color: TEXT, fontWeight: "900", fontSize: 16 },

  box: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: CARD,
    padding: 10,
    gap: 8,
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
  link: { color: ACCENT_2, textDecorationLine: "underline", fontWeight: "800" },
  muted: { color: SUBTLE },

  // Light section title inside light boxes
  sectionLight: {
    color: DARK_TEXT,
    fontWeight: "900",
    fontSize: 16,
    paddingHorizontal: 4,
    paddingTop: 6,
  },

  // Botones principales
  primaryBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: ACCENT,
  },
  dangerBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: DANGER,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  pressed: { opacity: 0.9 },

  // —— Variantes claras (marco visual de secciones)
  emphasisBoxLight: {
    backgroundColor: LIGHT_CARD,
    borderColor: LIGHT_BORDER,
  },
});


// // app/deals/[id].tsx
// import { listAccounts } from "@/src/api/accounts";
// import { listContacts } from "@/src/api/contacts";
// import {
//   deleteDeal,
//   getDeal,
//   updateDeal,
//   type Deal,
//   type DealStage,
// } from "@/src/api/deals";

// // Activities & Notes
// import {
//   createActivity,
//   deleteActivity,
//   listActivitiesByDeal,
//   updateActivity,
//   type Activity,
// } from "@/src/api/activities";
// import {
//   createNote,
//   deleteNote,
//   listNotes, // 👈 ahora usamos el genérico
//   updateNote, // 👈 disponible si luego abres detalle de nota
//   type Note
// } from "@/src/api/notes";

// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { Link, router, Stack, useLocalSearchParams } from "expo-router";
// import React, { useEffect, useMemo, useState } from "react";
// import {
//   Pressable,
//   ScrollView,
//   StyleSheet,
//   Text,
//   TextInput,
//   View,
// } from "react-native";
// import RelatedActivities from "@/src/components/RelatedActivities";
// import RelatedNotes from "@/src/components/RelatedNotes";

// /* 🎨 Tema */
// const BG       = "#0b0c10";
// const CARD     = "#14151a";
// const BORDER   = "#272a33";
// const TEXT     = "#e8ecf1";
// const SUBTLE   = "#a9b0bd";
// const ACCENT   = "#7c3aed";  // morado
// const ACCENT_2 = "#22d3ee";  // cian
// const SUCCESS  = "#10b981";
// const DANGER   = "#ef4444";

// // 👉 Secciones claras (Actividades/Notas)
// const LIGHT_CARD   = "#ECEFF4"; // gris claro
// const LIGHT_BORDER = "#CBD5E1"; // borde claro
// const DARK_TEXT    = "#0F172A"; // texto sobre claro
// const DARK_SUBTLE  = "#475569"; // subtítulo sobre claro

// const STAGES: DealStage[] = [
//   "nuevo",
//   "calificado",
//   "propuesta",
//   "negociacion",
//   "ganado",
//   "perdido",
// ];

// export default function DealDetail() {
//   const { id } = useLocalSearchParams<{ id?: string | string[] }>();
//   const dealId = Array.isArray(id) ? id[0] : id;
//   const qc = useQueryClient();

//   // Deal + relacionados
//   const qDeal = useQuery({
//     queryKey: ["deal", dealId],
//     queryFn: () => getDeal(dealId!),
//     enabled: !!dealId,
//   });
//   const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
//   const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

//   // Actividades y notas
//   const qAct = useQuery({
//     queryKey: ["activities", dealId],
//     queryFn: () => listActivitiesByDeal(dealId!),
//     enabled: !!dealId,
//   });

//   // 👇 ahora el queryKey de notas incluye el filtro y usamos listNotes
//   const qNotes = useQuery({
//     queryKey: ["notes", { deal_id: dealId }],
//     queryFn: () => listNotes({ deal_id: dealId! }),
//     enabled: !!dealId,
//   });

//   // Estado editable del deal
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
//         qc.invalidateQueries({ queryKey: ["activities", dealId] }),
//         qc.invalidateQueries({ queryKey: ["notes", { deal_id: dealId }] }), // 👈 nota
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

//   // Relacionados
//   const account = useMemo(
//     () => (qAcc.data ?? []).find((a) => a.id === qDeal.data?.account_id),
//     [qAcc.data, qDeal.data?.account_id]
//   );
//   const contact = useMemo(
//     () => (qCon.data ?? []).find((c) => c.id === qDeal.data?.contact_id),
//     [qCon.data, qDeal.data?.contact_id]
//   );

//   // ---- Actividades (crear / toggle done / borrar) ----
//   const [newTaskTitle, setNewTaskTitle] = useState("");

//   const mCreateAct = useMutation({
//     mutationFn: async () => {
//       if (!dealId) return;
//       const t = newTaskTitle.trim();
//       if (!t) return;
//       await createActivity({
//         id: uid(),
//         type: "task",
//         title: t,
//         status: "open",
//         deal_id: dealId,
//       } as Partial<Activity>);
//     },
//     onSuccess: async () => {
//       setNewTaskTitle("");
//       await qc.invalidateQueries({ queryKey: ["activities", dealId] });
//     },
//   });

//   const mToggleDone = useMutation({
//     mutationFn: async (a: Activity) => {
//       await updateActivity(a.id, {
//         status: a.status === "open" ? "done" : "open",
//       });
//     },
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["activities", dealId] });
//     },
//   });

//   const mDelAct = useMutation({
//     mutationFn: async (id: string) => deleteActivity(id),
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["activities", dealId] });
//     },
//   });

//   // ---- Notas (crear / editar inline / borrar) ----
//   const [newNote, setNewNote] = useState("");
//   const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
//   const [editingBody, setEditingBody] = useState("");

//   const mCreateNote = useMutation({
//     mutationFn: async () => {
//       if (!dealId) return;
//       const b = newNote.trim();
//       if (!b) return;
//       await createNote({
//         id: uid(),
//         body: b,
//         deal_id: dealId,
//       } as Partial<Note>);
//     },
//     onSuccess: async () => {
//       setNewNote("");
//       await qc.invalidateQueries({ queryKey: ["notes", { deal_id: dealId }] });
//     },
//   });

//   const mEditNote = useMutation({
//     mutationFn: async () => {
//       if (!editingNoteId) return;
//       await updateNote(editingNoteId, { body: editingBody });
//     },
//     onSuccess: async () => {
//       setEditingNoteId(null);
//       setEditingBody("");
//       await qc.invalidateQueries({ queryKey: ["notes", { deal_id: dealId }] });
//     },
//   });

//   const mDelNote = useMutation({
//     mutationFn: async (id: string) => deleteNote(id),
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["notes", { deal_id: dealId }] });
//     },
//   });

//   // Métricas de actividades
//   const acts = qAct.data ?? [];
//   const openTasks = acts.filter(a => a.status !== "done").length;
//   const doneTasks = acts.filter(a => a.status === "done").length;

//   return (
//     <View style={{ flex: 1, backgroundColor: BG }}>
//       <Stack.Screen
//         options={{
//           title: "Oportunidad",
//           headerStyle: { backgroundColor: BG },
//           headerTintColor: TEXT,
//           headerTitleStyle: { color: TEXT, fontWeight: "800" },
//         }}
//       />

//       <ScrollView contentContainerStyle={styles.container}>
//         {qDeal.isLoading ? (
//           <Text style={{ color: SUBTLE }}>Cargando…</Text>
//         ) : qDeal.isError ? (
//           <Text style={{ color: "#fecaca" }}>
//             Error: {String((qDeal.error as any)?.message || qDeal.error)}
//           </Text>
//         ) : !qDeal.data ? (
//           <Text style={{ color: TEXT }}>No encontrado</Text>
//         ) : (
//           <>
//             {/* ——— Campos editables ——— */}
//             <Text style={styles.label}>Título</Text>
//             <TextInput
//               style={styles.input}
//               value={title}
//               onChangeText={setTitle}
//               placeholder="Título del deal"
//               placeholderTextColor={SUBTLE}
//             />

//             <Text style={styles.label}>Monto</Text>
//             <TextInput
//               style={styles.input}
//               value={amountText}
//               onChangeText={setAmountText}
//               keyboardType="numeric"
//               placeholder="Ej: 15000"
//               placeholderTextColor={SUBTLE}
//             />

//             <Text style={styles.label}>Etapa</Text>
//             <View style={styles.pillsRow}>
//               {STAGES.map((s) => {
//                 const active = stage === s;
//                 return (
//                   <Pressable
//                     key={s}
//                     onPress={() => setStage(s)}
//                     style={[styles.pill, active && styles.pillActive]}
//                     accessibilityRole="button"
//                     accessibilityState={{ selected: active }}
//                     hitSlop={8}
//                   >
//                     <Text style={[styles.pillText, active && styles.pillTextActive]}>
//                       {s}
//                     </Text>
//                   </Pressable>
//                 );
//               })}
//             </View>

//             {/* ——— Relacionados ——— */}
//             <Text style={styles.section}>Relacionados</Text>
//             <View style={styles.box}>
//               <View style={styles.row}>
//                 <Text style={styles.rowTitle}>Cuenta</Text>
//                 {account ? (
//                   <Link href={`/accounts/${account.id}`} asChild>
//                     <Pressable accessibilityRole="link" hitSlop={8}>
//                       <Text style={styles.link}>{account.name}</Text>
//                     </Pressable>
//                   </Link>
//                 ) : (
//                   <Text style={styles.muted}>—</Text>
//                 )}
//               </View>
//               <View style={styles.row}>
//                 <Text style={styles.rowTitle}>Contacto</Text>
//                 {contact ? (
//                   <Link href={`/contacts/${contact.id}`} asChild>
//                     <Pressable accessibilityRole="link" hitSlop={8}>
//                       <Text style={styles.link}>{contact.name}</Text>
//                     </Pressable>
//                   </Link>
//                 ) : (
//                   <Text style={styles.muted}>—</Text>
//                 )}
//               </View>
//             </View>

//             {/* ——— ACTIVIDADES (claro) ——— */}
//             <View style={[styles.headerRow]}>
//               <Text style={styles.accentTitle}>Actividades</Text>
//               <View style={styles.counters}>
//                 <Badge label="Abiertas" value={openTasks} tone="info" />
//                 <Badge label="Hechas" value={doneTasks} tone="success" />
//               </View>
//             </View>

//             <View style={[styles.box, styles.emphasisBoxLight]}>
//               {/* Crear rápida */}
//               <View style={[styles.row, styles.emphasisRowLight, { alignItems: "center", gap: 8 }]}>
//                 <TextInput
//                   style={[styles.inputLight, { flex: 1 }]}
//                   placeholder="Nueva tarea (ej: Llamar al cliente)"
//                   placeholderTextColor={DARK_SUBTLE}
//                   value={newTaskTitle}
//                   onChangeText={setNewTaskTitle}
//                 />
//                 <Pressable
//                   onPress={() => mCreateAct.mutate()}
//                   style={[styles.smallBtn, styles.primaryBtnBg, mCreateAct.isPending && { opacity: 0.7 }]}
//                   disabled={mCreateAct.isPending}
//                   accessibilityRole="button"
//                   hitSlop={8}
//                 >
//                   <Text style={styles.smallBtnText}>Crear</Text>
//                 </Pressable>
//               </View>

//               {/* Lista */}
//               {qAct.isError ? (
//                 <Text style={{ color: DANGER, padding: 12 }}>Error cargando actividades.</Text>
//               ) : (
//                 <View>
//                   {(qAct.data ?? []).map((a) => (
//                     <View key={a.id} style={[styles.row, styles.emphasisRowLight]}>
//                       <View style={{ flex: 1 }}>
//                         <Text
//                           style={[
//                             styles.rowTitleLight,
//                             a.status !== "open" && { textDecorationLine: "line-through", color: DARK_SUBTLE },
//                           ]}
//                         >
//                           {a.title}
//                         </Text>
//                         <Text style={{ color: DARK_SUBTLE, fontSize: 12 }}>
//                           {a.type} · {a.status}
//                         </Text>
//                       </View>

//                       <Pressable
//                         onPress={() => mToggleDone.mutate(a)}
//                         style={[styles.smallBtn, { backgroundColor: "#334155" }, mToggleDone.isPending && { opacity: 0.7 }]}
//                         disabled={mToggleDone.isPending}
//                         accessibilityRole="button"
//                         hitSlop={8}
//                       >
//                         <Text style={styles.smallBtnText}>
//                           {a.status === "open" ? "Hecha" : "Abrir"}
//                         </Text>
//                       </Pressable>

//                       <Pressable
//                         onPress={() => mDelAct.mutate(a.id)}
//                         style={[styles.smallBtn, { backgroundColor: DANGER }, mDelAct.isPending && { opacity: 0.7 }]}
//                         disabled={mDelAct.isPending}
//                         accessibilityRole="button"
//                         hitSlop={8}
//                       >
//                         <Text style={styles.smallBtnText}>Borrar</Text>
//                       </Pressable>
//                     </View>
//                   ))}

//                   {(qAct.data ?? []).length === 0 && (
//                     <Text style={{ color: DARK_SUBTLE, padding: 12 }}>Sin actividades todavía.</Text>
//                   )}
//                 </View>
//               )}
//             </View>

//             {/* ——— NOTAS (claro) ——— */}
//             <View style={[styles.headerRow, { marginTop: 10 }]}>
//               <Text style={styles.accentTitle}>Notas</Text>
//               <View style={styles.counters}>
//                 <Badge label="Total" value={(qNotes.data ?? []).length} tone="infoAlt" />
//               </View>
//             </View>

//             <View style={[styles.box, styles.emphasisBoxLight]}>
//               {/* Crear rápida */}
//               <View style={[styles.row, styles.emphasisRowLight, { alignItems: "center", gap: 8 }]}>
//                 <TextInput
//                   style={[styles.inputLight, { flex: 1 }]}
//                   placeholder="Escribe una nota…"
//                   placeholderTextColor={DARK_SUBTLE}
//                   value={newNote}
//                   onChangeText={setNewNote}
//                 />
//                 <Pressable
//                   onPress={() => mCreateNote.mutate()}
//                   style={[styles.smallBtn, styles.primaryBtnBg, mCreateNote.isPending && { opacity: 0.7 }]}
//                   disabled={mCreateNote.isPending}
//                   accessibilityRole="button"
//                   hitSlop={8}
//                 >
//                   <Text style={styles.smallBtnText}>Agregar</Text>
//                 </Pressable>
//               </View>

//               {qNotes.isError ? (
//                 <Text style={{ color: DANGER, padding: 12 }}>Error cargando notas.</Text>
//               ) : (
//                 <>
//                   {(qNotes.data ?? []).map((n) => {
//                     const isEditing = editingNoteId === n.id;
//                     return (
//                       <View key={n.id} style={[styles.row, styles.emphasisRowLight]}>
//                         {isEditing ? (
//                           <TextInput
//                             style={[styles.inputLight, { flex: 1 }]}
//                             value={editingBody}
//                             onChangeText={setEditingBody}
//                             placeholder="Editar nota…"
//                             placeholderTextColor={DARK_SUBTLE}
//                           />
//                         ) : (
//                           <Text style={styles.noteBodyLight}>{n.body}</Text>
//                         )}

//                         {isEditing ? (
//                           <>
//                             <Pressable
//                               onPress={() => mEditNote.mutate()}
//                               style={[styles.smallBtn, styles.primaryBtnBg, mEditNote.isPending && { opacity: 0.7 }]}
//                               disabled={mEditNote.isPending}
//                               accessibilityRole="button"
//                               hitSlop={8}
//                             >
//                               <Text style={styles.smallBtnText}>
//                                 {mEditNote.isPending ? "Guardando…" : "Guardar"}
//                               </Text>
//                             </Pressable>

//                             <Pressable
//                               onPress={() => {
//                                 setEditingNoteId(null);
//                                 setEditingBody("");
//                               }}
//                               style={[styles.smallBtn, { backgroundColor: "#64748B" }]}
//                               accessibilityRole="button"
//                               hitSlop={8}
//                             >
//                               <Text style={styles.smallBtnText}>Cancelar</Text>
//                             </Pressable>
//                           </>
//                         ) : (
//                           <>
//                             <Pressable
//                               onPress={() => {
//                                 setEditingNoteId(n.id);
//                                 setEditingBody(n.body);
//                               }}
//                               style={[styles.smallBtn, { backgroundColor: "#334155" }]}
//                               accessibilityRole="button"
//                               hitSlop={8}
//                             >
//                               <Text style={styles.smallBtnText}>Editar</Text>
//                             </Pressable>

//                             <Pressable
//                               onPress={() => mDelNote.mutate(n.id)}
//                               style={[styles.smallBtn, { backgroundColor: DANGER }, mDelNote.isPending && { opacity: 0.7 }]}
//                               disabled={mDelNote.isPending}
//                               accessibilityRole="button"
//                               hitSlop={8}
//                             >
//                               <Text style={styles.smallBtnText}>Borrar</Text>
//                             </Pressable>
//                           </>
//                         )}
//                       </View>
//                     );
//                   })}

//                   {(qNotes.data ?? []).length === 0 && (
//                     <Text style={{ color: DARK_SUBTLE, padding: 12 }}>No hay notas.</Text>
//                   )}
//                 </>
//               )}
//             </View>

//             {/* ——— Acciones ——— */}
//             <Pressable
//               style={({ pressed }) => [
//                 styles.primaryBtn,
//                 pressed && styles.pressed,
//                 mSave.isPending && { opacity: 0.8 },
//               ]}
//               onPress={() => mSave.mutate()}
//               disabled={mSave.isPending}
//               accessibilityRole="button"
//               hitSlop={8}
//             >
//               <Text style={styles.primaryBtnText}>
//                 {mSave.isPending ? "Guardando..." : "Guardar cambios"}
//               </Text>
//             </Pressable>

//             <Pressable
//               style={({ pressed }) => [
//                 styles.dangerBtn,
//                 pressed && styles.pressed,
//                 mDelete.isPending && { opacity: 0.8 },
//               ]}
//               onPress={() => mDelete.mutate()}
//               disabled={mDelete.isPending}
//               accessibilityRole="button"
//               hitSlop={8}
//             >
//               <Text style={styles.primaryBtnText}>
//                 {mDelete.isPending ? "Eliminando..." : "Eliminar"}
//               </Text>
//             </Pressable>
//           </>
//         )}
//       </ScrollView>
//     </View>
//   );
// }

// // ——— Mini UI ———
// function Badge({
//   label,
//   value,
//   tone = "info",
// }: {
//   label: string;
//   value: number;
//   tone?: "info" | "success" | "infoAlt";
// }) {
//   const toneStyle =
//     tone === "success"
//       ? { borderColor: SUCCESS, backgroundColor: "rgba(16,185,129,0.12)", color: "#d1fae5" }
//       : tone === "infoAlt"
//       ? { borderColor: ACCENT, backgroundColor: "rgba(124,58,237,0.12)", color: "#ede9fe" }
//       : { borderColor: ACCENT_2, backgroundColor: "rgba(34,211,238,0.12)", color: "#cffafe" };

//   return (
//     <View style={[styles.badge, { borderColor: (toneStyle as any).borderColor, backgroundColor: (toneStyle as any).backgroundColor }]}>
//       <Text style={[styles.badgeText, { color: (toneStyle as any).color }]}>{label}: {value}</Text>
//     </View>
//   );
// }

// // util id
// function uid() {
//   return Math.random().toString(36).slice(2) + Date.now().toString(36);
// }

// /* ——— Styles ——— */
// const styles = StyleSheet.create({
//   container: { padding: 16, gap: 12 },
//   label: { color: TEXT, fontWeight: "800" },

//   input: {
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: CARD,
//     color: TEXT,
//     borderRadius: 12,
//     padding: 12,
//   },

//   pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
//   pill: {
//     borderWidth: 1,
//     borderColor: BORDER,
//     borderRadius: 999,
//     paddingVertical: 6,
//     paddingHorizontal: 12,
//     backgroundColor: CARD,
//   },
//   pillActive: { backgroundColor: ACCENT, borderColor: ACCENT },
//   pillText: { fontSize: 12, color: TEXT, fontWeight: "600" },
//   pillTextActive: { color: "#fff", fontWeight: "900" },

//   section: { marginTop: 6, color: TEXT, fontWeight: "900", fontSize: 16 },

//   box: {
//     borderWidth: 1,
//     borderColor: BORDER,
//     borderRadius: 12,
//     overflow: "hidden",
//     backgroundColor: CARD,
//   },
//   row: {
//     padding: 12,
//     borderBottomWidth: 1,
//     borderBottomColor: BORDER,
//     flexDirection: "row",
//     justifyContent: "space-between",
//     gap: 8,
//   },
//   rowTitle: { color: TEXT, fontWeight: "800" },
//   link: { color: ACCENT_2, textDecorationLine: "underline", fontWeight: "800" },
//   muted: { color: SUBTLE },

//   // Header secciones
//   headerRow: {
//     marginTop: 8,
//     paddingHorizontal: 2,
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//   },
//   accentTitle: { color: TEXT, fontWeight: "900", fontSize: 16 },
//   counters: { flexDirection: "row", gap: 8 },
//   badge: {
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     borderRadius: 999,
//     borderWidth: 1,
//   },
//   badgeText: { fontSize: 12, fontWeight: "800" },

//   // Botones principales
//   primaryBtn: {
//     marginTop: 12,
//     paddingVertical: 14,
//     borderRadius: 12,
//     alignItems: "center",
//     backgroundColor: ACCENT,
//   },
//   dangerBtn: {
//     marginTop: 8,
//     paddingVertical: 14,
//     borderRadius: 12,
//     alignItems: "center",
//     backgroundColor: DANGER,
//   },
//   primaryBtnText: { color: "#fff", fontWeight: "900" },
//   pressed: { opacity: 0.9 },

//   // Botones pequeños
//   smallBtn: {
//     paddingVertical: 8,
//     paddingHorizontal: 12,
//     borderRadius: 10,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   smallBtnText: { color: "#fff", fontWeight: "800" },
//   primaryBtnBg: { backgroundColor: ACCENT },

//   // —— Variantes claras (Actividades/Notas)
//   emphasisBoxLight: {
//     backgroundColor: LIGHT_CARD,
//     borderColor: LIGHT_BORDER,
//   },
//   emphasisRowLight: {
//     borderBottomColor: LIGHT_BORDER,
//   },
//   rowTitleLight: {
//     color: DARK_TEXT,
//     fontWeight: "800",
//   },
//   noteBodyLight: {
//     color: DARK_TEXT,
//     flex: 1,
//   },
//   inputLight: {
//     borderWidth: 1,
//     borderColor: LIGHT_BORDER,
//     backgroundColor: "#FFFFFF",
//     color: DARK_TEXT,
//     borderRadius: 12,
//     padding: 12,
//   },
// });
