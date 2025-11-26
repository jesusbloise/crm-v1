// app/deals/[id].tsx
import { listAccounts } from "@/src/api/accounts";
import { listContacts } from "@/src/api/contacts";
import {
  deleteDeal,
  getDeal,
  updateDeal,
  type Deal,
  type DealStage,
} from "@/src/api/deals";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// 🔁 Reutilizables
import RelatedActivities from "@/src/components/RelatedActivities";
import RelatedNotes from "@/src/components/RelatedNotes";

/* 🎨 Tema */
const BG       = "#0b0c10";
const CARD     = "#14151a";
const BORDER   = "#272a33";
const TEXT     = "#e8ecf1";
const SUBTLE   = "#a9b0bd";
const ACCENT   = "#7c3aed";  // morado
const ACCENT_2 = "#22d3ee";  // cian
const DANGER   = "#ef4444";

// 👉 Secciones claras (para mantener coherencia visual)
const LIGHT_CARD   = "#ECEFF4";
const LIGHT_BORDER = "#CBD5E1";
const DARK_TEXT    = "#0F172A";

const STAGES: DealStage[] = [
  "nuevo",
  "calificado",
  "propuesta",
  "negociacion",
  "ganado",
  "perdido",
];

export default function DealDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const dealId = Array.isArray(id) ? id[0] : id;
  const qc = useQueryClient();

  // Deal + relacionados
  const qDeal = useQuery({
    queryKey: ["deal", dealId],
    queryFn: () => getDeal(dealId!),
    enabled: !!dealId,
  });
  const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

  // Estado editable del deal
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
        // Los componentes Related* se actualizan solos con sus keys
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

  // Relacionados
  const account = useMemo(
    () => (qAcc.data ?? []).find((a) => a.id === qDeal.data?.account_id),
    [qAcc.data, qDeal.data?.account_id]
  );
  const contact = useMemo(
    () => (qCon.data ?? []).find((c) => c.id === qDeal.data?.contact_id),
    [qCon.data, qDeal.data?.contact_id]
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen
        options={{
          title: "Oportunidad",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />

      <ScrollView contentContainerStyle={styles.container}>
        {qDeal.isLoading ? (
          <Text style={{ color: SUBTLE }}>Cargando…</Text>
        ) : qDeal.isError ? (
          <Text style={{ color: "#fecaca" }}>
            Error: {String((qDeal.error as any)?.message || qDeal.error)}
          </Text>
        ) : !qDeal.data ? (
          <Text style={{ color: TEXT }}>No encontrado</Text>
        ) : (
          <>
            {/* ——— Campos editables ——— */}
            <Text style={styles.label}>Título</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Título del deal"
              placeholderTextColor={SUBTLE}
            />

            <Text style={styles.label}>Monto</Text>
            <TextInput
              style={styles.input}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="numeric"
              placeholder="Ej: 15000"
              placeholderTextColor={SUBTLE}
            />

            <Text style={styles.label}>Etapa</Text>
            <View style={styles.pillsRow}>
              {STAGES.map((s) => {
                const active = stage === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setStage(s)}
                    style={[styles.pill, active && styles.pillActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    hitSlop={8}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {s}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ——— Relacionados ——— */}
            <Text style={styles.section}>Relacionados</Text>
            <View style={styles.box}>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Cuenta</Text>
                {account ? (
                  <Link href={`/accounts/${account.id}`} asChild>
                    <Pressable accessibilityRole="link" hitSlop={8}>
                      <Text style={styles.link}>{account.name}</Text>
                    </Pressable>
                  </Link>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Contacto</Text>
                {contact ? (
                  <Link href={`/contacts/${contact.id}`} asChild>
                    <Pressable accessibilityRole="link" hitSlop={8}>
                      <Text style={styles.link}>{contact.name}</Text>
                    </Pressable>
                  </Link>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>
            </View>

            {/* ——— Actividades (reutilizable) ——— */}
            <View style={[styles.box, styles.emphasisBoxLight]}>
              <Text style={styles.sectionLight}>Actividades</Text>
              <RelatedActivities filters={{ deal_id: dealId! }} />
            </View>

            {/* ——— Notas (reutilizable) ——— */}
            <View style={[styles.box, styles.emphasisBoxLight]}>
              <Text style={styles.sectionLight}>Notas</Text>
              <RelatedNotes filters={{ deal_id: dealId! }} />
            </View>

            {/* ——— Acciones ——— */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
                mSave.isPending && { opacity: 0.8 },
              ]}
              onPress={() => mSave.mutate()}
              disabled={mSave.isPending}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.primaryBtnText}>
                {mSave.isPending ? "Guardando..." : "Guardar cambios"}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.dangerBtn,
                pressed && styles.pressed,
                mDelete.isPending && { opacity: 0.8 },
              ]}
              onPress={() => mDelete.mutate()}
              disabled={mDelete.isPending}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.primaryBtnText}>
                {mDelete.isPending ? "Eliminando..." : "Eliminar"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* ——— Styles ——— */
const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  label: { color: TEXT, fontWeight: "800" },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    color: TEXT,
    borderRadius: 12,
    padding: 12,
  },

  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: CARD,
  },
  pillActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  pillText: { fontSize: 12, color: TEXT, fontWeight: "600" },
  pillTextActive: { color: "#fff", fontWeight: "900" },

  section: { marginTop: 6, color: TEXT, fontWeight: "900", fontSize: 16 },

  box: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: CARD,
    padding: 10,
    gap: 8,
  },

  row: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  rowTitle: { color: TEXT, fontWeight: "800" },
  link: { color: ACCENT_2, textDecorationLine: "underline", fontWeight: "800" },
  muted: { color: SUBTLE },

  // Light section title inside light boxes
  sectionLight: {
    color: DARK_TEXT,
    fontWeight: "900",
    fontSize: 16,
    paddingHorizontal: 4,
    paddingTop: 6,
  },

  // Botones principales
  primaryBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: ACCENT,
  },
  dangerBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: DANGER,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  pressed: { opacity: 0.9 },

  // —— Variantes claras (marco visual de secciones)
  emphasisBoxLight: {
    backgroundColor: LIGHT_CARD,
    borderColor: LIGHT_BORDER,
  },
});

