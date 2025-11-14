// app/accounts/new.tsx
import { createAccount } from "@/src/api/accounts";
import { uid } from "@/src/utils/uid";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

/* 🎨 Tema consistente (Home / Deals / Contacts) */
const BG      = "#0b0c10";
const CARD    = "#14151a";
const FIELD   = "#121318";
const BORDER  = "#272a33";
const TEXT    = "#e8ecf1";
const SUBTLE  = "#a9b0bd";
const ACCENT  = "#7c3aed";   // morado principal

export default function NewAccount() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nombre requerido");
      await createAccount({ id: uid(), name: name.trim(), website, phone } as any);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["accounts"] }),
        qc.invalidateQueries({ queryKey: ["accounts.list"] }),
      ]);
      router.back();
    },
  });

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: "Nueva Cuenta",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
          headerShadowVisible: false,
        }}
      />

      <View style={styles.form}>
        <TextInput
          placeholder="Nombre*"
          placeholderTextColor={SUBTLE}
          value={name}
          onChangeText={setName}
          style={styles.input}
        />
        <TextInput
          placeholder="Website"
          placeholderTextColor={SUBTLE}
          value={website}
          onChangeText={setWebsite}
          autoCapitalize="none"
          keyboardType="url"
          style={styles.input}
        />
        <TextInput
          placeholder="Teléfono"
          placeholderTextColor={SUBTLE}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          style={styles.input}
        />

        {m.isError ? (
          <Text style={styles.errorText}>
            {(m.error as any)?.message || "Error al guardar"}
          </Text>
        ) : null}

        <Pressable
          onPress={() => m.mutate()}
          disabled={m.isPending}
          style={({ pressed }) => [
            styles.btn,
            pressed && styles.pressed,
            m.isPending && styles.disabled,
          ]}
        >
          <Text style={styles.btnText}>
            {m.isPending ? "Guardando..." : "Guardar"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
    padding: 16,
  },
  form: {
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 12,
    padding: 12,
  },
  btn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  btnText: {
    color: "#fff",
    fontWeight: "900",
  },
  pressed: { opacity: 0.92 },
  disabled: { opacity: 0.65 },
  errorText: { color: "#fecaca", fontSize: 12 },
});


// import { createAccount } from "@/src/api/accounts";
// import { useMutation, useQueryClient } from "@tanstack/react-query";
// import { Stack, router } from "expo-router";
// import { useState } from "react";
// import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

// const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// export default function NewAccount() {
//   const qc = useQueryClient();
//   const [name, setName] = useState("");
//   const [website, setWebsite] = useState("");
//   const [phone, setPhone] = useState("");

//   const m = useMutation({
//     mutationFn: async () => {
//       if (!name.trim()) throw new Error("Nombre requerido");
//       await createAccount({ id: uid(), name, website, phone } as any);
//     },
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["accounts"] });
//       router.back();
//     },
//   });

//   return (
//     <>
//       <Stack.Screen options={{ title: "Nueva Cuenta" }} />
//       <View style={styles.container}>
//         <TextInput placeholder="Nombre*" value={name} onChangeText={setName} style={styles.input} />
//         <TextInput placeholder="Website" value={website} onChangeText={setWebsite} style={styles.input} />
//         <TextInput placeholder="Teléfono" value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" />
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
//   btnText:{color:"#fff",fontWeight:"700"},
// });
