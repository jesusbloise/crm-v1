// app/leads/new.tsx
import { createLead } from "@/src/api/leads";
import { uid } from "@/src/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

/* 🎨 Paleta pro morado/cian (consistente) */
const PRIMARY = "#7C3AED";  // morado acciones
const BG      = "#0F1115";  // fondo
const CARD    = "#171923";  // tarjetas
const FIELD   = "#121723";  // inputs
const BORDER  = "#2B3140";  // bordes
const TEXT    = "#F3F4F6";  // texto principal
const SUBTLE  = "#A4ADBD";  // subtítulos

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
        name: name.trim(),
        company: company || undefined,
        email: email || undefined,
        phone: phone || undefined,
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
      <Stack.Screen
        options={{
          title: "Nuevo Lead",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
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

          {m.isError ? (
            <Text style={styles.errorText}>
              {(m.error as any)?.message || "Error al guardar"}
            </Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.btn,
              pressed && styles.pressed,
              m.isPending && styles.disabled,
            ]}
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
    backgroundColor: FIELD,
    borderRadius: 10,
    padding: 12,
    color: TEXT,
  },
  btn: {
    marginTop: 4,
    backgroundColor: PRIMARY,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  btnText: { color: "#fff", fontWeight: "900" },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.6 },
  errorText: { color: "#fecaca", fontSize: 12 },
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
