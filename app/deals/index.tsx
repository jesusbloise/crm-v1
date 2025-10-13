// app/deals/index.tsx
import { listAccounts } from "@/src/api/accounts";
import { listDeals, updateDeal, type Deal, type DealStage } from "@/src/api/deals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const STAGES: DealStage[] = ["nuevo","calificado","propuesta","negociacion","ganado","perdido"];

export default function DealsBoard() {
  const qc = useQueryClient();
  const qDeals = useQuery({ queryKey: ["deals"], queryFn: listDeals });
  const qAcc   = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

  const byStage = useMemo(() => {
    const map: Record<DealStage, Deal[]> = {
      nuevo: [], calificado: [], propuesta: [], negociacion: [], ganado: [], perdido: []
    };
    for (const d of qDeals.data ?? []) {
      const s = (d.stage as DealStage) || "nuevo";
      map[s].push(d);
    }
    return map;
  }, [qDeals.data]);

  const mStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: DealStage }) => {
      await updateDeal(id, { stage });
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ["deals"] });
      await qc.invalidateQueries({ queryKey: ["deal", vars.id] });
    },
  });

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Oportunidades" }} />
      {qDeals.isLoading ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : qDeals.isError ? (
        <View style={styles.center}><Text style={{ color: "crimson" }}>
          Error: {String((qDeals.error as any)?.message || qDeals.error)}
        </Text></View>
      ) : (
        <ScrollView horizontal contentContainerStyle={styles.board} showsHorizontalScrollIndicator={false}>
          {STAGES.map((stage) => (
            <View key={stage} style={styles.column}>
              <View style={styles.columnHeader}>
                <Text style={styles.columnTitle}>{etiqueta(stage)}</Text>
                <Text style={styles.columnCount}>{byStage[stage].length}</Text>
              </View>

              <View style={{ gap: 10 }}>
                {byStage[stage].map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    accountName={nombreCuenta(deal.account_id, qAcc.data)}
                    onChangeStage={(s) => mStage.mutate({ id: deal.id, stage: s })}
                    isUpdating={mStage.isPending && mStage.variables?.id === deal.id}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      <Link href="/deals/new" asChild>
        <Pressable style={styles.fab}><Text style={styles.fabText}>＋</Text></Pressable>
      </Link>
    </View>
  );
}

function DealCard({
  deal,
  accountName,
  onChangeStage,
  isUpdating,
}: {
  deal: Deal;
  accountName?: string;
  onChangeStage: (s: DealStage) => void;
  isUpdating?: boolean;
}) {
  const currentIndex = Math.max(0, STAGES.indexOf((deal.stage as DealStage) || "nuevo"));

  return (
    <View style={styles.card}>
      <Link href={`/deals/${deal.id}`} asChild>
        <Pressable>
          <Text style={styles.cardTitle} numberOfLines={2}>{deal.title}</Text>
          {accountName ? <Text style={styles.cardSub}>{accountName}</Text> : null}
        </Pressable>
      </Link>

      {/* Progress strip de etapas (sin monto) */}
      <View style={styles.stageStrip}>
        {STAGES.map((s, idx) => {
          const active = idx <= currentIndex;
          return (
            <Pressable
              key={s}
              onPress={() => onChangeStage(s)}
              style={[styles.dot, active && styles.dotActive]}
            >
              {/* Accesible visualmente con ancho/alto; sin texto */}
            </Pressable>
          );
        })}
      </View>

      {/* Etiqueta compacta de etapa actual */}
      <View style={styles.badgeRow}>
        <Text style={[styles.badge, badgeStyle(deal.stage as DealStage)]}>
          {etiqueta(deal.stage as DealStage)}
        </Text>
        {isUpdating ? <Text style={styles.saving}>Guardando…</Text> : null}
      </View>
    </View>
  );
}

function etiqueta(s: DealStage): string {
  switch (s) {
    case "nuevo": return "Nuevo";
    case "calificado": return "Calificado";
    case "propuesta": return "Propuesta";
    case "negociacion": return "Negociación";
    case "ganado": return "Ganado";
    case "perdido": return "Perdido";
    default: return "Nuevo";
  }
}

function nombreCuenta(id?: string | null, accounts?: { id: string; name: string }[]) {
  if (!id || !accounts) return undefined;
  return accounts.find(a => a.id === id)?.name;
}

function badgeStyle(s: DealStage) {
  const base = { backgroundColor: "#eef2ff", color: "#3730a3" };      // indigo
  if (s === "negociacion") return { backgroundColor: "#fff7ed", color: "#9a3412" }; // orange
  if (s === "propuesta")   return { backgroundColor: "#ecfeff", color: "#155e75" }; // cyan
  if (s === "calificado")  return { backgroundColor: "#f0fdf4", color: "#166534" }; // green
  if (s === "ganado")      return { backgroundColor: "#eafff3", color: "#065f46" }; // teal
  if (s === "perdido")     return { backgroundColor: "#fef2f2", color: "#991b1b" }; // red
  return base;
}

const DOT_SIZE = 10;

const styles = StyleSheet.create({
  board: { padding: 12, gap: 12 },
  column: { width: 300, backgroundColor: "#fafafa", borderRadius: 12, padding: 12, borderColor: "#eee", borderWidth: 1 },
  columnHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  columnTitle: { fontWeight: "800" },
  columnCount: { opacity: 0.6, fontWeight: "700" },

  card: { backgroundColor: "white", borderRadius: 12, padding: 12, borderColor: "#eee", borderWidth: 1, gap: 8 },
  cardTitle: { fontWeight: "800", fontSize: 15 },
  cardSub: { opacity: 0.7 },

  stageStrip: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, borderWidth: 1, borderColor: "#d1d5db", backgroundColor: "white" },
  dotActive: { backgroundColor: "#111827", borderColor: "#111827" },

  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: "hidden", fontSize: 12, fontWeight: "800" } as any,
  saving: { fontSize: 12, opacity: 0.6 },

  fab: {
    position: "absolute", right: 16, bottom: 24,
    width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
    backgroundColor: "#111827", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  fabText: { color: "white", fontSize: 28, marginTop: -2 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
