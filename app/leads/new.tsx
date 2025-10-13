import { createLead } from "@/src/api/leads";
import { uid } from "@/src/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function NewLead() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nombre requerido");
      await createLead({ id: uid(), name, company, email, phone, status: "nuevo", created_at: 0, updated_at: 0 } as any);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["leads"] });
      router.back();
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: "Nuevo Lead" }} />
      <View style={styles.container}>
        <TextInput placeholder="Nombre*" value={name} onChangeText={setName} style={styles.input}/>
        <TextInput placeholder="Empresa" value={company} onChangeText={setCompany} style={styles.input}/>
        <TextInput placeholder="Email" value={email} onChangeText={setEmail} style={styles.input} keyboardType="email-address"/>
        <TextInput placeholder="Teléfono" value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad"/>

        <Pressable style={styles.btn} onPress={() => m.mutate()} disabled={m.isPending}>
          <Text style={styles.btnText}>{m.isPending ? "Guardando..." : "Guardar"}</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,padding:16,gap:12},
  input:{borderWidth:1,borderColor:"#ddd",borderRadius:8,padding:10},
  btn:{backgroundColor:"#16a34a",padding:12,borderRadius:8,alignItems:"center"},
  btnText:{color:"#fff",fontWeight:"700"}
});
