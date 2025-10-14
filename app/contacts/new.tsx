// app/contacts/new.tsx
import { listAccounts } from "@/src/api/accounts";
import { createContact } from "@/src/api/contacts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/* 🎨 Tema consistente */
const BG       = "#0b0c10";
const CARD     = "#14151a";
const FIELD    = "#121318";
const BORDER   = "#272a33";
const TEXT     = "#e8ecf1";
const SUBTLE   = "#a9b0bd";
const ACCENT   = "#7c3aed";   // primario morado

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function NewContact() {
  const qc = useQueryClient();

  const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [name, setName]           = useState("");
  const [company, setCompany]     = useState("");
  const [position, setPosition]   = useState("");
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [err, setErr]             = useState<string | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      setErr(null);
      if (!name.trim()) throw new Error("Nombre requerido");
      await createContact({
        id: uid(),
        name: name.trim(),
        company: company || undefined,
        position: position || undefined,
        email: email || undefined,
        phone: phone || undefined,
        account_id: accountId || undefined,
      } as any);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contacts"] });
      router.back();
    },
    onError: (e: any) => setErr(String(e?.message || e)),
  });

  return (
    <>
      <Stack.Screen
        options={{
          title: "Nuevo Contacto",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
      <View style={styles.screen}>
        {err ? <Text style={styles.err}>⚠️ {err}</Text> : null}

        <View style={{ gap: 12 }}>
          <TextInput
            placeholder="Nombre*"
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholderTextColor={SUBTLE}
          />
          <TextInput
            placeholder="Empresa (texto)"
            value={company}
            onChangeText={setCompany}
            style={styles.input}
            placeholderTextColor={SUBTLE}
          />
          <TextInput
            placeholder="Cargo"
            value={position}
            onChangeText={setPosition}
            style={styles.input}
            placeholderTextColor={SUBTLE}
          />
          <TextInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={SUBTLE}
          />
          <TextInput
            placeholder="Teléfono"
            value={phone}
            onChangeText={setPhone}
            style={styles.input}
            keyboardType="phone-pad"
            placeholderTextColor={SUBTLE}
          />
        </View>

        {/* Selector de Cuenta — sin margen arriba/abajo y chips compactas */}
        <Text style={styles.label}>Cuenta (opcional)</Text>
        {qAcc.isLoading ? (
          <Text style={styles.subtle}>Cargando cuentas…</Text>
        ) : qAcc.isError ? (
          <Text style={styles.err}>
            Error cargando cuentas: {String((qAcc.error as any)?.message || qAcc.error)}
          </Text>
        ) : (
          <FlatList
            horizontal
            data={qAcc.data ?? []}
            keyExtractor={(a) => a.id}
            contentContainerStyle={{ paddingVertical: 0 }}   // 👈 sin margen vertical
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ width: 8 }} />} // espacio entre chips
            renderItem={({ item }) => {
              const selected = accountId === item.id;
              return (
                <Pressable
                  onPress={() => setAccountId(selected ? undefined : item.id)}
                  style={[styles.chip, selected && styles.chipActive]}
                  accessibilityRole="button"
                >
                  <Text
                    style={[styles.chipText, selected && styles.chipTextActive]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.subtle}>
                No hay cuentas aún. Crea una en “Cuentas”.
              </Text>
            }
          />
        )}

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
            m.isPending && { opacity: 0.9 },
          ]}
          onPress={() => m.mutate()}
          disabled={m.isPending}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>
            {m.isPending ? "Guardando..." : "Guardar"}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 12,
    padding: 12,
  },

  label: { color: TEXT, fontWeight: "800", marginTop: 10, marginBottom: 4 },
  subtle: { color: SUBTLE },

  // 🔽 Chips compactas y sin “alto raro”
  chip: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",    // evita estirarse verticalmente
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { color: TEXT, fontWeight: "800", fontSize: 12, maxWidth: 160 },
  chipTextActive: { color: "#fff" },

  primaryBtn: {
    marginTop: 8,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  pressed: { opacity: 0.9 },

  err: { color: "#fecaca" },
});



// // app/contacts/new.tsx
// import { listAccounts } from "@/src/api/accounts";
// import { createContact } from "@/src/api/contacts";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { Stack, router } from "expo-router";
// import { useState } from "react";
// import {
//     FlatList,
//     Pressable,
//     StyleSheet,
//     Text,
//     TextInput,
//     View,
// } from "react-native";

// const uid = () =>
//   Math.random().toString(36).slice(2) + Date.now().toString(36);

// export default function NewContact() {
//   const qc = useQueryClient();

//   // 1) Traemos las cuentas existentes para el selector
//   const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

//   // 2) Estado del formulario
//   const [accountId, setAccountId] = useState<string | undefined>(undefined);
//   const [name, setName] = useState("");
//   const [company, setCompany] = useState(""); // opcional, mientras migramos a accounts
//   const [position, setPosition] = useState("");
//   const [email, setEmail] = useState("");
//   const [phone, setPhone] = useState("");

//   // 3) Mutación para crear
//   const m = useMutation({
//     mutationFn: async () => {
//       if (!name.trim()) throw new Error("Nombre requerido");
//       await createContact({
//         id: uid(),
//         name,
//         // company lo mandamos solo si no está vacío
//         company: company || undefined,
//         position: position || undefined,
//         email: email || undefined,
//         phone: phone || undefined,
//         // 👇 clave: enlazar con la cuenta elegida
//         account_id: accountId || undefined,
//       } as any);
//     },
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["contacts"] });
//       router.back();
//     },
//   });

//   return (
//     <>
//       <Stack.Screen options={{ title: "Nuevo Contacto" }} />
//       <View style={styles.container}>
//         <TextInput
//           placeholder="Nombre*"
//           value={name}
//           onChangeText={setName}
//           style={styles.input}
//         />

//         {/* Empresa “texto” (opcional mientras migramos) */}
//         <TextInput
//           placeholder="Empresa (texto)"
//           value={company}
//           onChangeText={setCompany}
//           style={styles.input}
//         />

//         <TextInput
//           placeholder="Cargo"
//           value={position}
//           onChangeText={setPosition}
//           style={styles.input}
//         />
//         <TextInput
//           placeholder="Email"
//           value={email}
//           onChangeText={setEmail}
//           style={styles.input}
//           keyboardType="email-address"
//         />
//         <TextInput
//           placeholder="Teléfono"
//           value={phone}
//           onChangeText={setPhone}
//           style={styles.input}
//           keyboardType="phone-pad"
//         />

//         {/* Selector de Cuenta */}
//         <Text style={styles.label}>Cuenta (opcional)</Text>
//         {qAcc.isLoading ? (
//           <Text style={{ opacity: 0.7 }}>Cargando cuentas…</Text>
//         ) : qAcc.isError ? (
//           <Text style={{ color: "crimson" }}>
//             Error cargando cuentas: {String((qAcc.error as any)?.message || qAcc.error)}
//           </Text>
//         ) : (
//           <FlatList
//             horizontal
//             data={qAcc.data ?? []}
//             keyExtractor={(a) => a.id}
//             contentContainerStyle={{ paddingVertical: 4 }}
//             renderItem={({ item }) => {
//               const selected = accountId === item.id;
//               return (
//                 <Pressable
//                   onPress={() => setAccountId(item.id)}
//                   style={[
//                     styles.chip,
//                     selected && { backgroundColor: "#1e90ff", borderColor: "#1e90ff" },
//                   ]}
//                 >
//                   <Text style={[styles.chipText, selected && { color: "#fff" }]}>
//                     {item.name}
//                   </Text>
//                 </Pressable>
//               );
//             }}
//             ListEmptyComponent={
//               <Text style={{ opacity: 0.7 }}>
//                 No hay cuentas aún. Crea una en “Cuentas”.
//               </Text>
//             }
//           />
//         )}

//         <Pressable
//           style={styles.btn}
//           onPress={() => m.mutate()}
//           disabled={m.isPending}
//         >
//           <Text style={styles.btnText}>
//             {m.isPending ? "Guardando..." : "Guardar"}
//           </Text>
//         </Pressable>
//       </View>
//     </>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, padding: 16, gap: 12 },
//   input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10 },
//   label: { fontWeight: "600", marginTop: 4 },
//   chip: {
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     borderRadius: 8,
//     borderWidth: 1,
//     borderColor: "#ddd",
//     marginRight: 8,
//   },
//   chipText: { color: "#000" },
//   btn: {
//     backgroundColor: "#16a34a",
//     padding: 12,
//     borderRadius: 8,
//     alignItems: "center",
//   },
//   btnText: { color: "#fff", fontWeight: "700" },
// });
