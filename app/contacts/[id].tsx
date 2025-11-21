// app/contacts/[id].tsx
import { deleteContact, getContact, updateContact } from "@/src/api/contacts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// 🔗 Relacionados (actividades y notas)
import RelatedActivities from "@/src/components/RelatedActivities";
import RelatedNotes from "@/src/components/RelatedNotes";

// 🔹 Miembros reales del workspace
import {
  listWorkspaceMembers,
  type WorkspaceMember,
} from "@/src/api/workspaceMembers";

/* 🎨 Tema consistente */
const BG = "#0b0c10";
const CARD = "#14151a";
const FIELD = "#121318";
const BORDER = "#272a33";
const TEXT = "#e8ecf1";
const SUBTLE = "#a9b0bd";
const ACCENT = "#7c3aed"; // primario (morado)
const DANGER = "#ef4444"; // eliminar / errores

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

  // Miembros del workspace
  const qMembers = useQuery({
    queryKey: ["workspaceMembers"],
    queryFn: listWorkspaceMembers,
  });
  const members: WorkspaceMember[] = qMembers.data ?? [];

  // Estado local de edición
  const [name, setName] = useState("");
  const [clientType, setClientType] = useState<"productora" | "agencia" | "">(
    ""
  );
  const [companyText, setCompanyText] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Precargar valores cuando llega el contacto
  useEffect(() => {
    if (q.data) {
      setName(q.data.name ?? "");
      setClientType(
        (q.data as any).client_type === "productora" ||
          (q.data as any).client_type === "agencia"
          ? (q.data as any).client_type
          : ""
      );
      setCompanyText(q.data.company ?? "");
      setPosition(q.data.position ?? "");
      setEmail(q.data.email ?? "");
      setPhone(q.data.phone ?? "");
    }
  }, [q.data]);

  // Helper confirm
  const confirm = async (title: string, message: string): Promise<boolean> => {
    if (Platform.OS === "web") {
      return window.confirm(`${title}\n\n${message}`);
    }
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
        { text: "Confirmar", style: "destructive", onPress: () => resolve(true) },
      ]);
    });
  };

  const mUpd = useMutation({
    mutationFn: async () =>
      updateContact(
        contactId,
        {
          name: name.trim() || undefined,
          company: companyText || undefined,
          position: position || undefined,
          email: email || undefined,
          phone: phone || undefined,
          client_type: clientType || undefined,
        } as any
      ),
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

  const cid = contactId as string;

  const handleSavePress = async () => {
    const ok = await confirm(
      "Guardar cambios",
      "¿Seguro quieres guardar los cambios de este contacto?"
    );
    if (!ok) return;
    mUpd.mutate();
  };

  const handleDeletePress = async () => {
    const ok = await confirm(
      "Eliminar contacto",
      "Si confirmas se eliminará el contacto y sus actividades. ¿Deseas continuar?"
    );
    if (!ok) return;
    mDel.mutate();
  };

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
      <ScrollView
        style={{ flex: 1, backgroundColor: BG }}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
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
            {/* Nombre */}
            <Text style={styles.section}>Datos del contacto</Text>
            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={[styles.input, styles.nameInput]}
              value={name}
              onChangeText={setName}
              placeholder="Nombre del contacto"
              placeholderTextColor={SUBTLE}
            />

            {/* Creador */}
            {q.data.created_by_name && (
              <View style={styles.creatorBox}>
                <Text style={styles.creatorLabel}>Creado por:</Text>
                <Text style={styles.creatorName}>{q.data.created_by_name}</Text>
                {q.data.created_by_email && (
                  <Text style={styles.creatorEmail}>
                    {q.data.created_by_email}
                  </Text>
                )}
              </View>
            )}

            {/* Cliente: Productora / Agencia */}
            <Text style={styles.label}>Cliente</Text>
            <View style={styles.clientTypeRow}>
              {(["productora", "agencia"] as const).map((t) => {
                const active = clientType === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() =>
                      setClientType((prev) => (prev === t ? "" : t))
                    }
                    style={[
                      styles.clientTypeChip,
                      active && styles.clientTypeChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.clientTypeText,
                        active && styles.clientTypeTextActive,
                      ]}
                    >
                      {t === "productora" ? "Productora" : "Agencia"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Empresa */}
            <Text style={styles.label}>Empresa</Text>
            <TextInput
              placeholder="Empresa"
              value={companyText}
              onChangeText={setCompanyText}
              style={styles.input}
              placeholderTextColor={SUBTLE}
            />

            {/* Cargo */}
            <Text style={styles.label}>Cargo</Text>
            <TextInput
              placeholder="Cargo"
              value={position}
              onChangeText={setPosition}
              style={styles.input}
              placeholderTextColor={SUBTLE}
            />

            {/* Email */}
            <Text style={styles.label}>Email</Text>
            <TextInput
              placeholder="usuario@dominio.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              placeholderTextColor={SUBTLE}
            />

            {/* Teléfono */}
            <Text style={styles.label}>Teléfono</Text>
            <TextInput
              placeholder="+58 412 000 0000"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={styles.input}
              placeholderTextColor={SUBTLE}
            />

            {/* Relacionados */}
            <Text style={styles.section}>Actividades</Text>
            <RelatedActivities filters={{ contact_id: cid }} members={members} />

            <Text style={styles.section}>Notas</Text>
            <RelatedNotes filters={{ contact_id: cid }} />

            {/* Acciones */}
            <Pressable
              style={[
                styles.btn,
                styles.btnPrimary,
                (mUpd.isPending || mDel.isPending) && { opacity: 0.9 },
              ]}
              onPress={handleSavePress}
              disabled={mUpd.isPending || mDel.isPending}
            >
              <Text style={styles.btnText}>
                {mUpd.isPending ? "Guardando..." : "Guardar cambios"}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.btn,
                styles.btnDanger,
                (mUpd.isPending || mDel.isPending) && { opacity: 0.9 },
              ]}
              onPress={handleDeletePress}
              disabled={mDel.isPending || mUpd.isPending}
            >
              <Text style={styles.btnText}>
                {mDel.isPending ? "Eliminando..." : "Eliminar"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 8 },

  container: {
    padding: 12,
    paddingBottom: 120,
    gap: 8,
  },

  // Creador
  creatorBox: {
    backgroundColor: "rgba(34, 211, 238, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(34, 211, 238, 0.2)",
    borderRadius: 10,
    padding: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  creatorLabel: {
    color: "#22d3ee",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  creatorName: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "800",
  },
  creatorEmail: {
    color: SUBTLE,
    fontSize: 11,
    marginTop: 1,
  },

  label: {
    color: TEXT,
    fontWeight: "800",
    marginTop: 4,
  },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
    fontSize: 13,
  },
  nameInput: {
    fontSize: 17,
    fontWeight: "900",
  },

  section: {
    marginTop: 8,
    fontWeight: "900",
    fontSize: 15,
    color: TEXT,
  },

  // Cliente: productora / agencia
  clientTypeRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  clientTypeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },
  clientTypeChipActive: {
    borderColor: ACCENT,
    backgroundColor: "rgba(124,58,237,0.25)",
  },
  clientTypeText: {
    color: SUBTLE,
    fontWeight: "700",
    fontSize: 11,
  },
  clientTypeTextActive: {
    color: "#fff",
  },

  btn: { marginTop: 10, padding: 11, borderRadius: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "900" },
  btnPrimary: {
    backgroundColor: ACCENT,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
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
// import { listDeals, type Deal } from "@/src/api/deals";
// import {
//   useMutation,
//   useQuery,
//   useQueryClient,
// } from "@tanstack/react-query";
// import { Link, Stack, router, useLocalSearchParams } from "expo-router";
// import { useEffect, useMemo, useState } from "react";
// import {
//   FlatList,
//   Pressable,
//   ScrollView,
//   StyleSheet,
//   Text,
//   TextInput,
//   View,
// } from "react-native";

// // 🔗 Relacionados (actividades y notas)
// import RelatedActivities from "@/src/components/RelatedActivities";
// import RelatedNotes from "@/src/components/RelatedNotes";

// // 🔹 Miembros reales del workspace
// import {
//   listWorkspaceMembers,
//   type WorkspaceMember,
// } from "@/src/api/workspaceMembers";

// /* 🎨 Tema consistente */
// const BG = "#0b0c10";
// const CARD = "#14151a";
// const FIELD = "#121318";
// const BORDER = "#272a33";
// const TEXT = "#e8ecf1";
// const SUBTLE = "#a9b0bd";
// const ACCENT = "#7c3aed"; // primario (morado)
// const DANGER = "#ef4444"; // eliminar / errores

// export default function ContactDetail() {
//   const { id } = useLocalSearchParams<{ id?: string | string[] }>();
//   const contactId = Array.isArray(id) ? id[0] : id;

//   if (!contactId || contactId === "index") {
//     return (
//       <>
//         <Stack.Screen
//           options={{
//             title: "Detalle Contacto",
//             headerStyle: { backgroundColor: BG },
//             headerTintColor: TEXT,
//             headerTitleStyle: { color: TEXT, fontWeight: "800" },
//           }}
//         />
//         <View style={styles.screen}>
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

//   // Deals asociados a este contacto
//   const qDeals = useQuery({ queryKey: ["deals"], queryFn: listDeals });
//   const dealsByContact = useMemo(
//     () => (qDeals.data ?? []).filter((d) => d.contact_id === contactId),
//     [qDeals.data, contactId]
//   );

//   // 🔹 Miembros reales del workspace (misma lógica que en app/tasks/new.tsx)
//   const qMembers = useQuery({
//     queryKey: ["workspaceMembers"],
//     queryFn: listWorkspaceMembers,
//   });
//   const members: WorkspaceMember[] = qMembers.data ?? [];

//   // Estado local de edición
//   const [companyText, setCompanyText] = useState("");
//   const [accountId, setAccountId] = useState<string | undefined>(undefined);

//   // Precargar valores cuando llega el contacto
//   useEffect(() => {
//     if (q.data) {
//       setCompanyText(q.data.company ?? "");
//       setAccountId(q.data.account_id ?? undefined);
//     }
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

//   // ✅ para filtros de componentes relacionados (TypeScript happy)
//   const cid = contactId as string;

//   return (
//     <>
//       <Stack.Screen
//         options={{
//           title: "Detalle Contacto",
//           headerStyle: { backgroundColor: BG },
//           headerTintColor: TEXT,
//           headerTitleStyle: { color: TEXT, fontWeight: "800" },
//         }}
//       />
//       <ScrollView
//         style={{ flex: 1, backgroundColor: BG }}
//         contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }}
//         keyboardShouldPersistTaps="handled"
//       >
//         {q.isLoading ? (
//           <Text style={{ color: SUBTLE }}>Cargando...</Text>
//         ) : q.isError ? (
//           <>
//             <Text style={{ color: "#fecaca", marginBottom: 8 }}>
//               Error: {String((q.error as any)?.message || q.error)}
//             </Text>
//             <Pressable
//               style={[styles.btn, styles.btnPrimary]}
//               onPress={() => q.refetch()}
//             >
//               <Text style={styles.btnText}>Reintentar</Text>
//             </Pressable>
//             <Pressable
//               style={[styles.btn, styles.btnGhost]}
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

//             {/* Información del creador */}
//             {q.data.created_by_name && (
//               <View style={styles.creatorBox}>
//                 <Text style={styles.creatorLabel}>Creado por:</Text>
//                 <Text style={styles.creatorName}>{q.data.created_by_name}</Text>
//                 {q.data.created_by_email && (
//                   <Text style={styles.creatorEmail}>
//                     {q.data.created_by_email}
//                   </Text>
//                 )}
//               </View>
//             )}

//             {q.data.position ? (
//               <Text style={styles.text}>
//                 Cargo: <Text style={styles.bold}>{q.data.position}</Text>
//               </Text>
//             ) : null}
//             {q.data.email ? (
//               <Text style={styles.text}>
//                 Email:{" "}
//                 <Text style={[styles.bold, styles.link]}>{q.data.email}</Text>
//               </Text>
//             ) : null}
//             {q.data.phone ? (
//               <Text style={styles.text}>
//                 Tel: <Text style={styles.bold}>{q.data.phone}</Text>
//               </Text>
//             ) : null}

//             {/* Empresa (texto libre, opcional) */}
//             <Text style={[styles.label, { marginTop: 12 }]}>
//               Empresa (texto)
//             </Text>
//             <TextInput
//               placeholder="Empresa"
//               value={companyText}
//               onChangeText={setCompanyText}
//               style={styles.input}
//               placeholderTextColor={SUBTLE}
//             />

//             {/* Cuenta (relación) — chips compactas */}
//             <Text style={[styles.label, { marginTop: 12 }]}>
//               Cuenta (opcional)
//             </Text>
//             {qAcc.isLoading ? (
//               <Text style={{ color: SUBTLE }}>Cargando cuentas…</Text>
//             ) : qAcc.isError ? (
//               <Text style={{ color: "#fecaca" }}>
//                 Error cargando cuentas:{" "}
//                 {String((qAcc.error as any)?.message || qAcc.error)}
//               </Text>
//             ) : (
//               <FlatList
//                 horizontal
//                 data={qAcc.data ?? []}
//                 keyExtractor={(a) => a.id}
//                 contentContainerStyle={{ paddingVertical: 0 }}
//                 showsHorizontalScrollIndicator={false}
//                 ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
//                 renderItem={({ item }) => {
//                   const selected = accountId === item.id;
//                   return (
//                     <Pressable
//                       onPress={() =>
//                         setAccountId(selected ? undefined : item.id)
//                       }
//                       style={[styles.chip, selected && styles.chipActive]}
//                       accessibilityRole="button"
//                     >
//                       <Text
//                         style={[
//                           styles.chipText,
//                           selected && styles.chipTextActive,
//                         ]}
//                         numberOfLines={1}
//                       >
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
//               />
//             )}

//             {/* Oportunidades asociadas */}
//             <Text style={styles.section}>
//               Oportunidades asociadas{" "}
//               {dealsByContact.length ? `(${dealsByContact.length})` : ""}
//             </Text>
//             <View style={styles.box}>
//               {qDeals.isLoading ? (
//                 <Text style={{ color: SUBTLE, padding: 12 }}>
//                   Cargando oportunidades…
//                 </Text>
//               ) : dealsByContact.length === 0 ? (
//                 <Text style={{ color: SUBTLE, padding: 12 }}>
//                   Sin oportunidades para este contacto.
//                 </Text>
//               ) : (
//                 dealsByContact.map((d: Deal) => (
//                   <Link key={d.id} href={`/deals/${d.id}`} asChild>
//                     <Pressable style={styles.row}>
//                       <View style={{ flex: 1 }}>
//                         <Text style={styles.rowTitle}>{d.title}</Text>
//                         <Text style={styles.rowSub}>
//                           {etiqueta(d.stage)}{" "}
//                           {d.amount
//                             ? `· $${Intl.NumberFormat().format(d.amount)}`
//                             : ""}
//                         </Text>
//                       </View>
//                     </Pressable>
//                   </Link>
//                 ))
//               )}
//             </View>

//             {/* ——— Relacionados (Actividades & Notas) ——— */}
//             <Text style={styles.section}>Actividades</Text>
//             <RelatedActivities
//               filters={{ contact_id: cid }}
//               // 👇 ahora vienen de tenant_memberships (igual que en NewActivity)
//               members={members}
//             />

//             <Text style={styles.section}>Notas</Text>
//             <RelatedNotes filters={{ contact_id: cid }} />

//             {/* Acciones */}
//             <Pressable
//               style={[
//                 styles.btn,
//                 styles.btnPrimary,
//                 mUpd.isPending && { opacity: 0.9 },
//               ]}
//               onPress={() => mUpd.mutate()}
//               disabled={mUpd.isPending}
//             >
//               <Text style={styles.btnText}>
//                 {mUpd.isPending ? "Guardando..." : "Guardar cambios"}
//               </Text>
//             </Pressable>

//             <Pressable
//               style={[
//                 styles.btn,
//                 styles.btnDanger,
//                 mDel.isPending && { opacity: 0.9 },
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
//       </ScrollView>
//     </>
//   );
// }

// function etiqueta(s?: Deal["stage"]): string {
//   switch (s) {
//     case "nuevo":
//       return "Nuevo";
//     case "calificado":
//       return "Calificado";
//     case "propuesta":
//       return "Propuesta";
//     case "negociacion":
//       return "Negociación";
//     case "ganado":
//       return "Ganado";
//     case "perdido":
//       return "Perdido";
//     default:
//       return "—";
//   }
// }

// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 8 },
//   title: { fontSize: 20, fontWeight: "900", color: TEXT },

//   // Box del creador
//   creatorBox: {
//     backgroundColor: "rgba(34, 211, 238, 0.08)",
//     borderWidth: 1,
//     borderColor: "rgba(34, 211, 238, 0.2)",
//     borderRadius: 10,
//     padding: 10,
//     marginTop: 8,
//     marginBottom: 8,
//   },
//   creatorLabel: {
//     color: "#22d3ee",
//     fontSize: 11,
//     fontWeight: "700",
//     textTransform: "uppercase",
//     letterSpacing: 0.5,
//     marginBottom: 4,
//   },
//   creatorName: {
//     color: TEXT,
//     fontSize: 14,
//     fontWeight: "800",
//   },
//   creatorEmail: {
//     color: SUBTLE,
//     fontSize: 12,
//     marginTop: 2,
//   },

//   text: { color: TEXT, marginTop: 2 },
//   bold: { fontWeight: "800" },
//   link: { color: ACCENT, textDecorationLine: "underline" },
//   label: { color: TEXT, fontWeight: "800" },

//   input: {
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: FIELD,
//     color: TEXT,
//     borderRadius: 12,
//     padding: 10,
//     marginTop: 6,
//   },

//   // 🔽 Chips compactas
//   chip: {
//     minHeight: 28,
//     paddingHorizontal: 10,
//     paddingVertical: 4,
//     borderRadius: 14,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: CARD,
//     alignItems: "center",
//     justifyContent: "center",
//     alignSelf: "flex-start",
//   },
//   chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
//   chipText: { color: TEXT, fontWeight: "800", fontSize: 12, maxWidth: 160 },
//   chipTextActive: { color: "#fff" },

//   section: { marginTop: 12, fontWeight: "900", fontSize: 16, color: TEXT },
//   box: {
//     borderWidth: 1,
//     borderColor: BORDER,
//     borderRadius: 12,
//     overflow: "hidden",
//     backgroundColor: CARD,
//   },
//   row: {
//     padding: 12,
//     borderBottomWidth: 1,
//     borderBottomColor: BORDER,
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 8,
//   },
//   rowTitle: { color: TEXT, fontWeight: "800" },
//   rowSub: { fontSize: 12, color: SUBTLE },

//   btn: { marginTop: 12, padding: 12, borderRadius: 12, alignItems: "center" },
//   btnText: { color: "#fff", fontWeight: "900" },
//   btnPrimary: {
//     backgroundColor: ACCENT,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.16)",
//   },
//   btnDanger: { backgroundColor: DANGER },
//   btnGhost: {
//     backgroundColor: "rgba(255,255,255,0.06)",
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.12)",
//   },
// });
