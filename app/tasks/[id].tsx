import { listAccounts } from "@/src/api/accounts";
import {
    deleteActivity,
    getActivity,
    updateActivity,
    type Activity,
    type ActivityStatus,
} from "@/src/api/activities";
import { listContacts } from "@/src/api/contacts";
import { listDeals } from "@/src/api/deals";
import { listLeads } from "@/src/api/leads"; // 👈 asegúrate que existe (como los otros list*)
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

/* 🎨 Paleta pro morado/cian (consistente) */
const PRIMARY = "#7C3AED";  // morado acciones
const ACCENT  = "#22D3EE";  // cian detalles
const BG      = "#0F1115";  // fondo
const CARD    = "#171923";  // tarjetas
const BORDER  = "#2B3140";  // bordes
const TEXT    = "#F3F4F6";  // texto principal
const SUBTLE  = "#A4ADBD";  // subtítulos
const DANGER  = "#EF4444";  // eliminar/errores

const FLOW: ActivityStatus[] = ["open", "done", "canceled"];

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  const qAct = useQuery<Activity>({
    queryKey: ["activity", id],
    queryFn: () => getActivity(id!),
    enabled: !!id,
  });

  // 👇 catálogos mínimos para resolver nombres de contexto (solo lectura)
  const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
  const qDeal = useQuery({ queryKey: ["deals"], queryFn: listDeals });
  const qLead = useQuery({ queryKey: ["leads"], queryFn: listLeads });

  const nextStatus = (s?: ActivityStatus): ActivityStatus => {
    const i = Math.max(0, FLOW.indexOf(s ?? "open"));
    return FLOW[(i + 1) % FLOW.length];
  };

  const mStatus = useMutation({
    mutationFn: async () =>
      updateActivity(id!, { status: nextStatus(qAct.data?.status as ActivityStatus) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["activity", id] });
      await qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });

  const mDelete = useMutation({
    mutationFn: async () => deleteActivity(id!),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["activities"] });
      router.back();
    },
  });

  // —— Resolver chips de contexto (nombre + href) ——
  const contextChips = useMemo(() => {
    const a = qAct.data;
    if (!a) return [];

    const chips: { label: string; href: string }[] = [];

    if (a.account_id) {
      const name = (qAcc.data ?? []).find(x => x.id === a.account_id)?.name ?? a.account_id;
      chips.push({ label: `Cuenta: ${name}`, href: `/accounts/${a.account_id}` });
    }
    if (a.contact_id) {
      const name = (qCon.data ?? []).find(x => x.id === a.contact_id)?.name ?? a.contact_id;
      chips.push({ label: `Contacto: ${name}`, href: `/contacts/${a.contact_id}` });
    }
    if (a.deal_id) {
      const name = (qDeal.data ?? []).find(x => x.id === a.deal_id)?.title ?? a.deal_id;
      chips.push({ label: `Oportunidad: ${name}`, href: `/deals/${a.deal_id}` });
    }
    if (a.lead_id) {
      const name = (qLead.data ?? []).find(x => x.id === a.lead_id)?.name ?? a.lead_id;
      chips.push({ label: `Lead: ${name}`, href: `/leads/${a.lead_id}` });
    }
    return chips;
  }, [qAct.data, qAcc.data, qCon.data, qDeal.data, qLead.data]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Detalle Actividad",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />

      <View style={styles.screen}>
        {qAct.isLoading ? (
          <Text style={styles.subtle}>Cargando…</Text>
        ) : qAct.isError ? (
          <Text style={styles.error}>
            Error: {String((qAct.error as any)?.message || qAct.error)}
          </Text>
        ) : !qAct.data ? (
          <Text style={styles.subtle}>No encontrado</Text>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.title}>
                {iconByType(qAct.data.type)} {qAct.data.title}
              </Text>

              {/* Chips de tipo/estado */}
              <View style={styles.rowWrap}>
                <Text style={[styles.badgeSoft, badgeByType(qAct.data.type)]}>
                  {labelByType(qAct.data.type)}
                </Text>
                <Text style={[styles.badgeSoft, badgeByStatus(qAct.data.status)]}>
                  {labelByStatus(qAct.data.status)}
                </Text>
              </View>

              {/* Fecha / Notas */}
              <Text style={styles.item}>
                <Text style={styles.itemLabel}>Vence: </Text>
                <Text style={styles.itemValue}>
                  {qAct.data.due_date ? new Date(qAct.data.due_date).toLocaleDateString() : "—"}
                </Text>
              </Text>
              {!!qAct.data.notes && (
                <Text style={styles.item}>
                  <Text style={styles.itemLabel}>Notas: </Text>
                  <Text style={styles.itemValue}>{qAct.data.notes}</Text>
                </Text>
              )}

              {/* 👇 Chips de contexto (navegables si existen IDs) */}
              {contextChips.length > 0 && (
                <View style={{ marginTop: 6, gap: 6 }}>
                  <Text style={[styles.itemLabel, { marginBottom: 2 }]}>Relacionado con</Text>
                  <View style={styles.chipsRow}>
                    {contextChips.map((c) => (
                      <Link key={c.href} href={c.href} asChild>
                        <Pressable style={styles.chip} accessibilityRole="link" hitSlop={8}>
                          <Text style={styles.chipText}>{c.label}</Text>
                        </Pressable>
                      </Link>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <Pressable
              style={[styles.btn, styles.btnPrimary, (mStatus.isPending || qAct.isFetching) && { opacity: 0.9 }]}
              onPress={() => mStatus.mutate()}
              disabled={mStatus.isPending}
            >
              <Text style={styles.btnText}>
                {mStatus.isPending ? "Actualizando…" : "Cambiar estado"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.btnDanger, mDelete.isPending && { opacity: 0.9 }]}
              onPress={() => mDelete.mutate()}
              disabled={mDelete.isPending}
            >
              <Text style={styles.btnText}>
                {mDelete.isPending ? "Eliminando…" : "Eliminar"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </>
  );
}

/* ——— Helpers UI ——— */
function iconByType(t: "task" | "call" | "meeting") {
  if (t === "call") return "📞";
  if (t === "meeting") return "📅";
  return "✅";
}
function labelByType(t: "task" | "call" | "meeting") {
  if (t === "call") return "Llamada";
  if (t === "meeting") return "Reunión";
  return "Tarea";
}
function labelByStatus(s: ActivityStatus) {
  if (s === "open") return "Abierta";
  if (s === "done") return "Completada";
  return "Cancelada";
}
function badgeByType(t: "task" | "call" | "meeting") {
  const base = { borderColor: "#2d3340", backgroundColor: "rgba(255,255,255,0.04)", color: TEXT };
  if (t === "call")    return { ...base, borderColor: ACCENT,  backgroundColor: "rgba(34,211,238,0.10)" };
  if (t === "meeting") return { ...base, borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.12)" };
  return { ...base, borderColor: PRIMARY, backgroundColor: "rgba(124,58,237,0.10)" };
}
function badgeByStatus(s: ActivityStatus) {
  const base = { borderColor: "#2d3340", backgroundColor: "rgba(255,255,255,0.04)", color: TEXT };
  if (s === "open")     return { ...base, borderColor: PRIMARY, backgroundColor: "rgba(124,58,237,0.10)" };
  if (s === "done")     return { ...base, borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.12)" };
  return { ...base, borderColor: DANGER, backgroundColor: "rgba(239,68,68,0.10)" };
}

/* ——— Estilos ——— */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },
  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  title: { fontSize: 20, fontWeight: "900", color: TEXT },

  rowWrap: { flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" },

  item: { color: SUBTLE },
  itemLabel: { color: SUBTLE, fontWeight: "700" },
  itemValue: { color: TEXT, fontWeight: "700" },

  // pills
  badgeSoft: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: TEXT,
  } as any,

  // chips de contexto (links)
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#1a1b2a",
  },
  chipText: { color: "#E5E7EB", fontWeight: "800", fontSize: 12 },

  btn: { padding: 12, borderRadius: 12, alignItems: "center" },
  btnPrimary: {
    backgroundColor: PRIMARY,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  btnDanger: { backgroundColor: DANGER },

  btnText: { color: "#fff", fontWeight: "900" },

  subtle: { color: SUBTLE },
  error: { color: "#fecaca" },
});


// import { getAccount } from "@/src/api/accounts";
// import {
//     deleteActivity,
//     getActivity,
//     updateActivity,
//     type Activity,
//     type ActivityStatus,
// } from "@/src/api/activities";
// import { getContact } from "@/src/api/contacts";
// import { getDeal } from "@/src/api/deals";
// import { getLead } from "@/src/api/leads";

// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { Link, router, Stack, useLocalSearchParams } from "expo-router";
// import React from "react";
// import { Pressable, StyleSheet, Text, View } from "react-native";

// /* 🎨 Paleta pro morado/cian (consistente) */
// const PRIMARY = "#7C3AED";  // morado acciones
// const ACCENT  = "#22D3EE";  // cian detalles
// const BG      = "#0F1115";  // fondo
// const CARD    = "#171923";  // tarjetas
// const BORDER  = "#2B3140";  // bordes
// const TEXT    = "#F3F4F6";  // texto principal
// const SUBTLE  = "#A4ADBD";  // subtítulos
// const DANGER  = "#EF4444";  // eliminar/errores

// const FLOW: ActivityStatus[] = ["open", "done", "canceled"];

// export default function TaskDetail() {
//   const { id } = useLocalSearchParams<{ id: string }>();
//   const qc = useQueryClient();

//   const q = useQuery<Activity>({
//     queryKey: ["activity", id],
//     queryFn: () => getActivity(id!),
//     enabled: !!id,
//   });

//   // —— Cargas condicionales de relaciones (por nombre) ——
//   const accountQ = useQuery({
//     queryKey: ["account", q.data?.account_id],
//     queryFn: () => getAccount(q.data!.account_id!),
//     enabled: !!q.data?.account_id,
//   });
//   const dealQ = useQuery({
//     queryKey: ["deal", q.data?.deal_id],
//     queryFn: () => getDeal(q.data!.deal_id!),
//     enabled: !!q.data?.deal_id,
//   });
//   const contactQ = useQuery({
//     queryKey: ["contact", q.data?.contact_id],
//     queryFn: () => getContact(q.data!.contact_id!),
//     enabled: !!q.data?.contact_id,
//   });
//   const leadQ = useQuery({
//     queryKey: ["lead", q.data?.lead_id],
//     queryFn: () => getLead(q.data!.lead_id!),
//     enabled: !!q.data?.lead_id,
//   });

//   const nextStatus = (s?: ActivityStatus): ActivityStatus => {
//     const i = Math.max(0, FLOW.indexOf(s ?? "open"));
//     return FLOW[(i + 1) % FLOW.length];
//   };

//   const mStatus = useMutation({
//     mutationFn: async () =>
//       updateActivity(id!, { status: nextStatus(q.data?.status as ActivityStatus) }),
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["activity", id] });
//       await qc.invalidateQueries({ queryKey: ["activities"] });
//     },
//   });

//   const mDelete = useMutation({
//     mutationFn: async () => deleteActivity(id!),
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["activities"] });
//       router.back();
//     },
//   });

//   return (
//     <>
//       <Stack.Screen
//         options={{
//           title: "Detalle Actividad",
//           headerStyle: { backgroundColor: BG },
//           headerTintColor: TEXT,
//           headerTitleStyle: { color: TEXT, fontWeight: "800" },
//         }}
//       />

//       <View style={styles.screen}>
//         {q.isLoading ? (
//           <Text style={styles.subtle}>Cargando…</Text>
//         ) : q.isError ? (
//           <Text style={styles.error}>
//             Error: {String((q.error as any)?.message || q.error)}
//           </Text>
//         ) : !q.data ? (
//           <Text style={styles.subtle}>No encontrado</Text>
//         ) : (
//           <>
//             <View style={styles.card}>
//               <Text style={styles.title}>
//                 {iconByType(q.data.type)} {q.data.title}
//               </Text>

//               {/* 🔗 Relacionados por NOMBRE (si existen) */}
//               <View style={styles.relRow}>
//                 {accountQ.data && (
//                   <Link
//                     href={{ pathname: "/accounts/[id]", params: { id: accountQ.data.id } }}
//                     asChild
//                   >
//                     <Pressable>
//                       <Text style={styles.badgeLink}>
//                         Cuenta • {accountQ.data.name}
//                       </Text>
//                     </Pressable>
//                   </Link>
//                 )}
//                 {dealQ.data && (
//                   <Link
//                     href={{ pathname: "/deals/[id]", params: { id: dealQ.data.id } }}
//                     asChild
//                   >
//                     <Pressable>
//                       <Text style={styles.badgeLink}>
//                         Oportunidad • {dealQ.data.title}
//                       </Text>
//                     </Pressable>
//                   </Link>
//                 )}
//                 {contactQ.data && (
//                   <Link
//                     href={{ pathname: "/contacts/[id]", params: { id: contactQ.data.id } }}
//                     asChild
//                   >
//                     <Pressable>
//                       <Text style={styles.badgeLink}>
//                         Contacto • {contactQ.data.name}
//                       </Text>
//                     </Pressable>
//                   </Link>
//                 )}
//                 {leadQ.data && (
//                   <Link
//                     href={{ pathname: "/leads/[id]", params: { id: leadQ.data.id } }}
//                     asChild
//                   >
//                     <Pressable>
//                       <Text style={styles.badgeLink}>
//                         Prospecto • {leadQ.data.name}
//                       </Text>
//                     </Pressable>
//                   </Link>
//                 )}

//                 {/* Si no hay relación, lo indicamos */}
//                 {!accountQ.data && !dealQ.data && !contactQ.data && !leadQ.data && (
//                   <Text style={styles.subtle}>Sin relación</Text>
//                 )}
//               </View>

//               {/* Tipo/Estado como pills suaves */}
//               <View style={styles.rowWrap}>
//                 <Text style={[styles.badgeSoft, badgeByType(q.data.type)]}>
//                   {labelByType(q.data.type)}
//                 </Text>
//                 <Text style={[styles.badgeSoft, badgeByStatus(q.data.status)]}>
//                   {labelByStatus(q.data.status)}
//                 </Text>
//               </View>

//               <Text style={styles.item}>
//                 <Text style={styles.itemLabel}>Vence: </Text>
//                 <Text style={styles.itemValue}>
//                   {q.data.due_date ? new Date(q.data.due_date).toLocaleDateString() : "—"}
//                 </Text>
//               </Text>

//               {!!q.data.notes && (
//                 <Text style={styles.item}>
//                   <Text style={styles.itemLabel}>Notas: </Text>
//                   <Text style={styles.itemValue}>{q.data.notes}</Text>
//                 </Text>
//               )}
//             </View>

//             <Pressable
//               style={[
//                 styles.btn,
//                 styles.btnPrimary,
//                 (mStatus.isPending || q.isFetching) && { opacity: 0.9 },
//               ]}
//               onPress={() => mStatus.mutate()}
//               disabled={mStatus.isPending}
//             >
//               <Text style={styles.btnText}>
//                 {mStatus.isPending ? "Actualizando…" : "Cambiar estado"}
//               </Text>
//             </Pressable>

//             <Pressable
//               style={[
//                 styles.btn,
//                 styles.btnDanger,
//                 mDelete.isPending && { opacity: 0.9 },
//               ]}
//               onPress={() => mDelete.mutate()}
//               disabled={mDelete.isPending}
//             >
//               <Text style={styles.btnText}>
//                 {mDelete.isPending ? "Eliminando…" : "Eliminar"}
//               </Text>
//             </Pressable>
//           </>
//         )}
//       </View>
//     </>
//   );
// }

// /* ——— Helpers UI ——— */
// function iconByType(t: "task" | "call" | "meeting") {
//   if (t === "call") return "📞";
//   if (t === "meeting") return "📅";
//   return "✅";
// }
// function labelByType(t: "task" | "call" | "meeting") {
//   if (t === "call") return "Llamada";
//   if (t === "meeting") return "Reunión";
//   return "Tarea";
// }
// function labelByStatus(s: ActivityStatus) {
//   if (s === "open") return "Abierta";
//   if (s === "done") return "Completada";
//   return "Cancelada";
// }
// function badgeByType(t: "task" | "call" | "meeting") {
//   const base = { borderColor: "#2d3340", backgroundColor: "rgba(255,255,255,0.04)", color: TEXT };
//   if (t === "call")    return { ...base, borderColor: ACCENT,  backgroundColor: "rgba(34,211,238,0.10)" };
//   if (t === "meeting") return { ...base, borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.12)" };
//   return { ...base, borderColor: PRIMARY, backgroundColor: "rgba(124,58,237,0.10)" }; // task
// }
// function badgeByStatus(s: ActivityStatus) {
//   const base = { borderColor: "#2d3340", backgroundColor: "rgba(255,255,255,0.04)", color: TEXT };
//   if (s === "open")     return { ...base, borderColor: PRIMARY, backgroundColor: "rgba(124,58,237,0.10)" };
//   if (s === "done")     return { ...base, borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.12)" };
//   /* canceled */
//   return { ...base, borderColor: DANGER, backgroundColor: "rgba(239,68,68,0.10)" };
// }

// /* ——— Estilos ——— */
// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },
//   card: {
//     backgroundColor: CARD,
//     borderWidth: 1,
//     borderColor: BORDER,
//     borderRadius: 14,
//     padding: 14,
//     gap: 8,
//   },
//   title: { fontSize: 20, fontWeight: "900", color: TEXT },

//   relRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },

//   rowWrap: { flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" },

//   item: { color: SUBTLE },
//   itemLabel: { color: SUBTLE, fontWeight: "700" },
//   itemValue: { color: TEXT, fontWeight: "700" },

//   badgeSoft: {
//     alignSelf: "flex-start",
//     paddingHorizontal: 8,
//     paddingVertical: 3,
//     borderRadius: 999,
//     borderWidth: 1,
//     overflow: "hidden",
//     fontSize: 11,
//     lineHeight: 14,
//     fontWeight: "800",
//     color: TEXT,
//   } as any,

//   badgeLink: {
//     color: TEXT,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: "rgba(124,58,237,0.12)",
//     paddingHorizontal: 8,
//     paddingVertical: 3,
//     borderRadius: 999,
//     fontWeight: "800",
//     fontSize: 11,
//     overflow: "hidden",
//   } as any,

//   btn: { padding: 12, borderRadius: 12, alignItems: "center" },
//   btnPrimary: {
//     backgroundColor: PRIMARY,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.16)",
//   },
//   btnDanger: { backgroundColor: DANGER },

//   btnText: { color: "#fff", fontWeight: "900" },

//   subtle: { color: SUBTLE },
//   error: { color: "#fecaca" },
// });
