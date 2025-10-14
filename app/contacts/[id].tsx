// app/contacts/[id].tsx
import { listAccounts } from "@/src/api/accounts";
import { deleteContact, getContact, updateContact } from "@/src/api/contacts";
import { listDeals, type Deal } from "@/src/api/deals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Stack, router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
const ACCENT   = "#7c3aed";   // primario (morado)
const DANGER   = "#ef4444";   // eliminar / errores

export default function ContactDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = Array.isArray(id) ? id[0] : id;

  if (!contactId || contactId === "index") {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Detalle Contacto",
            headerStyle: { backgroundColor: BG },
            headerTintColor: TEXT,
            headerTitleStyle: { color: TEXT, fontWeight: "800" },
          }}
        />
        <View style={styles.screen}>
          <Text style={{ color: SUBTLE }}>Ruta inválida</Text>
        </View>
      </>
    );
  }

  const qc = useQueryClient();

  // Contacto
  const q = useQuery({
    queryKey: ["contact", contactId],
    queryFn: () => getContact(contactId),
  });

  // Cuentas para el picker
  const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

  // Deals asociados a este contacto
  const qDeals = useQuery({ queryKey: ["deals"], queryFn: listDeals });
  const dealsByContact = useMemo(
    () => (qDeals.data ?? []).filter((d) => d.contact_id === contactId),
    [qDeals.data, contactId]
  );

  // Estado local de edición
  const [companyText, setCompanyText] = useState("");
  const [accountId, setAccountId] = useState<string | undefined>(undefined);

  // Precargar valores cuando llega el contacto
  useEffect(() => {
    if (q.data) {
      setCompanyText(q.data.company ?? "");
      setAccountId(q.data.account_id ?? undefined);
    }
  }, [q.data?.company, q.data?.account_id, q.data]);

  const mUpd = useMutation({
    mutationFn: async () =>
      updateContact(contactId, {
        company: companyText || undefined,
        account_id: accountId || undefined,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contact", contactId] });
      await qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const mDel = useMutation({
    mutationFn: async () => deleteContact(contactId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contacts"] });
      router.back();
    },
  });

  return (
    <>
      <Stack.Screen
        options={{
          title: "Detalle Contacto",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
      <View style={styles.screen}>
        {q.isLoading ? (
          <Text style={{ color: SUBTLE }}>Cargando...</Text>
        ) : q.isError ? (
          <>
            <Text style={{ color: "#fecaca", marginBottom: 8 }}>
              Error: {String((q.error as any)?.message || q.error)}
            </Text>
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => q.refetch()}
            >
              <Text style={styles.btnText}>Reintentar</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => router.back()}
            >
              <Text style={styles.btnText}>Volver</Text>
            </Pressable>
          </>
        ) : !q.data ? (
          <Text style={{ color: SUBTLE }}>No encontrado</Text>
        ) : (
          <>
            <Text style={styles.title}>{q.data.name}</Text>
            {q.data.position ? (
              <Text style={styles.text}>
                Cargo: <Text style={styles.bold}>{q.data.position}</Text>
              </Text>
            ) : null}
            {q.data.email ? (
              <Text style={styles.text}>
                Email: <Text style={[styles.bold, styles.link]}>{q.data.email}</Text>
              </Text>
            ) : null}
            {q.data.phone ? (
              <Text style={styles.text}>
                Tel: <Text style={styles.bold}>{q.data.phone}</Text>
              </Text>
            ) : null}

            {/* Empresa (texto libre, opcional) */}
            <Text style={[styles.label, { marginTop: 12 }]}>Empresa (texto)</Text>
            <TextInput
              placeholder="Empresa"
              value={companyText}
              onChangeText={setCompanyText}
              style={styles.input}
              placeholderTextColor={SUBTLE}
            />

            {/* Cuenta (relación) — chips compactas y sin margen vertical */}
            <Text style={[styles.label, { marginTop: 12 }]}>Cuenta (opcional)</Text>
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
                contentContainerStyle={{ paddingVertical: 0 }}  // 👈 sin margen arriba/abajo
                showsHorizontalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
                renderItem={({ item }) => {
                  const selected = accountId === item.id;
                  return (
                    <Pressable
                      onPress={() => setAccountId(selected ? undefined : item.id)}
                      style={[styles.chip, selected && styles.chipActive]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text style={{ color: SUBTLE }}>
                    No hay cuentas. Crea una en “Cuentas”.
                  </Text>
                }
              />
            )}

            {/* Oportunidades asociadas */}
            <Text style={styles.section}>
              Oportunidades asociadas {dealsByContact.length ? `(${dealsByContact.length})` : ""}
            </Text>
            <View style={styles.box}>
              {qDeals.isLoading ? (
                <Text style={{ color: SUBTLE, padding: 12 }}>Cargando oportunidades…</Text>
              ) : dealsByContact.length === 0 ? (
                <Text style={{ color: SUBTLE, padding: 12 }}>
                  Sin oportunidades para este contacto.
                </Text>
              ) : (
                dealsByContact.map((d: Deal) => (
                  <Link key={d.id} href={`/deals/${d.id}`} asChild>
                    <Pressable style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{d.title}</Text>
                        <Text style={styles.rowSub}>
                          {etiqueta(d.stage)} {d.amount ? `· $${Intl.NumberFormat().format(d.amount)}` : ""}
                        </Text>
                      </View>
                    </Pressable>
                  </Link>
                ))
              )}
            </View>

            {/* Acciones */}
            <Pressable
              style={[styles.btn, styles.btnPrimary, mUpd.isPending && { opacity: 0.9 }]}
              onPress={() => mUpd.mutate()}
              disabled={mUpd.isPending}
            >
              <Text style={styles.btnText}>
                {mUpd.isPending ? "Guardando..." : "Guardar cambios"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.btnDanger, mDel.isPending && { opacity: 0.9 }]}
              onPress={() => mDel.mutate()}
              disabled={mDel.isPending}
            >
              <Text style={styles.btnText}>
                {mDel.isPending ? "Eliminando..." : "Eliminar"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </>
  );
}

function etiqueta(s?: Deal["stage"]): string {
  switch (s) {
    case "nuevo": return "Nuevo";
    case "calificado": return "Calificado";
    case "propuesta": return "Propuesta";
    case "negociacion": return "Negociación";
    case "ganado": return "Ganado";
    case "perdido": return "Perdido";
    default: return "—";
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: "900", color: TEXT },
  text: { color: TEXT, marginTop: 2 },
  bold: { fontWeight: "800" },
  link: { color: ACCENT, textDecorationLine: "underline" },
  label: { color: TEXT, fontWeight: "800" },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 12,
    padding: 10,
    marginTop: 6,
  },

  // 🔽 Chips compactas
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
    alignSelf: "flex-start", // evita estirarse verticalmente
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { color: TEXT, fontWeight: "800", fontSize: 12, maxWidth: 160 },
  chipTextActive: { color: "#fff" },

  section: { marginTop: 12, fontWeight: "900", fontSize: 16, color: TEXT },
  box: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: CARD,
  },
  row: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowTitle: { color: TEXT, fontWeight: "800" },
  rowSub: { fontSize: 12, color: SUBTLE },

  btn: { marginTop: 12, padding: 12, borderRadius: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "900" },
  btnPrimary: { backgroundColor: ACCENT, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  btnDanger: { backgroundColor: DANGER },
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
});



// // app/contacts/[id].tsx
// import { listAccounts } from "@/src/api/accounts";
// import { deleteContact, getContact, updateContact } from "@/src/api/contacts";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { Stack, router, useLocalSearchParams } from "expo-router";
// import React, { useEffect, useState } from "react";
// import {
//     FlatList,
//     Pressable,
//     StyleSheet,
//     Text,
//     TextInput,
//     View,
// } from "react-native";

// const ORANGE = "#FF6A00";
// const BG = "#0e0e0f";
// const CARD = "#151517";
// const BORDER = "#2a2a2c";
// const TEXT = "#f3f4f6";
// const SUBTLE = "rgba(255,255,255,0.7)";

// export default function ContactDetail() {
//   const { id } = useLocalSearchParams<{ id?: string | string[] }>();
//   const contactId = Array.isArray(id) ? id[0] : id;

//   if (!contactId || contactId === "index") {
//     return (
//       <>
//         <Stack.Screen options={{ title: "Detalle Contacto" }} />
//         <View style={[styles.screen, { justifyContent: "center", alignItems: "center" }]}>
//           <Text style={{ color: SUBTLE }}>Ruta inválida</Text>
//         </View>
//       </>
//     );
//   }

//   const qc = useQueryClient();

//   // Contacto
//   const q = useQuery({
//     queryKey: ["contact", contactId],
//     queryFn: () => getContact(contactId),
//   });

//   // Cuentas para el picker
//   const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

//   // Estado local de edición
//   const [companyText, setCompanyText] = useState("");
//   const [accountId, setAccountId] = useState<string | undefined>(undefined);

//   // Precargar valores cuando llega el contacto
//   useEffect(() => {
//     if (q.data) {
//       setCompanyText(q.data.company ?? "");
//       setAccountId(q.data.account_id ?? undefined);
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [q.data?.company, q.data?.account_id, q.data]);

//   const mUpd = useMutation({
//     mutationFn: async () =>
//       updateContact(contactId, {
//         company: companyText || undefined,
//         account_id: accountId || undefined,
//       }),
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["contact", contactId] });
//       await qc.invalidateQueries({ queryKey: ["contacts"] });
//     },
//   });

//   const mDel = useMutation({
//     mutationFn: async () => deleteContact(contactId),
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["contacts"] });
//       router.back();
//     },
//   });

//   return (
//     <>
//       <Stack.Screen options={{ title: "Detalle Contacto" }} />
//       <View style={styles.screen}>
//         {q.isLoading ? (
//           <Text style={{ color: SUBTLE }}>Cargando...</Text>
//         ) : q.isError ? (
//           <>
//             <Text style={{ color: "#fecaca", marginBottom: 8 }}>
//               Error: {String((q.error as any)?.message || q.error)}
//             </Text>
//             <Pressable
//               style={({ pressed }) => [styles.btnSecondary, pressed && styles.pressed]}
//               onPress={() => q.refetch()}
//             >
//               <Text style={styles.btnText}>Reintentar</Text>
//             </Pressable>
//             <Pressable
//               style={({ pressed }) => [styles.btnTertiary, pressed && styles.pressed]}
//               onPress={() => router.back()}
//             >
//               <Text style={styles.btnText}>Volver</Text>
//             </Pressable>
//           </>
//         ) : !q.data ? (
//           <Text style={{ color: SUBTLE }}>No encontrado</Text>
//         ) : (
//           <>
//             <Text style={styles.title}>{q.data.name}</Text>
//             {q.data.position ? <Text style={styles.info}>Cargo: <Text style={styles.infoStrong}>{q.data.position}</Text></Text> : null}
//             {q.data.email ? <Text style={styles.info}>Email: <Text style={styles.infoStrong}>{q.data.email}</Text></Text> : null}
//             {q.data.phone ? <Text style={styles.info}>Tel: <Text style={styles.infoStrong}>{q.data.phone}</Text></Text> : null}

//             {/* Empresa (texto libre, opcional) */}
//             <Text style={styles.label}>Empresa (texto)</Text>
//             <TextInput
//               placeholder="Empresa"
//               placeholderTextColor={SUBTLE}
//               value={companyText}
//               onChangeText={setCompanyText}
//               style={styles.input}
//             />

//             {/* Cuenta (relación) */}
//             <Text style={styles.label}>Cuenta (opcional)</Text>
//             {qAcc.isLoading ? (
//               <Text style={{ color: SUBTLE }}>Cargando cuentas…</Text>
//             ) : qAcc.isError ? (
//               <Text style={{ color: "#fecaca" }}>
//                 Error cargando cuentas: {String((qAcc.error as any)?.message || qAcc.error)}
//               </Text>
//             ) : (
//               <FlatList
//                 horizontal
//                 data={qAcc.data ?? []}
//                 keyExtractor={(a) => a.id}
//                 contentContainerStyle={{ paddingVertical: 4 }}
//                 renderItem={({ item }) => {
//                   const selected = accountId === item.id;
//                   return (
//                     <Pressable
//                       onPress={() => setAccountId(item.id)}
//                       style={({ pressed }) => [
//                         styles.chip,
//                         selected && styles.chipSelected,
//                         pressed && styles.pressed,
//                       ]}
//                     >
//                       <Text style={[styles.chipText, selected && { color: "#fff" }]}>
//                         {item.name}
//                       </Text>
//                     </Pressable>
//                   );
//                 }}
//                 ListEmptyComponent={
//                   <Text style={{ color: SUBTLE }}>
//                     No hay cuentas. Crea una en “Cuentas”.
//                   </Text>
//                 }
//                 showsHorizontalScrollIndicator={false}
//               />
//             )}

//             {mUpd.isError ? (
//               <Text style={styles.errorText}>
//                 {(mUpd.error as any)?.message || "Error al guardar"}
//               </Text>
//             ) : null}

//             <Pressable
//               style={({ pressed }) => [
//                 styles.btnPrimary,
//                 pressed && styles.pressed,
//                 mUpd.isPending && styles.disabled,
//               ]}
//               onPress={() => mUpd.mutate()}
//               disabled={mUpd.isPending}
//             >
//               <Text style={styles.btnText}>
//                 {mUpd.isPending ? "Guardando..." : "Guardar cambios"}
//               </Text>
//             </Pressable>

//             <Pressable
//               style={({ pressed }) => [
//                 styles.btnDanger,
//                 pressed && styles.pressed,
//                 mDel.isPending && styles.disabled,
//               ]}
//               onPress={() => mDel.mutate()}
//               disabled={mDel.isPending}
//             >
//               <Text style={styles.btnText}>
//                 {mDel.isPending ? "Eliminando..." : "Eliminar"}
//               </Text>
//             </Pressable>
//           </>
//         )}
//       </View>
//     </>
//   );
// }

// const styles = StyleSheet.create({
//   screen: {
//     flex: 1,
//     backgroundColor: BG,
//     padding: 16,
//     gap: 10,
//   },
//   title: {
//     color: TEXT,
//     fontSize: 22,
//     fontWeight: "900",
//   },
//   info: { color: SUBTLE },
//   infoStrong: { color: TEXT, fontWeight: "700" },
//   label: {
//     color: TEXT,
//     marginTop: 12,
//     fontWeight: "800",
//   },
//   input: {
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: CARD,
//     color: TEXT,
//     borderRadius: 12,
//     padding: 12,
//     marginTop: 6,
//   },
//   chip: {
//     paddingHorizontal: 12,
//     paddingVertical: 8,
//     borderRadius: 9999,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: CARD,
//     marginRight: 8,
//   },
//   chipSelected: {
//     backgroundColor: ORANGE,
//     borderColor: ORANGE,
//   },
//   chipText: { color: TEXT, fontWeight: "700" },
//   btnPrimary: {
//     backgroundColor: ORANGE,
//     borderRadius: 12,
//     paddingVertical: 14,
//     alignItems: "center",
//     justifyContent: "center",
//     marginTop: 8,
//   },
//   btnSecondary: {
//     backgroundColor: "#27272a",
//     borderRadius: 12,
//     paddingVertical: 12,
//     alignItems: "center",
//     justifyContent: "center",
//     marginBottom: 6,
//   },
//   btnTertiary: {
//     backgroundColor: "#1f2937",
//     borderRadius: 12,
//     paddingVertical: 12,
//     alignItems: "center",
//     justifyContent: "center",
//     marginBottom: 6,
//   },
//   btnDanger: {
//     backgroundColor: "#ef4444",
//     borderRadius: 12,
//     paddingVertical: 14,
//     alignItems: "center",
//     justifyContent: "center",
//     marginTop: 8,
//   },
//   btnText: { color: "#fff", fontWeight: "900" },
//   pressed: { opacity: 0.9 },
//   disabled: { opacity: 0.6 },
//   errorText: { color: "#fecaca", fontSize: 12, marginTop: 6 },
// });


// // app/contacts/[id].tsx
// import { listAccounts } from "@/src/api/accounts";
// import { deleteContact, getContact, updateContact } from "@/src/api/contacts";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { Stack, router, useLocalSearchParams } from "expo-router";
// import React, { useEffect, useState } from "react";
// import {
//     FlatList,
//     Pressable,
//     StyleSheet,
//     Text,
//     TextInput,
//     View,
// } from "react-native";

// export default function ContactDetail() {
//   const { id } = useLocalSearchParams<{ id?: string | string[] }>();
//   const contactId = Array.isArray(id) ? id[0] : id;

//   if (!contactId || contactId === "index") {
//     return (
//       <>
//         <Stack.Screen options={{ title: "Detalle Contacto" }} />
//         <View style={styles.container}>
//           <Text style={{ opacity: 0.7 }}>Ruta inválida</Text>
//         </View>
//       </>
//     );
//   }

//   const qc = useQueryClient();

//   // Contacto
//   const q = useQuery({
//     queryKey: ["contact", contactId],
//     queryFn: () => getContact(contactId),
//   });

//   // Cuentas para el picker
//   const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

//   // Estado local de edición
//   const [companyText, setCompanyText] = useState("");
//   const [accountId, setAccountId] = useState<string | undefined>(undefined);

//   // Precargar valores cuando llega el contacto
//   useEffect(() => {
//     if (q.data) {
//       setCompanyText(q.data.company ?? "");
//       setAccountId(q.data.account_id ?? undefined);
//     }
//   }, [q.data?.company, q.data?.account_id, q.data]); // dependencias correctas

//   const mUpd = useMutation({
//     mutationFn: async () =>
//       updateContact(contactId, {
//         company: companyText || undefined,
//         account_id: accountId || undefined,
//       }),
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["contact", contactId] });
//       await qc.invalidateQueries({ queryKey: ["contacts"] });
//     },
//   });

//   const mDel = useMutation({
//     mutationFn: async () => deleteContact(contactId),
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["contacts"] });
//       router.back();
//     },
//   });

//   return (
//     <>
//       <Stack.Screen options={{ title: "Detalle Contacto" }} />
//       <View style={styles.container}>
//         {q.isLoading ? (
//           <Text style={{ opacity: 0.7 }}>Cargando...</Text>
//         ) : q.isError ? (
//           <>
//             <Text style={{ color: "crimson", marginBottom: 8 }}>
//               Error: {String((q.error as any)?.message || q.error)}
//             </Text>
//             <Pressable
//               style={[styles.btn, { backgroundColor: "#1e90ff" }]}
//               onPress={() => q.refetch()}
//             >
//               <Text style={styles.btnText}>Reintentar</Text>
//             </Pressable>
//             <Pressable
//               style={[styles.btn, { backgroundColor: "#6b7280" }]}
//               onPress={() => router.back()}
//             >
//               <Text style={styles.btnText}>Volver</Text>
//             </Pressable>
//           </>
//         ) : !q.data ? (
//           <Text style={{ opacity: 0.7 }}>No encontrado</Text>
//         ) : (
//           <>
//             <Text style={styles.title}>{q.data.name}</Text>
//             {q.data.position ? <Text>Cargo: {q.data.position}</Text> : null}
//             {q.data.email ? <Text>Email: {q.data.email}</Text> : null}
//             {q.data.phone ? <Text>Tel: {q.data.phone}</Text> : null}

//             {/* Empresa (texto libre, opcional) */}
//             <Text style={{ marginTop: 12, fontWeight: "600" }}>Empresa (texto)</Text>
//             <TextInput
//               placeholder="Empresa"
//               value={companyText}
//               onChangeText={setCompanyText}
//               style={styles.input}
//             />

//             {/* Cuenta (relación) */}
//             <Text style={{ marginTop: 12, fontWeight: "600" }}>
//               Cuenta (opcional)
//             </Text>
//             {qAcc.isLoading ? (
//               <Text style={{ opacity: 0.7 }}>Cargando cuentas…</Text>
//             ) : qAcc.isError ? (
//               <Text style={{ color: "crimson" }}>
//                 Error cargando cuentas:{" "}
//                 {String((qAcc.error as any)?.message || qAcc.error)}
//               </Text>
//             ) : (
//               <FlatList
//                 horizontal
//                 data={qAcc.data ?? []}
//                 keyExtractor={(a) => a.id}
//                 contentContainerStyle={{ paddingVertical: 4 }}
//                 renderItem={({ item }) => {
//                   const selected = accountId === item.id;
//                   return (
//                     <Pressable
//                       onPress={() => setAccountId(item.id)}
//                       style={[
//                         styles.chip,
//                         selected && {
//                           backgroundColor: "#1e90ff",
//                           borderColor: "#1e90ff",
//                         },
//                       ]}
//                     >
//                       <Text
//                         style={[
//                           styles.chipText,
//                           selected && { color: "#fff" },
//                         ]}
//                       >
//                         {item.name}
//                       </Text>
//                     </Pressable>
//                   );
//                 }}
//                 ListEmptyComponent={
//                   <Text style={{ opacity: 0.7 }}>
//                     No hay cuentas. Crea una en “Cuentas”.
//                   </Text>
//                 }
//               />
//             )}

//             <Pressable
//               style={[styles.btn, { backgroundColor: "#1e90ff" }]}
//               onPress={() => mUpd.mutate()}
//               disabled={mUpd.isPending}
//             >
//               <Text style={styles.btnText}>
//                 {mUpd.isPending ? "Guardando..." : "Guardar cambios"}
//               </Text>
//             </Pressable>

//             <Pressable
//               style={[styles.btn, { backgroundColor: "#ef4444" }]}
//               onPress={() => mDel.mutate()}
//               disabled={mDel.isPending}
//             >
//               <Text style={styles.btnText}>
//                 {mDel.isPending ? "Eliminando..." : "Eliminar"}
//               </Text>
//             </Pressable>
//           </>
//         )}
//       </View>
//     </>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, padding: 16, gap: 8 },
//   title: { fontSize: 20, fontWeight: "700" },
//   input: {
//     borderWidth: 1,
//     borderColor: "#ddd",
//     borderRadius: 8,
//     padding: 10,
//     marginTop: 6,
//   },
//   btn: { marginTop: 12, padding: 12, borderRadius: 8, alignItems: "center" },
//   btnText: { color: "#fff", fontWeight: "700" },
//   chip: {
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     borderRadius: 8,
//     borderWidth: 1,
//     borderColor: "#ddd",
//     marginRight: 8,
//   },
//   chipText: { color: "#000" },
// });
