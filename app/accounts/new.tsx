import { createAccount } from "@/src/api/accounts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function NewAccount() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nombre requerido");
      await createAccount({ id: uid(), name, website, phone } as any);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["accounts"] });
      router.back();
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: "Nueva Cuenta" }} />
      <View style={styles.container}>
        <TextInput placeholder="Nombre*" value={name} onChangeText={setName} style={styles.input} />
        <TextInput placeholder="Website" value={website} onChangeText={setWebsite} style={styles.input} />
        <TextInput placeholder="Teléfono" value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" />
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
  btnText:{color:"#fff",fontWeight:"700"},
});
