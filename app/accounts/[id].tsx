// app/accounts/[id].tsx
import { deleteAccount, getAccount, updateAccount } from "@/src/api/accounts";
import { listContacts } from "@/src/api/contacts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const BG = "#0e0e0f";
const CARD = "#151517";
const BORDER = "#2a2a2c";
const TEXT = "#f3f4f6";
const SUBTLE = "rgba(255,255,255,0.7)";
const ORANGE = "#FF6A00";
const RED = "#ef4444";

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const accountId = Array.isArray(id) ? id[0] : id;

  const qc = useQueryClient();

  const qAcc = useQuery({
    queryKey: ["account", accountId],
    queryFn: () => getAccount(accountId!),
    enabled: !!accountId,
  });

  // Traemos todos los contactos (como ya haces en otras pantallas)
  const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

  // Filtramos contactos asociados a esta cuenta
  const contacts = useMemo(
    () => (qCon.data ?? []).filter((c) => c.account_id === accountId),
    [qCon.data, accountId]
  );

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (qAcc.data) {
      setName(qAcc.data.name ?? "");
      setWebsite(qAcc.data.website ?? "");
      setPhone(qAcc.data.phone ?? "");
    }
  }, [qAcc.data]);

  const mUpd = useMutation({
    mutationFn: async () => {
      if (!accountId) return;
      await updateAccount(accountId, {
        name: name.trim(),
        website: website || null,
        phone: phone || null,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["account", accountId] });
      await qc.invalidateQueries({ queryKey: ["accounts.list"] });
      await qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const mDel = useMutation({
    mutationFn: async () => {
      if (!accountId) return;
      await deleteAccount(accountId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["accounts.list"] });
      await qc.invalidateQueries({ queryKey: ["accounts"] });
      router.back();
    },
  });

  return (
    <>
      <Stack.Screen
        options={{
          title: "Cuenta",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT },
        }}
      />
      <View style={styles.screen}>
        {!accountId ? (
          <Text style={{ color: SUBTLE }}>Ruta inválida</Text>
        ) : qAcc.isLoading ? (
          <Text style={{ color: SUBTLE }}>Cargando…</Text>
        ) : qAcc.isError ? (
          <Text style={{ color: "#fecaca" }}>
            Error: {String((qAcc.error as any)?.message || qAcc.error)}
          </Text>
        ) : !qAcc.data ? (
          <Text style={{ color: SUBTLE }}>No encontrada</Text>
        ) : (
          <>
            {/* Datos editables */}
            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Nombre"
              placeholderTextColor={SUBTLE}
            />

            <Text style={styles.label}>Website</Text>
            <TextInput
              style={styles.input}
              value={website}
              onChangeText={setWebsite}
              placeholder="https://…"
              placeholderTextColor={SUBTLE}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Teléfono</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Teléfono"
              placeholderTextColor={SUBTLE}
              keyboardType="phone-pad"
            />

            {/* Contactos asociados */}
            <Text style={styles.section}>
              Contactos asociados {contacts.length ? `(${contacts.length})` : ""}
            </Text>
            <View style={styles.box}>
              {qCon.isLoading ? (
                <Text style={{ color: SUBTLE, padding: 12 }}>
                  Cargando contactos…
                </Text>
              ) : contacts.length === 0 ? (
                <View style={{ padding: 12 }}>
                  <Text style={{ color: SUBTLE, marginBottom: 8 }}>
                    No hay contactos vinculados a esta cuenta.
                  </Text>
                  <Link href="/contacts/new" asChild>
                    <Pressable style={[styles.smallBtn, { backgroundColor: ORANGE }]}>
                      <Text style={styles.smallBtnText}>＋ Nuevo contacto</Text>
                    </Pressable>
                  </Link>
                </View>
              ) : (
                contacts.map((c) => (
                  <Link key={c.id} href={`/contacts/${c.id}`} asChild>
                    <Pressable style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{c.name}</Text>
                        {!!(c.email || c.phone) && (
                          <Text style={styles.rowSub}>
                            {c.email ?? c.phone}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  </Link>
                ))
              )}
            </View>

            {/* Acciones */}
            <Pressable
              style={[styles.btn, { backgroundColor: ORANGE }]}
              onPress={() => mUpd.mutate()}
              disabled={mUpd.isPending}
            >
              <Text style={styles.btnText}>
                {mUpd.isPending ? "Guardando..." : "Guardar cambios"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.btn, { backgroundColor: RED }]}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },
  label: { color: TEXT, fontWeight: "800" },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    color: TEXT,
    borderRadius: 12,
    padding: 12,
  },

  section: { marginTop: 6, color: TEXT, fontWeight: "900", fontSize: 16 },
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
  rowSub: { color: SUBTLE, fontSize: 12 },

  btn: { marginTop: 8, padding: 12, borderRadius: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "900" },
  smallBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  smallBtnText: { color: "#fff", fontWeight: "900" },
});

// // app/accounts/[id].tsx
// import { getAccount } from "@/src/api/accounts";
// import { listContacts } from "@/src/api/contacts";
// import { listDeals, type Deal } from "@/src/api/deals";
// import { useQuery } from "@tanstack/react-query";
// import { Link, Stack, useLocalSearchParams } from "expo-router";
// import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

// export default function AccountDetail() {
//   const { id } = useLocalSearchParams<{ id?: string | string[] }>();
//   const accountId = Array.isArray(id) ? id[0] : id;

//   const qAcc = useQuery({ queryKey: ["account", accountId], queryFn: () => getAccount(accountId!), enabled: !!accountId });
//   const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
//   const qDeal = useQuery({ queryKey: ["deals"], queryFn: listDeals });

//   const contacts = (qCon.data ?? []).filter(c => c.account_id === accountId);
//   const deals = (qDeal.data ?? []).filter(d => d.account_id === accountId);

//   if (!accountId) {
//     return <View style={styles.container}><Text>Ruta inválida</Text></View>;
//   }

//   return (
//     <View style={{ flex: 1 }}>
//       <Stack.Screen options={{ title: "Cuenta" }} />
//       <ScrollView contentContainerStyle={styles.container}>
//         {qAcc.isLoading ? (
//           <Text style={{ opacity: 0.7 }}>Cargando…</Text>
//         ) : qAcc.isError ? (
//           <Text style={{ color: "crimson" }}>Error: {String((qAcc.error as any)?.message || qAcc.error)}</Text>
//         ) : !qAcc.data ? (
//           <Text>No encontrado</Text>
//         ) : (
//           <>
//             <Text style={styles.title}>{qAcc.data.name}</Text>
//             {qAcc.data.website ? <Text>Web: {qAcc.data.website}</Text> : null}
//             {qAcc.data.phone ? <Text>Tel: {qAcc.data.phone}</Text> : null}

//             {/* Acciones rápidas */}
//             <View style={{ marginTop: 12, gap: 8 }}>
//               <Link href="/contacts/new" asChild>
//                 <Pressable style={styles.action}>
//                   <Text style={styles.actionText}>＋ Nuevo contacto</Text>
//                 </Pressable>
//               </Link>
//               <Link href="/deals/new" asChild>
//                 <Pressable style={styles.action}>
//                   <Text style={styles.actionText}>＋ Nueva oportunidad</Text>
//                 </Pressable>
//               </Link>
//             </View>

//             {/* Contactos */}
//             <Text style={styles.section}>Contactos</Text>
//             {contacts.length === 0 ? (
//               <Text style={{ opacity: 0.6 }}>No hay contactos asociados.</Text>
//             ) : (
//               <View style={styles.box}>
//                 {contacts.map(c => (
//                   <Link key={c.id} href={`/contacts/${c.id}`} asChild>
//                     <Pressable style={styles.row}>
//                       <Text style={styles.rowTitle}>{c.name}</Text>
//                       {c.email ? <Text style={styles.rowSub}>{c.email}</Text> : null}
//                     </Pressable>
//                   </Link>
//                 ))}
//               </View>
//             )}

//             {/* Deals */}
//             <Text style={styles.section}>Oportunidades</Text>
//             {deals.length === 0 ? (
//               <Text style={{ opacity: 0.6 }}>No hay oportunidades asociadas.</Text>
//             ) : (
//               <View style={styles.box}>
//                 {deals.map((d: Deal) => (
//                   <Link key={d.id} href={`/deals/${d.id}`} asChild>
//                     <Pressable style={styles.row}>
//                       <Text style={styles.rowTitle}>{d.title}</Text>
//                       <Text style={styles.rowSub}>
//                         {d.stage} {d.amount ? `· $${Intl.NumberFormat().format(d.amount)}` : ""}
//                       </Text>
//                     </Pressable>
//                   </Link>
//                 ))}
//               </View>
//             )}
//           </>
//         )}
//       </ScrollView>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { padding: 16, gap: 10 },
//   title: { fontSize: 22, fontWeight: "800" },
//   section: { marginTop: 16, fontWeight: "800", fontSize: 16 },
//   box: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, overflow: "hidden" },
//   row: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
//   rowTitle: { fontWeight: "700" },
//   rowSub: { fontSize: 12, opacity: 0.7 },
//   action: { backgroundColor: "#1e90ff", padding: 10, borderRadius: 10, alignItems: "center" },
//   actionText: { color: "white", fontWeight: "800" },
// });
