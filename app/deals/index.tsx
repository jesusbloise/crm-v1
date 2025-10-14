import { listAccounts } from "@/src/api/accounts";
import { listDeals, updateDeal, type Deal, type DealStage } from "@/src/api/deals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

/* 🎨 Tema base (oscuro) */
const BG       = "#0b0c10";
const CARD     = "#14151a";
const BORDER   = "#272a33";
const TEXT     = "#e8ecf1";
const SUBTLE   = "#a9b0bd";
const ACCENT   = "#7c3aed";   // FAB / botones morados (como en Home)
const ACCENT_2 = "#22d3ee";   // cian para dots activos
const DANGER   = "#ef4444";

/* 👉 Columnas en claro */
const LIGHT_CARD   = "#ECEFF4"; // gris claro
const LIGHT_BORDER = "#CBD5E1"; // borde claro
const DARK_TEXT    = "#0F172A"; // texto sobre claro
const DARK_SUBTLE  = "#475569"; // subtítulo sobre claro

/* Etapas */
const STAGES: DealStage[] = ["nuevo","calificado","propuesta","negociacion","ganado","perdido"];

export default function DealsBoard() {
  const qc = useQueryClient();
  const qDeals = useQuery({ queryKey: ["deals"], queryFn: listDeals });
  const qAcc   = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

  const byStage = useMemo(() => {
    const map: Record<DealStage, Deal[]> = {
      nuevo: [], calificado: [], propuesta: [], negociacion: [], ganado: [], perdido: []
    };
    for (const d of qDeals.data ?? []) {
      const s = (d.stage as DealStage) || "nuevo";
      map[s].push(d);
    }
    return map;
  }, [qDeals.data]);

  const mStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: DealStage }) => {
      await updateDeal(id, { stage });
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ["deals"] });
      await qc.invalidateQueries({ queryKey: ["deal", vars.id] });
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen
        options={{
          title: "Oportunidades",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />

      {/* Top action bar con botón morado */}
      <View style={styles.topBar}>
        <Link href="/deals/new" asChild>
          <Pressable style={({pressed})=>[styles.newBtn, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.newBtnText}>＋ Nueva oportunidad</Text>
          </Pressable>
        </Link>
      </View>

      {qDeals.isLoading ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : qDeals.isError ? (
        <View style={styles.center}>
          <Text style={{ color: DANGER }}>
            Error: {String((qDeals.error as any)?.message || qDeals.error)}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            contentContainerStyle={styles.board}
            showsHorizontalScrollIndicator={false}
          >
            {STAGES.map((stage) => (
              <View key={stage} style={styles.column}>
                <View style={styles.columnHeader}>
                  <Text style={styles.columnTitle}>{etiqueta(stage)}</Text>
                  <View style={styles.countPill}>
                    <Text style={styles.countPillText}>{byStage[stage].length}</Text>
                  </View>
                </View>

                <View style={{ gap: 10 }}>
                  {byStage[stage].map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      accountName={nombreCuenta(deal.account_id, qAcc.data)}
                      onChangeStage={(s) => mStage.mutate({ id: deal.id, stage: s })}
                      isUpdating={mStage.isPending && mStage.variables?.id === deal.id}
                    />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* FAB morado flotante */}
          <View style={styles.fabWrap}>
            <Link href="/deals/new" asChild>
              <Pressable style={({pressed})=>[styles.fab, pressed && styles.pressed]} accessibilityRole="button">
                <Text style={styles.fabText}>＋</Text>
              </Pressable>
            </Link>
          </View>
        </>
      )}
    </View>
  );
}

function DealCard({
  deal,
  accountName,
  onChangeStage,
  isUpdating,
}: {
  deal: Deal;
  accountName?: string;
  onChangeStage: (s: DealStage) => void;
  isUpdating?: boolean;
}) {
  const currentIndex = Math.max(0, STAGES.indexOf((deal.stage as DealStage) || "nuevo"));

  return (
    <View style={styles.card}>
      <Link href={`/deals/${deal.id}`} asChild>
        <Pressable>
          <Text style={styles.cardTitle} numberOfLines={2}>{deal.title}</Text>
          {!!accountName && <Text style={styles.cardSub}>{accountName}</Text>}
        </Pressable>
      </Link>

      <View style={styles.stageStrip}>
        {STAGES.map((s, idx) => {
          const active = idx <= currentIndex;
          return (
            <Pressable
              key={s}
              onPress={() => onChangeStage(s)}
              style={[styles.dot, active && styles.dotActive]}
              accessibilityRole="button"
            />
          );
        })}
      </View>

      <View style={styles.badgeRow}>
        <Text style={styles.badge}>
          {etiqueta(deal.stage as DealStage)}
        </Text>
        {isUpdating ? <Text style={styles.saving}>Guardando…</Text> : null}
      </View>
    </View>
  );
}

/* ——— Helpers ——— */
function etiqueta(s: DealStage): string {
  switch (s) {
    case "nuevo": return "Nuevo";
    case "calificado": return "Calificado";
    case "propuesta": return "Propuesta";
    case "negociacion": return "Negociación";
    case "ganado": return "Ganado";
    case "perdido": return "Perdido";
    default: return "Nuevo";
  }
}

function nombreCuenta(id?: string | null, accounts?: { id: string; name: string }[]) {
  if (!id || !accounts) return undefined;
  return accounts.find(a => a.id === id)?.name;
}

/* ——— Estilos ——— */
const shadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 4 },
  web: { boxShadow: "0 10px 34px rgba(0,0,0,0.35)" } as any,
});

const DOT_SIZE = 10;

const styles = StyleSheet.create({
  /* Top bar */
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: BG,
  },
  newBtn: {
    alignSelf: "flex-start",
    backgroundColor: ACCENT,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    ...shadow,
  },
  newBtnText: { color: "#fff", fontWeight: "900" },

  board: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },

  /* Columnas en gris claro */
  column: {
    width: 300,
    backgroundColor: LIGHT_CARD,
    borderRadius: 14,
    padding: 12,
    borderColor: LIGHT_BORDER,
    borderWidth: 1,
  },
  columnHeader: {
    padding: 10,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: LIGHT_BORDER,
    backgroundColor: LIGHT_CARD,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  columnTitle: { fontWeight: "900", color: DARK_TEXT },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    borderWidth: 1,
    borderColor: LIGHT_BORDER,
  },
  countPillText: { color: DARK_TEXT, fontWeight: "800", fontSize: 12 },

  /* Cards oscuras (contraste) */
  card: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 12,
    borderColor: BORDER,
    borderWidth: 1,
    gap: 8,
    ...shadow,
  },
  cardTitle: { fontWeight: "800", fontSize: 15, color: TEXT },
  cardSub: { color: SUBTLE, marginTop: 2 },

  /* Progreso por etapas */
  stageStrip: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 1,
    borderColor: "#3a3f4a",
    backgroundColor: "#121318",
  },
  dotActive: { backgroundColor: ACCENT_2, borderColor: ACCENT_2 },

  /* Badge estado (neutro gris) */
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    fontSize: 12,
    fontWeight: "800",
    borderWidth: 1,
    color: TEXT,
    backgroundColor: "#1f2430",
    borderColor: "#2d3340",
  } as any,
  saving: { fontSize: 12, color: SUBTLE },

  /* FAB morado flotante */
  fabWrap: {
    position: "absolute",
    right: 16,
    bottom: 24,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ACCENT,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    ...shadow,
  },
  fabText: { color: "#fff", fontSize: 28, lineHeight: 28, fontWeight: "900" },

  pressed: { opacity: 0.9 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});



// import { listAccounts } from "@/src/api/accounts";
// import { listDeals, updateDeal, type Deal, type DealStage } from "@/src/api/deals";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { Link, Stack } from "expo-router";
// import React, { useMemo } from "react";
// import {
//   ActivityIndicator,
//   Platform,
//   Pressable,
//   ScrollView,
//   StyleSheet,
//   Text,
//   View,
// } from "react-native";

// /* 🎨 Tema (igual al de la pantalla de detalle/home) */
// const BG       = "#0b0c10";
// const CARD     = "#14151a";
// const BORDER   = "#272a33";
// const TEXT     = "#e8ecf1";
// const SUBTLE   = "#a9b0bd";
// const ACCENT   = "#7c3aed";  // morado
// const ACCENT_2 = "#22d3ee";  // cian
// const SUCCESS  = "#10b981";
// const DANGER   = "#ef4444";

// /* Etapas */
// const STAGES: DealStage[] = ["nuevo","calificado","propuesta","negociacion","ganado","perdido"];

// export default function DealsBoard() {
//   const qc = useQueryClient();
//   const qDeals = useQuery({ queryKey: ["deals"], queryFn: listDeals });
//   const qAcc   = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

//   const byStage = useMemo(() => {
//     const map: Record<DealStage, Deal[]> = {
//       nuevo: [], calificado: [], propuesta: [], negociacion: [], ganado: [], perdido: []
//     };
//     for (const d of qDeals.data ?? []) {
//       const s = (d.stage as DealStage) || "nuevo";
//       map[s].push(d);
//     }
//     return map;
//   }, [qDeals.data]);

//   const mStage = useMutation({
//     mutationFn: async ({ id, stage }: { id: string; stage: DealStage }) => {
//       await updateDeal(id, { stage });
//     },
//     onSuccess: async (_data, vars) => {
//       await qc.invalidateQueries({ queryKey: ["deals"] });
//       await qc.invalidateQueries({ queryKey: ["deal", vars.id] });
//     },
//   });

//   return (
//     <View style={{ flex: 1, backgroundColor: BG }}>
//       <Stack.Screen
//         options={{
//           title: "Oportunidades",
//           headerStyle: { backgroundColor: BG },
//           headerTintColor: TEXT,
//           headerTitleStyle: { color: TEXT, fontWeight: "800" },
//         }}
//       />

//       <View style={styles.topBar}>
//         <Link href="/deals/new" asChild>
//           <Pressable style={({pressed})=>[styles.newBtn, pressed && styles.pressed]}>
//             <Text style={styles.newBtnText}>＋ Nueva Oportunidad</Text>
//           </Pressable>
//         </Link>
//       </View>

//       {qDeals.isLoading ? (
//         <View style={styles.center}><ActivityIndicator /></View>
//       ) : qDeals.isError ? (
//         <View style={styles.center}>
//           <Text style={{ color: DANGER }}>
//             Error: {String((qDeals.error as any)?.message || qDeals.error)}
//           </Text>
//         </View>
//       ) : (
//         <ScrollView
//           horizontal
//           contentContainerStyle={styles.board}
//           showsHorizontalScrollIndicator={false}
//         >
//           {STAGES.map((stage) => (
//             <View key={stage} style={styles.column}>
//               <View style={styles.columnHeader}>
//                 <Text style={styles.columnTitle}>{etiqueta(stage)}</Text>
//                 <View style={styles.countPill}>
//                   <Text style={styles.countPillText}>{byStage[stage].length}</Text>
//                 </View>
//               </View>

//               <View style={{ gap: 10 }}>
//                 {byStage[stage].map((deal) => (
//                   <DealCard
//                     key={deal.id}
//                     deal={deal}
//                     accountName={nombreCuenta(deal.account_id, qAcc.data)}
//                     onChangeStage={(s) => mStage.mutate({ id: deal.id, stage: s })}
//                     isUpdating={mStage.isPending && mStage.variables?.id === deal.id}
//                   />
//                 ))}
//               </View>
//             </View>
//           ))}
//         </ScrollView>
//       )}
//     </View>
//   );
// }

// function DealCard({
//   deal,
//   accountName,
//   onChangeStage,
//   isUpdating,
// }: {
//   deal: Deal;
//   accountName?: string;
//   onChangeStage: (s: DealStage) => void;
//   isUpdating?: boolean;
// }) {
//   const currentIndex = Math.max(0, STAGES.indexOf((deal.stage as DealStage) || "nuevo"));

//   return (
//     <View style={styles.card}>
//       <Link href={`/deals/${deal.id}`} asChild>
//         <Pressable>
//           <Text style={styles.cardTitle} numberOfLines={2}>{deal.title}</Text>
//           {!!accountName && <Text style={styles.cardSub}>{accountName}</Text>}
//         </Pressable>
//       </Link>

//       <View style={styles.stageStrip}>
//         {STAGES.map((s, idx) => {
//           const active = idx <= currentIndex;
//           return (
//             <Pressable
//               key={s}
//               onPress={() => onChangeStage(s)}
//               style={[styles.dot, active && styles.dotActive]}
//               accessibilityRole="button"
//             />
//           );
//         })}
//       </View>

//       <View style={styles.badgeRow}>
//         <Text style={[styles.badge, badgeStyle(deal.stage as DealStage)]}>
//           {etiqueta(deal.stage as DealStage)}
//         </Text>
//         {isUpdating ? <Text style={styles.saving}>Guardando…</Text> : null}
//       </View>
//     </View>
//   );
// }

// /* ——— Helpers ——— */
// function etiqueta(s: DealStage): string {
//   switch (s) {
//     case "nuevo": return "Nuevo";
//     case "calificado": return "Calificado";
//     case "propuesta": return "Propuesta";
//     case "negociacion": return "Negociación";
//     case "ganado": return "Ganado";
//     case "perdido": return "Perdido";
//     default: return "Nuevo";
//   }
// }

// function nombreCuenta(id?: string | null, accounts?: { id: string; name: string }[]) {
//   if (!id || !accounts) return undefined;
//   return accounts.find(a => a.id === id)?.name;
// }

// function badgeStyle(s: DealStage) {
//   // fondos suaves + borde invisible; texto claro
//   if (s === "ganado")      return { backgroundColor: "rgba(16,185,129,0.14)", color: "#d1fae5" };
//   if (s === "perdido")     return { backgroundColor: "rgba(239,68,68,0.14)",  color: "#fecaca" };
//   if (s === "negociacion") return { backgroundColor: "rgba(34,211,238,0.16)", color: "#cffafe" };
//   if (s === "propuesta")   return { backgroundColor: "rgba(124,58,237,0.18)", color: "#ede9fe" };
//   if (s === "calificado")  return { backgroundColor: "rgba(34,197,94,0.14)",  color: "#dcfce7" };
//   return { backgroundColor: "#20232a", color: "#e5e7eb" };
// }

// /* ——— Estilos ——— */
// const shadow = Platform.select({
//   ios: { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
//   android: { elevation: 4 },
//   web: { boxShadow: "0 10px 34px rgba(0,0,0,0.35)" } as any,
// });

// const DOT_SIZE = 10;

// const styles = StyleSheet.create({
//   topBar: {
//     paddingHorizontal: 16,
//     paddingTop: 12,
//     paddingBottom: 8,
//     backgroundColor: BG,
//   },
//   newBtn: {
//     backgroundColor: ACCENT,
//     paddingVertical: 12,
//     paddingHorizontal: 16,
//     borderRadius: 12,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.16)",
//     alignSelf: "flex-start",
//     ...shadow,
//   },
//   newBtnText: { color: "#fff", fontWeight: "900" },
//   pressed: { opacity: 0.9 },

//   board: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
//   column: {
//     width: 300,
//     backgroundColor: CARD,
//     borderRadius: 14,
//     padding: 12,
//     borderColor: BORDER,
//     borderWidth: 1,
//   },
//   columnHeader: {
//     padding: 8,
//     marginBottom: 10,
//     borderRadius: 10,
//     borderWidth: 1,
//     borderColor: "rgba(34,211,238,0.25)",
//     backgroundColor: "rgba(34,211,238,0.08)", // cian suave
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//   },
//   columnTitle: { fontWeight: "900", color: TEXT },
//   countPill: {
//     paddingHorizontal: 10,
//     paddingVertical: 4,
//     borderRadius: 999,
//     backgroundColor: "rgba(124,58,237,0.22)", // morado suave
//     borderWidth: 1,
//     borderColor: "rgba(124,58,237,0.35)",
//   },
//   countPillText: { color: "#ede9fe", fontWeight: "800", fontSize: 12 },

//   card: {
//     backgroundColor: "#191b22",
//     borderRadius: 14,
//     padding: 12,
//     borderColor: BORDER,
//     borderWidth: 1,
//     gap: 8,
//     ...shadow,
//   },
//   cardTitle: { fontWeight: "800", fontSize: 15, color: TEXT },
//   cardSub: { color: SUBTLE, marginTop: 2 },

//   stageStrip: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
//   dot: {
//     width: DOT_SIZE,
//     height: DOT_SIZE,
//     borderRadius: DOT_SIZE / 2,
//     borderWidth: 1,
//     borderColor: "#3a3f4a",
//     backgroundColor: "#121318",
//   },
//   dotActive: { backgroundColor: ACCENT_2, borderColor: ACCENT_2 },

//   badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
//   badge: {
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     borderRadius: 999,
//     overflow: "hidden",
//     fontSize: 12,
//     fontWeight: "800",
//   } as any,
//   saving: { fontSize: 12, color: SUBTLE },

//   center: { flex: 1, alignItems: "center", justifyContent: "center" },
// });

// import { listAccounts } from "@/src/api/accounts";
// import { listDeals, updateDeal, type Deal, type DealStage } from "@/src/api/deals";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { Link, Stack } from "expo-router";
// import { useMemo } from "react";
// import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

// // 🎨 Tema
// const ORANGE = "#FF6A00";
// const BG = "#0e0e0f";
// const CARD = "#151517";
// const BORDER = "#2a2a2c";
// const TEXT = "#f3f4f6";
// const SUBTLE = "rgba(255,255,255,0.7)";

// const STAGES: DealStage[] = ["nuevo","calificado","propuesta","negociacion","ganado","perdido"];

// export default function DealsBoard() {
//   const qc = useQueryClient();
//   const qDeals = useQuery({ queryKey: ["deals"], queryFn: listDeals });
//   const qAcc   = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

//   const byStage = useMemo(() => {
//     const map: Record<DealStage, Deal[]> = {
//       nuevo: [], calificado: [], propuesta: [], negociacion: [], ganado: [], perdido: []
//     };
//     for (const d of qDeals.data ?? []) {
//       const s = (d.stage as DealStage) || "nuevo";
//       map[s].push(d);
//     }
//     return map;
//   }, [qDeals.data]);

//   const mStage = useMutation({
//     mutationFn: async ({ id, stage }: { id: string; stage: DealStage }) => {
//       await updateDeal(id, { stage });
//     },
//     onSuccess: async (_data, vars) => {
//       await qc.invalidateQueries({ queryKey: ["deals"] });
//       await qc.invalidateQueries({ queryKey: ["deal", vars.id] });
//     },
//   });

//   return (
//     <View style={{ flex: 1, backgroundColor: BG }}>
//       <Stack.Screen options={{ title: "Oportunidades" }} />

//       <View style={styles.topBar}>
//         <Link href="/deals/new" asChild>
//           <Pressable style={styles.newBtn}>
//             <Text style={styles.newBtnText}>+ Nueva Oportunidad</Text>
//           </Pressable>
//         </Link>
//       </View>

//       {qDeals.isLoading ? (
//         <View style={styles.center}><ActivityIndicator /></View>
//       ) : qDeals.isError ? (
//         <View style={styles.center}><Text style={{ color: "crimson" }}>
//           Error: {String((qDeals.error as any)?.message || qDeals.error)}
//         </Text></View>
//       ) : (
//         <ScrollView
//           horizontal
//           contentContainerStyle={styles.board}
//           showsHorizontalScrollIndicator={false}
//         >
//           {STAGES.map((stage) => (
//             <View key={stage} style={styles.column}>
//               <View style={styles.columnHeader}>
//                 <Text style={styles.columnTitle}>{etiqueta(stage)}</Text>
//                 <Text style={styles.columnCount}>{byStage[stage].length}</Text>
//               </View>

//               <View style={{ gap: 10 }}>
//                 {byStage[stage].map((deal) => (
//                   <DealCard
//                     key={deal.id}
//                     deal={deal}
//                     accountName={nombreCuenta(deal.account_id, qAcc.data)}
//                     onChangeStage={(s) => mStage.mutate({ id: deal.id, stage: s })}
//                     isUpdating={mStage.isPending && mStage.variables?.id === deal.id}
//                   />
//                 ))}
//               </View>
//             </View>
//           ))}
//         </ScrollView>
//       )}
//     </View>
//   );
// }

// function DealCard({
//   deal,
//   accountName,
//   onChangeStage,
//   isUpdating,
// }: {
//   deal: Deal;
//   accountName?: string;
//   onChangeStage: (s: DealStage) => void;
//   isUpdating?: boolean;
// }) {
//   const currentIndex = Math.max(0, STAGES.indexOf((deal.stage as DealStage) || "nuevo"));

//   return (
//     <View style={styles.card}>
//       <Link href={`/deals/${deal.id}`} asChild>
//         <Pressable>
//           <Text style={styles.cardTitle} numberOfLines={2}>{deal.title}</Text>
//           {accountName ? <Text style={styles.cardSub}>{accountName}</Text> : null}
//         </Pressable>
//       </Link>

//       <View style={styles.stageStrip}>
//         {STAGES.map((s, idx) => {
//           const active = idx <= currentIndex;
//           return (
//             <Pressable
//               key={s}
//               onPress={() => onChangeStage(s)}
//               style={[styles.dot, active && styles.dotActive]}
//             />
//           );
//         })}
//       </View>

//       <View style={styles.badgeRow}>
//         <Text style={[styles.badge, badgeStyle(deal.stage as DealStage)]}>
//           {etiqueta(deal.stage as DealStage)}
//         </Text>
//         {isUpdating ? <Text style={styles.saving}>Guardando…</Text> : null}
//       </View>
//     </View>
//   );
// }

// function etiqueta(s: DealStage): string {
//   switch (s) {
//     case "nuevo": return "Nuevo";
//     case "calificado": return "Calificado";
//     case "propuesta": return "Propuesta";
//     case "negociacion": return "Negociación";
//     case "ganado": return "Ganado";
//     case "perdido": return "Perdido";
//     default: return "Nuevo";
//   }
// }

// function nombreCuenta(id?: string | null, accounts?: { id: string; name: string }[]) {
//   if (!id || !accounts) return undefined;
//   return accounts.find(a => a.id === id)?.name;
// }

// function badgeStyle(s: DealStage) {
//   const base = { backgroundColor: "#2a2a2c", color: "#e5e7eb" };
//   if (s === "negociacion") return { backgroundColor: "#3a2a1f", color: "#ffedd5" };
//   if (s === "propuesta")   return { backgroundColor: "#1e293b", color: "#e2e8f0" };
//   if (s === "calificado")  return { backgroundColor: "#1f2e23", color: "#dcfce7" };
//   if (s === "ganado")      return { backgroundColor: "#1f2f2c", color: "#d1fae5" };
//   if (s === "perdido")     return { backgroundColor: "#3a1f1f", color: "#fee2e2" };
//   return base;
// }

// const DOT_SIZE = 10;

// const styles = StyleSheet.create({
//   topBar: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, backgroundColor: BG },
//   newBtn: { backgroundColor: ORANGE, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, alignSelf: "flex-start" },
//   newBtnText: { color: "#fff", fontWeight: "900" },

//   board: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
//   column: { width: 300, backgroundColor: CARD, borderRadius: 12, padding: 12, borderColor: BORDER, borderWidth: 1 },
//   columnHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
//   columnTitle: { fontWeight: "800", color: TEXT },
//   columnCount: { color: SUBTLE, fontWeight: "700" },

//   card: { backgroundColor: "#1a1b1d", borderRadius: 12, padding: 12, borderColor: BORDER, borderWidth: 1, gap: 8 },
//   cardTitle: { fontWeight: "800", fontSize: 15, color: TEXT },
//   cardSub: { color: SUBTLE },

//   stageStrip: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
//   dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, borderWidth: 1, borderColor: "#3a3a3c", backgroundColor: "#1a1b1d" },
//   dotActive: { backgroundColor: "#f3f4f6", borderColor: "#f3f4f6" },

//   badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
//   badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden", fontSize: 12, fontWeight: "800" } as any,
//   saving: { fontSize: 12, color: SUBTLE },

//   center: { flex: 1, alignItems: "center", justifyContent: "center" },
// });


// // app/deals/index.tsx
// import { listAccounts } from "@/src/api/accounts";
// import { listDeals, updateDeal, type Deal, type DealStage } from "@/src/api/deals";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { Link, Stack } from "expo-router";
// import { useMemo } from "react";
// import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

// const STAGES: DealStage[] = ["nuevo","calificado","propuesta","negociacion","ganado","perdido"];

// export default function DealsBoard() {
//   const qc = useQueryClient();
//   const qDeals = useQuery({ queryKey: ["deals"], queryFn: listDeals });
//   const qAcc   = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

//   const byStage = useMemo(() => {
//     const map: Record<DealStage, Deal[]> = {
//       nuevo: [], calificado: [], propuesta: [], negociacion: [], ganado: [], perdido: []
//     };
//     for (const d of qDeals.data ?? []) {
//       const s = (d.stage as DealStage) || "nuevo";
//       map[s].push(d);
//     }
//     return map;
//   }, [qDeals.data]);

//   const mStage = useMutation({
//     mutationFn: async ({ id, stage }: { id: string; stage: DealStage }) => {
//       await updateDeal(id, { stage });
//     },
//     onSuccess: async (_data, vars) => {
//       await qc.invalidateQueries({ queryKey: ["deals"] });
//       await qc.invalidateQueries({ queryKey: ["deal", vars.id] });
//     },
//   });

//   return (
//     <View style={{ flex: 1 }}>
//       <Stack.Screen options={{ title: "Oportunidades" }} />
//       {qDeals.isLoading ? (
//         <View style={styles.center}><ActivityIndicator /></View>
//       ) : qDeals.isError ? (
//         <View style={styles.center}><Text style={{ color: "crimson" }}>
//           Error: {String((qDeals.error as any)?.message || qDeals.error)}
//         </Text></View>
//       ) : (
//         <ScrollView horizontal contentContainerStyle={styles.board} showsHorizontalScrollIndicator={false}>
//           {STAGES.map((stage) => (
//             <View key={stage} style={styles.column}>
//               <View style={styles.columnHeader}>
//                 <Text style={styles.columnTitle}>{etiqueta(stage)}</Text>
//                 <Text style={styles.columnCount}>{byStage[stage].length}</Text>
//               </View>

//               <View style={{ gap: 10 }}>
//                 {byStage[stage].map((deal) => (
//                   <DealCard
//                     key={deal.id}
//                     deal={deal}
//                     accountName={nombreCuenta(deal.account_id, qAcc.data)}
//                     onChangeStage={(s) => mStage.mutate({ id: deal.id, stage: s })}
//                     isUpdating={mStage.isPending && mStage.variables?.id === deal.id}
//                   />
//                 ))}
//               </View>
//             </View>
//           ))}
//         </ScrollView>
//       )}
//       <Link href="/deals/new" asChild>
//         <Pressable style={styles.fab}><Text style={styles.fabText}>＋</Text></Pressable>
//       </Link>
//     </View>
//   );
// }

// function DealCard({
//   deal,
//   accountName,
//   onChangeStage,
//   isUpdating,
// }: {
//   deal: Deal;
//   accountName?: string;
//   onChangeStage: (s: DealStage) => void;
//   isUpdating?: boolean;
// }) {
//   const currentIndex = Math.max(0, STAGES.indexOf((deal.stage as DealStage) || "nuevo"));

//   return (
//     <View style={styles.card}>
//       <Link href={`/deals/${deal.id}`} asChild>
//         <Pressable>
//           <Text style={styles.cardTitle} numberOfLines={2}>{deal.title}</Text>
//           {accountName ? <Text style={styles.cardSub}>{accountName}</Text> : null}
//         </Pressable>
//       </Link>

//       {/* Progress strip de etapas (sin monto) */}
//       <View style={styles.stageStrip}>
//         {STAGES.map((s, idx) => {
//           const active = idx <= currentIndex;
//           return (
//             <Pressable
//               key={s}
//               onPress={() => onChangeStage(s)}
//               style={[styles.dot, active && styles.dotActive]}
//             >
//               {/* Accesible visualmente con ancho/alto; sin texto */}
//             </Pressable>
//           );
//         })}
//       </View>

//       {/* Etiqueta compacta de etapa actual */}
//       <View style={styles.badgeRow}>
//         <Text style={[styles.badge, badgeStyle(deal.stage as DealStage)]}>
//           {etiqueta(deal.stage as DealStage)}
//         </Text>
//         {isUpdating ? <Text style={styles.saving}>Guardando…</Text> : null}
//       </View>
//     </View>
//   );
// }

// function etiqueta(s: DealStage): string {
//   switch (s) {
//     case "nuevo": return "Nuevo";
//     case "calificado": return "Calificado";
//     case "propuesta": return "Propuesta";
//     case "negociacion": return "Negociación";
//     case "ganado": return "Ganado";
//     case "perdido": return "Perdido";
//     default: return "Nuevo";
//   }
// }

// function nombreCuenta(id?: string | null, accounts?: { id: string; name: string }[]) {
//   if (!id || !accounts) return undefined;
//   return accounts.find(a => a.id === id)?.name;
// }

// function badgeStyle(s: DealStage) {
//   const base = { backgroundColor: "#eef2ff", color: "#3730a3" };      // indigo
//   if (s === "negociacion") return { backgroundColor: "#fff7ed", color: "#9a3412" }; // orange
//   if (s === "propuesta")   return { backgroundColor: "#ecfeff", color: "#155e75" }; // cyan
//   if (s === "calificado")  return { backgroundColor: "#f0fdf4", color: "#166534" }; // green
//   if (s === "ganado")      return { backgroundColor: "#eafff3", color: "#065f46" }; // teal
//   if (s === "perdido")     return { backgroundColor: "#fef2f2", color: "#991b1b" }; // red
//   return base;
// }

// const DOT_SIZE = 10;

// const styles = StyleSheet.create({
//   board: { padding: 12, gap: 12 },
//   column: { width: 300, backgroundColor: "#fafafa", borderRadius: 12, padding: 12, borderColor: "#eee", borderWidth: 1 },
//   columnHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
//   columnTitle: { fontWeight: "800" },
//   columnCount: { opacity: 0.6, fontWeight: "700" },

//   card: { backgroundColor: "white", borderRadius: 12, padding: 12, borderColor: "#eee", borderWidth: 1, gap: 8 },
//   cardTitle: { fontWeight: "800", fontSize: 15 },
//   cardSub: { opacity: 0.7 },

//   stageStrip: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
//   dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, borderWidth: 1, borderColor: "#d1d5db", backgroundColor: "white" },
//   dotActive: { backgroundColor: "#111827", borderColor: "#111827" },

//   badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
//   badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: "hidden", fontSize: 12, fontWeight: "800" } as any,
//   saving: { fontSize: 12, opacity: 0.6 },

//   fab: {
//     position: "absolute", right: 16, bottom: 24,
//     width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
//     backgroundColor: "#111827", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
//   },
//   fabText: { color: "white", fontSize: 28, marginTop: -2 },

//   center: { flex: 1, alignItems: "center", justifyContent: "center" },
// });
