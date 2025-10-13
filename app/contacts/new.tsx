// app/contacts/new.tsx
import { listAccounts } from "@/src/api/accounts";
import { createContact } from "@/src/api/contacts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useState } from "react";
import {
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

const ORANGE = "#FF6A00";
const BG = "#0e0e0f";
const CARD = "#151517";
const BORDER = "#2a2a2c";
const TEXT = "#f3f4f6";
const SUBTLE = "rgba(255,255,255,0.7)";

const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function NewContact() {
  const qc = useQueryClient();

  // 1) Traemos las cuentas existentes para el selector
  const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

  // 2) Estado del formulario
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [name, setName] = useState("");
  const [company, setCompany] = useState(""); // opcional, mientras migramos a accounts
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // 3) Mutación para crear
  const m = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nombre requerido");
      await createContact({
        id: uid(),
        name,
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
  });

  return (
    <>
      <Stack.Screen options={{ title: "Nuevo Contacto" }} />
      <View style={styles.screen}>
        <View style={{ gap: 12 }}>
          <TextInput
            placeholder="Nombre*"
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholderTextColor={SUBTLE}
          />

          {/* Empresa “texto” (opcional mientras migramos) */}
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

        {/* Selector de Cuenta */}
        <Text style={styles.label}>Cuenta (opcional)</Text>
        {qAcc.isLoading ? (
          <Text style={{ color: SUBTLE }}>Cargando cuentas…</Text>
        ) : qAcc.isError ? (
          <Text style={{ color: "#fecaca" }}>
            Error cargando cuentas: {String((qAcc.error as any)?.message || qAcc.error)}
          </Text>
        ) : (
          <FlatList
            horizontal
            data={qAcc.data ?? []}
            keyExtractor={(a) => a.id}
            contentContainerStyle={{ paddingVertical: 4 }}
            renderItem={({ item }) => {
              const selected = accountId === item.id;
              return (
                <Pressable
                  onPress={() => setAccountId(item.id)}
                  style={[
                    styles.chip,
                    selected && { backgroundColor: ORANGE, borderColor: ORANGE },
                  ]}
                >
                  <Text style={[styles.chipText, selected && { color: "#fff" }]}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={{ color: SUBTLE }}>
                No hay cuentas aún. Crea una en “Cuentas”.
              </Text>
            }
          />
        )}

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          onPress={() => m.mutate()}
          disabled={m.isPending}
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
  screen: {
    flex: 1,
    backgroundColor: BG,
    padding: 16,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    color: TEXT,
    borderRadius: 12,
    padding: 12,
  },
  label: { color: TEXT, fontWeight: "800", marginTop: 8, marginBottom: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    marginRight: 8,
    backgroundColor: CARD,
  },
  chipText: { color: TEXT, fontWeight: "600" },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: ORANGE,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  pressed: { opacity: 0.9 },
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
