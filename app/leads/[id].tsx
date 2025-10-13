// app/leads/[id].tsx
import { deleteLead, getLead, LeadStatus, STATUS_FLOW, updateLead } from "@/src/api/leads";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

// 🎨 Tema consistente
const ORANGE = "#FF6A00";
const BG = "#0e0e0f";
const CARD = "#151517";
const BORDER = "#2a2a2c";
const TEXT = "#f3f4f6";
const SUBTLE = "rgba(255,255,255,0.7)";

const nextStatus = (s?: LeadStatus): LeadStatus => {
  const flow = STATUS_FLOW;
  const i = Math.max(0, flow.indexOf(s ?? "nuevo"));
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
    mutationFn: async () => updateLead(id!, { status: nextStatus(q.data?.status) }),
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
      <Stack.Screen options={{ title: "Detalle Lead" }} />
      <View style={styles.container}>
        {q.isLoading ? (
          <Text style={styles.subtle}>Cargando…</Text>
        ) : q.isError ? (
          <Text style={styles.error}>Error: {String((q.error as any)?.message || q.error)}</Text>
        ) : !q.data ? (
          <Text style={styles.subtle}>No encontrado</Text>
        ) : (
          <>
            <Text style={styles.title}>{q.data.name}</Text>
            {q.data.company ? <Text style={styles.itemText}>Empresa: <Text style={styles.itemStrong}>{q.data.company}</Text></Text> : null}
            {q.data.email ? <Text style={styles.itemText}>Email: <Text style={styles.itemStrong}>{q.data.email}</Text></Text> : null}
            {q.data.phone ? <Text style={styles.itemText}>Tel: <Text style={styles.itemStrong}>{q.data.phone}</Text></Text> : null}

            <View style={styles.statusRow}>
              <Text style={styles.itemText}>Estado:</Text>
              <Text style={[styles.badge]}>{q.data.status ?? "nuevo"}</Text>
            </View>

            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => mStatus.mutate()}
              disabled={mStatus.isPending}
            >
              <Text style={styles.btnText}>
                {mStatus.isPending ? "Actualizando…" : "Cambiar estado"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.btnDanger]}
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

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: "900", color: TEXT },

  itemText: { color: SUBTLE },
  itemStrong: { color: TEXT, fontWeight: "800" },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  badge: {
    backgroundColor: "#1a1b1d",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    color: TEXT,
    fontWeight: "800",
    overflow: "hidden",
    fontSize: 12,
  } as any,

  btn: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimary: { backgroundColor: ORANGE },
  btnDanger: { backgroundColor: "#ef4444" },
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
