// app/leads/new.tsx
import { createLead } from "@/src/api/leads";
import { uid } from "@/src/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

// 🎨 Tema
const ORANGE = "#FF6A00";
const BG = "#0e0e0f";
const CARD = "#151517";
const BORDER = "#2a2a2c";
const TEXT = "#f3f4f6";
const SUBTLE = "rgba(255,255,255,0.7)";

export default function NewLead() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nombre requerido");
      await createLead({
        id: uid(),
        name,
        company,
        email,
        phone,
        status: "nuevo",
        created_at: 0,
        updated_at: 0,
      } as any);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["leads"] });
      router.back();
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: "Nuevo Lead" }} />
      <View style={styles.screen}>
        <View style={styles.card}>
          <TextInput
            placeholder="Nombre*"
            placeholderTextColor={SUBTLE}
            value={name}
            onChangeText={setName}
            style={styles.input}
          />
          <TextInput
            placeholder="Empresa"
            placeholderTextColor={SUBTLE}
            value={company}
            onChangeText={setCompany}
            style={styles.input}
          />
          <TextInput
            placeholder="Email"
            placeholderTextColor={SUBTLE}
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            placeholder="Teléfono"
            placeholderTextColor={SUBTLE}
            value={phone}
            onChangeText={setPhone}
            style={styles.input}
            keyboardType="phone-pad"
          />

          <Pressable
            style={styles.btn}
            onPress={() => m.mutate()}
            disabled={m.isPending}
          >
            <Text style={styles.btnText}>
              {m.isPending ? "Guardando..." : "Guardar"}
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16 },
  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#1a1b1d",
    borderRadius: 10,
    padding: 12,
    color: TEXT,
  },
  btn: {
    marginTop: 4,
    backgroundColor: ORANGE,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "900" },
});
// import { createLead } from "@/src/api/leads";
// import { uid } from "@/src/utils";
// import { useMutation, useQueryClient } from "@tanstack/react-query";
// import { Stack, router } from "expo-router";
// import { useState } from "react";
// import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

// export default function NewLead() {
//   const qc = useQueryClient();
//   const [name, setName] = useState("");
//   const [company, setCompany] = useState("");
//   const [email, setEmail] = useState("");
//   const [phone, setPhone] = useState("");

//   const m = useMutation({
//     mutationFn: async () => {
//       if (!name.trim()) throw new Error("Nombre requerido");
//       await createLead({ id: uid(), name, company, email, phone, status: "nuevo", created_at: 0, updated_at: 0 } as any);
//     },
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["leads"] });
//       router.back();
//     },
//   });

//   return (
//     <>
//       <Stack.Screen options={{ title: "Nuevo Lead" }} />
//       <View style={styles.container}>
//         <TextInput placeholder="Nombre*" value={name} onChangeText={setName} style={styles.input}/>
//         <TextInput placeholder="Empresa" value={company} onChangeText={setCompany} style={styles.input}/>
//         <TextInput placeholder="Email" value={email} onChangeText={setEmail} style={styles.input} keyboardType="email-address"/>
//         <TextInput placeholder="Teléfono" value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad"/>

//         <Pressable style={styles.btn} onPress={() => m.mutate()} disabled={m.isPending}>
//           <Text style={styles.btnText}>{m.isPending ? "Guardando..." : "Guardar"}</Text>
//         </Pressable>
//       </View>
//     </>
//   );
// }

// const styles = StyleSheet.create({
//   container:{flex:1,padding:16,gap:12},
//   input:{borderWidth:1,borderColor:"#ddd",borderRadius:8,padding:10},
//   btn:{backgroundColor:"#16a34a",padding:12,borderRadius:8,alignItems:"center"},
//   btnText:{color:"#fff",fontWeight:"700"}
// });
