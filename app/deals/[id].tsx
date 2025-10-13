// app/deals/[id].tsx
import { listAccounts } from "@/src/api/accounts";
import { listContacts } from "@/src/api/contacts";
import { deleteDeal, getDeal, updateDeal, type Deal, type DealStage } from "@/src/api/deals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

const STAGES: DealStage[] = ["nuevo","calificado","propuesta","negociacion","ganado","perdido"];

export default function DealDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const dealId = Array.isArray(id) ? id[0] : id;
  const qc = useQueryClient();

  const qDeal = useQuery({
    queryKey: ["deal", dealId],
    queryFn: () => getDeal(dealId!),
    enabled: !!dealId,
  });
  const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

  // Estado editable
  const [title, setTitle] = useState("");
  const [amountText, setAmountText] = useState("");
  const [stage, setStage] = useState<DealStage>("nuevo");

  useEffect(() => {
    if (qDeal.data) {
      setTitle(qDeal.data.title ?? "");
      setAmountText(qDeal.data.amount != null ? String(qDeal.data.amount) : "");
      setStage((qDeal.data.stage as DealStage) ?? "nuevo");
    }
  }, [qDeal.data]);

  const mSave = useMutation({
    mutationFn: async () => {
      if (!dealId) return;
      await updateDeal(dealId, {
        title: title.trim(),
        amount: amountText ? Number(amountText) : null,
        stage,
      } as Partial<Deal>);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["deal", dealId] }),
        qc.invalidateQueries({ queryKey: ["deals"] }),
      ]);
    },
  });

  const mDelete = useMutation({
    mutationFn: async () => {
      if (!dealId) return;
      await deleteDeal(dealId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["deals"] });
      router.back();
    },
  });

  // Derivados para mostrar nombres de cuenta/contacto y linkear
  const account = useMemo(
    () => (qAcc.data ?? []).find(a => a.id === qDeal.data?.account_id),
    [qAcc.data, qDeal.data?.account_id]
  );
  const contact = useMemo(
    () => (qCon.data ?? []).find(c => c.id === qDeal.data?.contact_id),
    [qCon.data, qDeal.data?.contact_id]
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Oportunidad" }} />
      <ScrollView contentContainerStyle={styles.container}>
        {qDeal.isLoading ? (
          <Text style={{ opacity: 0.7 }}>Cargando…</Text>
        ) : qDeal.isError ? (
          <Text style={{ color: "crimson" }}>
            Error: {String((qDeal.error as any)?.message || qDeal.error)}
          </Text>
        ) : !qDeal.data ? (
          <Text>No encontrado</Text>
        ) : (
          <>
            {/* Campos editables */}
            <Text style={styles.label}>Título</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Título del deal"
            />

            <Text style={styles.label}>Monto</Text>
            <TextInput
              style={styles.input}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="numeric"
              placeholder="Ej: 15000"
            />

            <Text style={styles.label}>Etapa</Text>
            <View style={styles.pillsRow}>
              {STAGES.map(s => (
                <Pressable
                  key={s}
                  onPress={() => setStage(s)}
                  style={[styles.pill, stage === s && styles.pillActive]}
                >
                  <Text style={[styles.pillText, stage === s && styles.pillTextActive]}>{s}</Text>
                </Pressable>
              ))}
            </View>

            {/* Relacionados (solo vista + link) */}
            <Text style={styles.section}>Relacionados</Text>
            <View style={styles.box}>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Cuenta</Text>
                {account ? (
                  <Link href={`/accounts/${account.id}`} asChild>
                    <Pressable><Text style={styles.link}>{account.name}</Text></Pressable>
                  </Link>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Contacto</Text>
                {contact ? (
                  <Link href={`/contacts/${contact.id}`} asChild>
                    <Pressable><Text style={styles.link}>{contact.name}</Text></Pressable>
                  </Link>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>
            </View>

            {/* Acciones */}
            <Pressable
              style={[styles.btn, { backgroundColor: "#16a34a" }]}
              onPress={() => mSave.mutate()}
              disabled={mSave.isPending}
            >
              <Text style={styles.btnText}>{mSave.isPending ? "Guardando..." : "Guardar cambios"}</Text>
            </Pressable>

            <Pressable
              style={[styles.btn, { backgroundColor: "#ef4444" }]}
              onPress={() => mDelete.mutate()}
              disabled={mDelete.isPending}
            >
              <Text style={styles.btnText}>{mDelete.isPending ? "Eliminando..." : "Eliminar"}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  label: { fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 10 },
  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  pillActive: { backgroundColor: "#111827", borderColor: "#111827" },
  pillText: { fontSize: 12 },
  pillTextActive: { color: "white", fontWeight: "700" },

  section: { marginTop: 10, fontWeight: "800", fontSize: 16 },
  box: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, overflow: "hidden" },
  row: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", flexDirection: "row", justifyContent: "space-between" },
  rowTitle: { fontWeight: "700" },
  link: { color: "#1e90ff", textDecorationLine: "underline", fontWeight: "700" },
  muted: { opacity: 0.6 },

  btn: { marginTop: 12, padding: 12, borderRadius: 10, alignItems: "center" },
  btnText: { color: "white", fontWeight: "800" },
});
