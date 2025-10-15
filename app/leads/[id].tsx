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
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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

  const q = useQuery({
    queryKey: ["lead", id],
    queryFn: () => getLead(id!),
    enabled: !!id,
  });

  const mStatus = useMutation({
    mutationFn: async () => {
      // ⚠️ Aseguramos tipo válido aunque aún no haya dato
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

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen
        options={{
          title: "Detalle Lead",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
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
          </>
        )}
      </View>
    </View>
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
  // por si tienes otro estado en el flujo
  return base;
}

/* ——— Estilos ——— */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
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

  subtle: { color: SUBTLE },
  error: { color: "#fecaca" },
});



// import { deleteLead, getLead, LeadStatus, STATUS_FLOW, updateLead } from "@/src/api/leads";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { router, Stack, useLocalSearchParams } from "expo-router";
// import { Pressable, StyleSheet, Text, View } from "react-native";

// const nextStatus = (s?: LeadStatus): LeadStatus => {
//   const flow = STATUS_FLOW;
//   const i = Math.max(0, flow.indexOf(s ?? "nuevo"));
//   return flow[(i + 1) % flow.length];
// }

// export default function LeadDetail() {
//   const { id } = useLocalSearchParams<{ id: string }>();
//   const qc = useQueryClient();

//   const q = useQuery({ queryKey: ["lead", id], queryFn: () => getLead(id!) });

//   const mStatus = useMutation({
//   mutationFn: async () => updateLead(id!, { status: nextStatus(q.data?.status) }),
//   onSuccess: async () => {
//     await qc.invalidateQueries({ queryKey: ["lead", id] });
//     await qc.invalidateQueries({ queryKey: ["leads"] });
//   }
// });


//   const mDelete = useMutation({
//     mutationFn: async () => deleteLead(id!),
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["leads"] });
//       router.back();
//     }
//   });

//   return (
//     <>
//       <Stack.Screen options={{ title: "Detalle Lead" }} />
//       <View style={styles.container}>
//         {!q.data ? <Text>Cargando...</Text> : (
//           <>
//             <Text style={styles.title}>{q.data.name}</Text>
//             {q.data.company ? <Text>Empresa: {q.data.company}</Text> : null}
//             {q.data.email ? <Text>Email: {q.data.email}</Text> : null}
//             {q.data.phone ? <Text>Tel: {q.data.phone}</Text> : null}
//             <Text style={{marginTop:8}}>Estado: <Text style={{fontWeight:"700"}}>{q.data.status ?? "nuevo"}</Text></Text>

//             <Pressable style={[styles.btn,{backgroundColor:"#1e90ff"}]} onPress={() => mStatus.mutate()}>
//               <Text style={styles.btnText}>Cambiar estado</Text>
//             </Pressable>

//             <Pressable style={[styles.btn,{backgroundColor:"#ef4444"}]} onPress={() => mDelete.mutate()}>
//               <Text style={styles.btnText}>Eliminar</Text>
//             </Pressable>
//           </>
//         )}
//       </View>
//     </>
//   );
// }

// const styles = StyleSheet.create({
//   container:{flex:1,padding:16,gap:8},
//   title:{fontSize:20,fontWeight:"700"},
//   btn:{marginTop:12,padding:12,borderRadius:8,alignItems:"center"},
//   btnText:{color:"#fff",fontWeight:"700"}
// });
