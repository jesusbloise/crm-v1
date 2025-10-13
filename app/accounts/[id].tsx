// app/accounts/[id].tsx
import { getAccount } from "@/src/api/accounts";
import { listContacts } from "@/src/api/contacts";
import { listDeals, type Deal } from "@/src/api/deals";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const accountId = Array.isArray(id) ? id[0] : id;

  const qAcc = useQuery({ queryKey: ["account", accountId], queryFn: () => getAccount(accountId!), enabled: !!accountId });
  const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
  const qDeal = useQuery({ queryKey: ["deals"], queryFn: listDeals });

  const contacts = (qCon.data ?? []).filter(c => c.account_id === accountId);
  const deals = (qDeal.data ?? []).filter(d => d.account_id === accountId);

  if (!accountId) {
    return <View style={styles.container}><Text>Ruta inválida</Text></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Cuenta" }} />
      <ScrollView contentContainerStyle={styles.container}>
        {qAcc.isLoading ? (
          <Text style={{ opacity: 0.7 }}>Cargando…</Text>
        ) : qAcc.isError ? (
          <Text style={{ color: "crimson" }}>Error: {String((qAcc.error as any)?.message || qAcc.error)}</Text>
        ) : !qAcc.data ? (
          <Text>No encontrado</Text>
        ) : (
          <>
            <Text style={styles.title}>{qAcc.data.name}</Text>
            {qAcc.data.website ? <Text>Web: {qAcc.data.website}</Text> : null}
            {qAcc.data.phone ? <Text>Tel: {qAcc.data.phone}</Text> : null}

            {/* Acciones rápidas */}
            <View style={{ marginTop: 12, gap: 8 }}>
              <Link href="/contacts/new" asChild>
                <Pressable style={styles.action}>
                  <Text style={styles.actionText}>＋ Nuevo contacto</Text>
                </Pressable>
              </Link>
              <Link href="/deals/new" asChild>
                <Pressable style={styles.action}>
                  <Text style={styles.actionText}>＋ Nueva oportunidad</Text>
                </Pressable>
              </Link>
            </View>

            {/* Contactos */}
            <Text style={styles.section}>Contactos</Text>
            {contacts.length === 0 ? (
              <Text style={{ opacity: 0.6 }}>No hay contactos asociados.</Text>
            ) : (
              <View style={styles.box}>
                {contacts.map(c => (
                  <Link key={c.id} href={`/contacts/${c.id}`} asChild>
                    <Pressable style={styles.row}>
                      <Text style={styles.rowTitle}>{c.name}</Text>
                      {c.email ? <Text style={styles.rowSub}>{c.email}</Text> : null}
                    </Pressable>
                  </Link>
                ))}
              </View>
            )}

            {/* Deals */}
            <Text style={styles.section}>Oportunidades</Text>
            {deals.length === 0 ? (
              <Text style={{ opacity: 0.6 }}>No hay oportunidades asociadas.</Text>
            ) : (
              <View style={styles.box}>
                {deals.map((d: Deal) => (
                  <Link key={d.id} href={`/deals/${d.id}`} asChild>
                    <Pressable style={styles.row}>
                      <Text style={styles.rowTitle}>{d.title}</Text>
                      <Text style={styles.rowSub}>
                        {d.stage} {d.amount ? `· $${Intl.NumberFormat().format(d.amount)}` : ""}
                      </Text>
                    </Pressable>
                  </Link>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: "800" },
  section: { marginTop: 16, fontWeight: "800", fontSize: 16 },
  box: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, overflow: "hidden" },
  row: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  rowTitle: { fontWeight: "700" },
  rowSub: { fontSize: 12, opacity: 0.7 },
  action: { backgroundColor: "#1e90ff", padding: 10, borderRadius: 10, alignItems: "center" },
  actionText: { color: "white", fontWeight: "800" },
});
