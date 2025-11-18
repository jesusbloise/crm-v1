// app/leads/[id].tsx
import {
  deleteLead,
  getLead,
  STATUS_FLOW,
  updateLead,
  type LeadStatus,
} from "@/src/api/leads";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

// Secciones reutilizables
import RelatedActivities from "@/src/components/RelatedActivities";
import RelatedNotes from "@/src/components/RelatedNotes";

/* 🎨 Paleta */
const PRIMARY = "#7C3AED";
const ACCENT  = "#22D3EE";
const BG      = "#0F1115";
const CARD    = "#171923";
const BORDER  = "#2B3140";
const TEXT    = "#F3F4F6";
const SUBTLE  = "#A4ADBD";
const DANGER  = "#EF4444";

const nextStatus = (s?: LeadStatus): LeadStatus => {
  const flow = STATUS_FLOW;
  const i = Math.max(0, flow.indexOf((s ?? "nuevo") as LeadStatus));
  return flow[(i + 1) % flow.length];
};

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();

  const q = useQuery({
    queryKey: ["lead", id],
    queryFn: () => getLead(id!),
    enabled: !!id,
  });

  const mStatus = useMutation({
    mutationFn: async () => {
      const curr = (q.data?.status ?? "nuevo") as LeadStatus;
      const nxt  = nextStatus(curr);
      return updateLead(id!, { status: nxt });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["lead", id] });
      await qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const mDelete = useMutation({
    mutationFn: async () => deleteLead(id!),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["leads"] });
      router.back();
    },
  });

  // 👇 Por ahora: miembros del workspace "de ejemplo".
  // Luego los podemos traer de una API / contexto.
  const members = [
    { id: "demo-admin", name: "Demo Admin", email: "admin@demo.local" },
    // agrega aquí más miembros reales cuando los tengas
    // { id: "user-jesus", name: "Jesús", email: "jesus@example.com" },
    // { id: "user-cata",  name: "Cata",  email: "cata@example.com" },
  ];

  const Header = (
    <View style={styles.container}>
      {q.isLoading ? (
        <Text style={styles.subtle}>Cargando…</Text>
      ) : q.isError ? (
        <Text style={styles.error}>
          Error: {String((q.error as any)?.message || q.error)}
        </Text>
      ) : !q.data ? (
        <Text style={styles.subtle}>No encontrado</Text>
      ) : (
        <>
          {/* Tarjeta del lead */}
          <View style={styles.card}>
            <Text style={styles.title}>{q.data.name}</Text>

            {!!q.data.company && (
              <Text style={styles.itemText}>
                Empresa: <Text style={styles.itemStrong}>{q.data.company}</Text>
              </Text>
            )}
            {!!q.data.email && (
              <Text style={styles.itemText}>
                Email: <Text style={[styles.itemStrong, styles.link]}>{q.data.email}</Text>
              </Text>
            )}
            {!!q.data.phone && (
              <Text style={styles.itemText}>
                Tel: <Text style={styles.itemStrong}>{q.data.phone}</Text>
              </Text>
            )}

            <View style={styles.statusRow}>
              <Text style={styles.itemText}>Estado:</Text>
              <Text style={[styles.badge, badgeByStatus(q.data?.status)]}>
                {(q.data?.status ?? "nuevo") as string}
              </Text>
            </View>
          </View>

          {/* Acciones lead */}
          <Pressable
            style={[styles.btn, styles.btnPrimary, mStatus.isPending && { opacity: 0.9 }]}
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

          {/* Actividades relacionadas */}
          <Text style={[styles.section, { marginTop: 12 }]}>Actividades</Text>
          <View style={{ marginBottom: 8 }}>
            <RelatedActivities
              filters={{ lead_id: id }}
              // 👇 ahora sí le pasamos los miembros para poder asignar
              members={members}
            />
          </View>

          {/* Notas relacionadas */}
          <Text style={[styles.section, { marginTop: 8 }]}>Notas</Text>
          <RelatedNotes filters={{ lead_id: id }} />
        </>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Detalle Lead",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={["bottom"]}>
        <FlatList
          data={[]}
          renderItem={null as any}
          ListHeaderComponent={Header}
          keyExtractor={() => "x"}
          contentContainerStyle={{
            paddingTop: 16,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 200,
            backgroundColor: BG,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator
        />
      </SafeAreaView>
    </>
  );
}

/* ——— Helpers UI ——— */
function badgeByStatus(status?: LeadStatus | null) {
  const base = {
    borderColor: "#2d3340",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: TEXT,
  };
  const s = ((status ?? "nuevo") as LeadStatus).toLowerCase();
  if (s === "nuevo")      return { ...base, borderColor: PRIMARY, backgroundColor: "rgba(124,58,237,0.10)" };
  if (s === "contactado") return { ...base, borderColor: ACCENT,  backgroundColor: "rgba(34,211,238,0.10)" };
  if (s === "calificado") return { ...base, borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.12)" };
  if (s === "perdido")    return { ...base, borderColor: DANGER,   backgroundColor: "rgba(239,68,68,0.10)" };
  return base;
}

/* ——— Estilos ——— */
const styles = StyleSheet.create({
  container: { gap: 12 },
  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },

  title: { fontSize: 22, fontWeight: "900", color: TEXT },
  itemText: { color: SUBTLE },
  itemStrong: { color: TEXT, fontWeight: "800" },
  link: { color: ACCENT, textDecorationLine: "underline" },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: TEXT,
  } as any,

  btn: { padding: 12, borderRadius: 12, alignItems: "center" },
  btnPrimary: { backgroundColor: PRIMARY, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  btnDanger: { backgroundColor: DANGER },
  btnText: { color: "#fff", fontWeight: "900" },

  section: { color: TEXT, fontWeight: "900", fontSize: 16 },
  subtle: { color: SUBTLE },
  error: { color: "#fecaca" },
});



// // app/leads/[id].tsx
// import {
//   deleteLead,
//   getLead,
//   STATUS_FLOW,
//   updateLead,
//   type LeadStatus,
// } from "@/src/api/leads";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { router, Stack, useLocalSearchParams } from "expo-router";
// import React from "react";
// import {
//   FlatList,
//   Pressable,
//   StyleSheet,
//   Text,
//   View,
// } from "react-native";
// import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

// // Secciones reutilizables
// import RelatedActivities from "@/src/components/RelatedActivities";
// import RelatedNotes from "@/src/components/RelatedNotes";

// /* 🎨 Paleta */
// const PRIMARY = "#7C3AED";
// const ACCENT  = "#22D3EE";
// const BG      = "#0F1115";
// const CARD    = "#171923";
// const BORDER  = "#2B3140";
// const TEXT    = "#F3F4F6";
// const SUBTLE  = "#A4ADBD";
// const DANGER  = "#EF4444";

// const nextStatus = (s?: LeadStatus): LeadStatus => {
//   const flow = STATUS_FLOW;
//   const i = Math.max(0, flow.indexOf((s ?? "nuevo") as LeadStatus));
//   return flow[(i + 1) % flow.length];
// };

// export default function LeadDetail() {
//   const { id } = useLocalSearchParams<{ id: string }>();
//   const qc = useQueryClient();
//   const insets = useSafeAreaInsets();

//   const q = useQuery({
//     queryKey: ["lead", id],
//     queryFn: () => getLead(id!),
//     enabled: !!id,
//   });

//   const mStatus = useMutation({
//     mutationFn: async () => {
//       const curr = (q.data?.status ?? "nuevo") as LeadStatus;
//       const nxt  = nextStatus(curr);
//       return updateLead(id!, { status: nxt });
//     },
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["lead", id] });
//       await qc.invalidateQueries({ queryKey: ["leads"] });
//     },
//   });

//   const mDelete = useMutation({
//     mutationFn: async () => deleteLead(id!),
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["leads"] });
//       router.back();
//     },
//   });

//   const Header = (
//     <View style={styles.container}>
//       {q.isLoading ? (
//         <Text style={styles.subtle}>Cargando…</Text>
//       ) : q.isError ? (
//         <Text style={styles.error}>
//           Error: {String((q.error as any)?.message || q.error)}
//         </Text>
//       ) : !q.data ? (
//         <Text style={styles.subtle}>No encontrado</Text>
//       ) : (
//         <>
//           {/* Tarjeta del lead */}
//           <View style={styles.card}>
//             <Text style={styles.title}>{q.data.name}</Text>

//             {!!q.data.company && (
//               <Text style={styles.itemText}>
//                 Empresa: <Text style={styles.itemStrong}>{q.data.company}</Text>
//               </Text>
//             )}
//             {!!q.data.email && (
//               <Text style={styles.itemText}>
//                 Email: <Text style={[styles.itemStrong, styles.link]}>{q.data.email}</Text>
//               </Text>
//             )}
//             {!!q.data.phone && (
//               <Text style={styles.itemText}>
//                 Tel: <Text style={styles.itemStrong}>{q.data.phone}</Text>
//               </Text>
//             )}

//             <View style={styles.statusRow}>
//               <Text style={styles.itemText}>Estado:</Text>
//               <Text style={[styles.badge, badgeByStatus(q.data?.status)]}>
//                 {(q.data?.status ?? "nuevo") as string}
//               </Text>
//             </View>
//           </View>

//           {/* Acciones lead */}
//           <Pressable
//             style={[styles.btn, styles.btnPrimary, mStatus.isPending && { opacity: 0.9 }]}
//             onPress={() => mStatus.mutate()}
//             disabled={mStatus.isPending}
//           >
//             <Text style={styles.btnText}>
//               {mStatus.isPending ? "Actualizando…" : "Cambiar estado"}
//             </Text>
//           </Pressable>

//           <Pressable
//             style={[styles.btn, styles.btnDanger, mDelete.isPending && { opacity: 0.9 }]}
//             onPress={() => mDelete.mutate()}
//             disabled={mDelete.isPending}
//           >
//             <Text style={styles.btnText}>
//               {mDelete.isPending ? "Eliminando…" : "Eliminar"}
//             </Text>
//           </Pressable>

//           {/* Actividades relacionadas */}
//           <Text style={[styles.section, { marginTop: 12 }]}>Actividades</Text>
//           <View style={{ marginBottom: 8 }}>
//             <RelatedActivities filters={{ lead_id: id }} />
//           </View>

//           {/* Notas relacionadas */}
//           <Text style={[styles.section, { marginTop: 8 }]}>Notas</Text>
//           <RelatedNotes filters={{ lead_id: id }} />
//         </>
//       )}
//     </View>
//   );

//   return (
//     <>
//       <Stack.Screen
//         options={{
//           title: "Detalle Lead",
//           headerStyle: { backgroundColor: BG },
//           headerTintColor: TEXT,
//           headerTitleStyle: { color: TEXT, fontWeight: "800" },
//         }}
//       />
//       <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={["bottom"]}>
//         <FlatList
//           data={[]}
//           renderItem={null as any}
//           ListHeaderComponent={Header}
//           keyExtractor={() => "x"}
//           contentContainerStyle={{
//             paddingTop: 16,
//             paddingHorizontal: 16,
//             paddingBottom: insets.bottom + 200,
//             backgroundColor: BG,
//           }}
//           keyboardShouldPersistTaps="handled"
//           keyboardDismissMode="on-drag"
//           showsVerticalScrollIndicator
//         />
//       </SafeAreaView>
//     </>
//   );
// }

// /* ——— Helpers UI ——— */
// function badgeByStatus(status?: LeadStatus | null) {
//   const base = {
//     borderColor: "#2d3340",
//     backgroundColor: "rgba(255,255,255,0.04)",
//     color: TEXT,
//   };
//   const s = ((status ?? "nuevo") as LeadStatus).toLowerCase();
//   if (s === "nuevo")      return { ...base, borderColor: PRIMARY, backgroundColor: "rgba(124,58,237,0.10)" };
//   if (s === "contactado") return { ...base, borderColor: ACCENT,  backgroundColor: "rgba(34,211,238,0.10)" };
//   if (s === "calificado") return { ...base, borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.12)" };
//   if (s === "perdido")    return { ...base, borderColor: DANGER,   backgroundColor: "rgba(239,68,68,0.10)" };
//   return base;
// }

// /* ——— Estilos ——— */
// const styles = StyleSheet.create({
//   container: { gap: 12 },
//   card: {
//     backgroundColor: CARD,
//     borderWidth: 1,
//     borderColor: BORDER,
//     borderRadius: 14,
//     padding: 14,
//     gap: 6,
//   },

//   title: { fontSize: 22, fontWeight: "900", color: TEXT },
//   itemText: { color: SUBTLE },
//   itemStrong: { color: TEXT, fontWeight: "800" },
//   link: { color: ACCENT, textDecorationLine: "underline" },

//   statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
//   badge: {
//     alignSelf: "flex-start",
//     paddingHorizontal: 8,
//     paddingVertical: 3,
//     borderRadius: 999,
//     borderWidth: 1,
//     overflow: "hidden",
//     fontSize: 11,
//     lineHeight: 14,
//     fontWeight: "700",
//     color: TEXT,
//   } as any,

//   btn: { padding: 12, borderRadius: 12, alignItems: "center" },
//   btnPrimary: { backgroundColor: PRIMARY, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
//   btnDanger: { backgroundColor: DANGER },
//   btnText: { color: "#fff", fontWeight: "900" },

//   section: { color: TEXT, fontWeight: "900", fontSize: 16 },
//   subtle: { color: SUBTLE },
//   error: { color: "#fecaca" },
// });

