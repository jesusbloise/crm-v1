import { deleteLead, getLead, LeadStatus, STATUS_FLOW, updateLead } from "@/src/api/leads";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

const nextStatus = (s?: LeadStatus): LeadStatus => {
  const flow = STATUS_FLOW;
  const i = Math.max(0, flow.indexOf(s ?? "nuevo"));
  return flow[(i + 1) % flow.length];
}

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["lead", id], queryFn: () => getLead(id!) });

  const mStatus = useMutation({
  mutationFn: async () => updateLead(id!, { status: nextStatus(q.data?.status) }),
  onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: ["lead", id] });
    await qc.invalidateQueries({ queryKey: ["leads"] });
  }
});


  const mDelete = useMutation({
    mutationFn: async () => deleteLead(id!),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["leads"] });
      router.back();
    }
  });

  return (
    <>
      <Stack.Screen options={{ title: "Detalle Lead" }} />
      <View style={styles.container}>
        {!q.data ? <Text>Cargando...</Text> : (
          <>
            <Text style={styles.title}>{q.data.name}</Text>
            {q.data.company ? <Text>Empresa: {q.data.company}</Text> : null}
            {q.data.email ? <Text>Email: {q.data.email}</Text> : null}
            {q.data.phone ? <Text>Tel: {q.data.phone}</Text> : null}
            <Text style={{marginTop:8}}>Estado: <Text style={{fontWeight:"700"}}>{q.data.status ?? "nuevo"}</Text></Text>

            <Pressable style={[styles.btn,{backgroundColor:"#1e90ff"}]} onPress={() => mStatus.mutate()}>
              <Text style={styles.btnText}>Cambiar estado</Text>
            </Pressable>

            <Pressable style={[styles.btn,{backgroundColor:"#ef4444"}]} onPress={() => mDelete.mutate()}>
              <Text style={styles.btnText}>Eliminar</Text>
            </Pressable>
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,padding:16,gap:8},
  title:{fontSize:20,fontWeight:"700"},
  btn:{marginTop:12,padding:12,borderRadius:8,alignItems:"center"},
  btnText:{color:"#fff",fontWeight:"700"}
});
