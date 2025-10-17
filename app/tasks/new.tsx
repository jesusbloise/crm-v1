// app/tasks/new.tsx
import { createActivity, type ActivityStatus, type ActivityType } from "@/src/api/activities";
import { uid } from "@/src/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Stack, router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

/* 🎨 Tema morado/cian + dark */
const BG = "#0F1115";
const CARD = "#171923";
const BORDER = "#2B3140";
const TEXT = "#F3F4F6";
const SUBTLE = "#A4ADBD";
const PRIMARY = "#7C3AED";
const DANGER = "#EF4444";

const TYPES: ActivityType[] = ["task", "call", "meeting"];
const DEFAULT_STATUS: ActivityStatus = "open";

export default function NewTask() {
  // 👇 si llegamos desde cuenta/oportunidad/contacto/lead, nos pasan el id
  const { account_id, deal_id, contact_id, lead_id } = useLocalSearchParams<{
    account_id?: string;
    deal_id?: string;
    contact_id?: string;
    lead_id?: string;
  }>();

  const qc = useQueryClient();

  // campos básicos
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ActivityType>("task");
  const [due, setDue] = useState<string>(""); // yyyy-mm-dd (input simple)
  const [notes, setNotes] = useState("");

  // relación fija si vino en la URL
  const relation = useMemo(() => {
    if (account_id) return { kind: "account" as const, id: account_id };
    if (deal_id)    return { kind: "deal" as const,    id: deal_id };
    if (contact_id) return { kind: "contact" as const, id: contact_id };
    if (lead_id)    return { kind: "lead" as const,    id: lead_id };
    return null;
  }, [account_id, deal_id, contact_id, lead_id]);

  const m = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Título requerido");

      const dueDate = due ? new Date(due).getTime() : null;

      // payload base
      const base = {
        id: uid(),
        type,
        title,
        status: DEFAULT_STATUS,
        notes: notes || null,
        due_date: dueDate,
        // relaciones (solo si vinieron)
        account_id: relation?.kind === "account" ? relation.id : null,
        deal_id:    relation?.kind === "deal"    ? relation.id : null,
        contact_id: relation?.kind === "contact" ? relation.id : null,
        lead_id:    relation?.kind === "lead"    ? relation.id : null,
        created_at: 0,
        updated_at: 0,
      } as any;

      await createActivity(base);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["activities"] });
      router.back();
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: "Nueva actividad" }} />
      <View style={styles.screen}>
        <View style={styles.card}>
          {/* Relación fija (si llegó en la URL) */}
          {relation ? (
            <View style={styles.relationRow}>
              <Text style={styles.label}>Relacionado con:</Text>
              <Text style={styles.badge}>
                {relationLabel(relation.kind)} • {shortId(relation.id)}
              </Text>
              {/* link a limpiar e ir sin relación (opcional) */}
              <Link href="/tasks/new" asChild>
                <Pressable>
                  <Text style={styles.link}>cambiar</Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            <Text style={styles.subtle}>
              (Opcional) Puedes crearla “sin relación” o abrir este formulario
              desde una Cuenta/Oportunidad/Contacto/Lead para ligarla.
            </Text>
          )}

          <Text style={styles.label}>Título*</Text>
          <TextInput
            placeholder="Llamar a … / Reunión con …"
            placeholderTextColor={SUBTLE}
            value={title}
            onChangeText={setTitle}
            style={styles.input}
          />

          <Text style={styles.label}>Tipo</Text>
          <View style={styles.typeRow}>
            {TYPES.map((t) => {
              const active = t === type;
              return (
                <Pressable
                  key={t}
                  onPress={() => setType(t)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {iconByType(t)} {t}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Fecha límite</Text>
          <TextInput
            placeholder="yyyy-mm-dd"
            placeholderTextColor={SUBTLE}
            value={due}
            onChangeText={setDue}
            style={styles.input}
          />

          <Text style={styles.label}>Notas</Text>
          <TextInput
            placeholder="Detalles…"
            placeholderTextColor={SUBTLE}
            value={notes}
            onChangeText={setNotes}
            style={[styles.input, { height: 90, textAlignVertical: "top" }]}
            multiline
          />

          <Pressable
            style={[styles.btnPrimary, m.isPending && { opacity: 0.9 }]}
            onPress={() => m.mutate()}
            disabled={m.isPending}
          >
            <Text style={styles.btnText}>
              {m.isPending ? "Guardando…" : "Guardar"}
            </Text>
          </Pressable>

          <Link href="/tasks" asChild>
            <Pressable style={styles.btnGhost}>
              <Text style={styles.btnGhostText}>Cancelar</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </>
  );
}

function relationLabel(kind: "account" | "deal" | "contact" | "lead") {
  if (kind === "account") return "Cuenta";
  if (kind === "deal") return "Oportunidad";
  if (kind === "contact") return "Contacto";
  return "Prospecto";
}

function shortId(id: string) {
  return id.length > 10 ? id.slice(0, 6) + "…" : id;
}

function iconByType(t: ActivityType) {
  if (t === "call") return "📞";
  if (t === "meeting") return "📅";
  return "✅";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16 },
  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  label: { color: SUBTLE, fontWeight: "700", marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#1a1b1d",
    borderRadius: 10,
    padding: 12,
    color: TEXT,
  },

  typeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#1a1b1d",
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: {
    backgroundColor: "rgba(124,58,237,0.18)",
    borderColor: PRIMARY,
  },
  chipText: { color: SUBTLE, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#E9D5FF" },

  relationRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  badge: {
    color: TEXT,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#1a1b1d",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    fontWeight: "800",
    fontSize: 11,
  } as any,
  link: { color: PRIMARY, textDecorationLine: "underline" },

  btnPrimary: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  btnText: { color: "#fff", fontWeight: "900" },
  btnGhost: {
    marginTop: 6,
    alignItems: "center",
    padding: 8,
  },
  btnGhostText: { color: SUBTLE, fontWeight: "800" },

  subtle: { color: SUBTLE },
});

// // app/tasks/new.tsx
// import { createActivity, type ActivityStatus, type ActivityType } from "@/src/api/activities";
// import { uid } from "@/src/utils";
// import { useMutation, useQueryClient } from "@tanstack/react-query";
// import { Stack, router } from "expo-router";
// import React, { useState } from "react";
// import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

// /* 🎨 Tema */
// const ORANGE = "#FF6A00";
// const BG = "#0e0e0f";
// const CARD = "#151517";
// const BORDER = "#2a2a2c";
// const TEXT = "#f3f4f6";
// const SUBTLE = "rgba(255,255,255,0.7)";

// export default function NewTask() {
//   const qc = useQueryClient();

//   const [title, setTitle] = useState("");
//   const [type, setType] = useState<ActivityType>("task");
//   const [status, setStatus] = useState<ActivityStatus>("open");
//   const [due, setDue] = useState<string>(""); // yyyy-mm-dd
//   const [notes, setNotes] = useState("");

//   const m = useMutation({
//     mutationFn: async () => {
//       if (!title.trim()) throw new Error("Título requerido");
//       const due_ts = due ? new Date(due).getTime() : null;
//       await createActivity({
//         id: uid(),
//         title: title.trim(),
//         type,
//         status,
//         due_date: due_ts,
//         notes: notes || null,
//         account_id: null,
//         contact_id: null,
//         lead_id: null,
//         deal_id: null,
//         created_at: 0,
//         updated_at: 0,
//       } as any);
//     },
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["activities"] });
//       router.back();
//     },
//   });

//   return (
//     <>
//       <Stack.Screen options={{ title: "Nueva Actividad" }} />
//       <View style={styles.screen}>
//         <View style={styles.card}>
//           <TextInput
//             placeholder="Título*"
//             placeholderTextColor={SUBTLE}
//             style={styles.input}
//             value={title}
//             onChangeText={setTitle}
//           />

//           {/* Selectores simples */}
//           <Row>
//             <Pill active={type==="task"} onPress={()=>setType("task")}>Tarea</Pill>
//             <Pill active={type==="call"} onPress={()=>setType("call")}>Llamada</Pill>
//             <Pill active={type==="meeting"} onPress={()=>setType("meeting")}>Reunión</Pill>
//           </Row>

//           <Row>
//             <Pill active={status==="open"} onPress={()=>setStatus("open")}>Abierta</Pill>
//             <Pill active={status==="done"} onPress={()=>setStatus("done")}>Hecha</Pill>
//             <Pill active={status==="canceled"} onPress={()=>setStatus("canceled")}>Cancelada</Pill>
//           </Row>

//           <TextInput
//             placeholder="Fecha límite (YYYY-MM-DD)"
//             placeholderTextColor={SUBTLE}
//             style={styles.input}
//             value={due}
//             onChangeText={setDue}
//           />

//           <TextInput
//             placeholder="Notas"
//             placeholderTextColor={SUBTLE}
//             style={[styles.input, { height: 90, textAlignVertical: "top" }]}
//             value={notes}
//             onChangeText={setNotes}
//             multiline
//           />

//           {m.isError ? (
//             <Text style={{ color: "#fecaca" }}>{(m.error as any)?.message || "Error"}</Text>
//           ) : null}

//           <Pressable
//             onPress={() => m.mutate()}
//             disabled={m.isPending}
//             style={[styles.btn, m.isPending && { opacity: 0.8 }]}
//           >
//             <Text style={styles.btnText}>{m.isPending ? "Guardando…" : "Guardar"}</Text>
//           </Pressable>
//         </View>
//       </View>
//     </>
//   );
// }

// function Row({ children }: { children: React.ReactNode }) {
//   return <View style={{ flexDirection: "row", gap: 8 }}>{children}</View>;
// }
// function Pill({ children, active, onPress }:{children:React.ReactNode;active:boolean;onPress:()=>void}) {
//   return (
//     <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
//       <Text style={[styles.pillText, active && styles.pillTextActive]}>{children}</Text>
//     </Pressable>
//   );
// }

// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG, padding: 16 },
//   card: {
//     backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
//     borderRadius: 14, padding: 14, gap: 12,
//   },
//   input: {
//     borderWidth: 1, borderColor: BORDER, backgroundColor: "#1a1b1d",
//     borderRadius: 10, padding: 12, color: TEXT,
//   },
//   pill: {
//     paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999,
//     backgroundColor: "#1a1b1d", borderWidth: 1, borderColor: BORDER,
//   },
//   pillActive: { backgroundColor: "rgba(124,58,237,0.20)", borderColor: "#7C3AED" },
//   pillText: { color: SUBTLE, fontWeight: "700", fontSize: 12 },
//   pillTextActive: { color: "#E9D5FF" },

//   btn: {
//     marginTop: 4, backgroundColor: ORANGE, paddingVertical: 12,
//     borderRadius: 10, alignItems: "center",
//   },
//   btnText: { color: "#fff", fontWeight: "900" },
// });
