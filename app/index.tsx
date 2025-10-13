// app/index.tsx
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { listAccounts } from "@/src/api/accounts";
import { listContacts } from "@/src/api/contacts";
import { listDeals, type Deal } from "@/src/api/deals";
import { listLeads } from "@/src/api/leads";

export default function Home() {
  const router = useRouter();

  const qDeals = useQuery({ queryKey: ["deals"], queryFn: listDeals });
  const qAcc   = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const qCon   = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
  const qLeads = useQuery({ queryKey: ["leads"], queryFn: listLeads });

  const deals = qDeals.data ?? [];
  const won   = deals.filter(d => d.stage === "ganado").length;

  const recent = [...deals]
    .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))
    .slice(0, 5);

  const loading = qDeals.isLoading || qAcc.isLoading || qCon.isLoading || qLeads.isLoading;
  const hasError = qDeals.isError || qAcc.isError || qCon.isError || qLeads.isError;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Inicio" }} />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>CRM ATÓMICA</Text>
          <Text style={styles.subtitle}>Todo tu pipeline en un solo lugar ⚡️</Text>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator /></View>
        ) : hasError ? (
          <View style={styles.center}>
            <Text style={{ color: "crimson", textAlign: "center" }}>
              Error cargando datos. Verifica el servidor en http://localhost:4000
            </Text>
          </View>
        ) : (
          <>
            {/* KPIs */}
            <View style={styles.kpiRow}>
              <KPI label="Oportunidades" value={deals.length} emoji="📈" />
              <KPI label="Ganadas" value={won} emoji="🏆" />
              <KPI label="Cuentas" value={(qAcc.data ?? []).length} emoji="🏢" />
              <KPI label="Contactos" value={(qCon.data ?? []).length} emoji="👥" />
              <KPI label="Prospectos" value={(qLeads.data ?? []).length} emoji="🎯" />
            </View>

            {/* Accesos rápidos */}
            <View style={styles.grid}>
              <NavCard title="Oportunidades" desc="Gestiona tu pipeline" emoji="🗂️" onPress={() => router.push("/deals")} />
              <NavCard title="Cuentas"       desc="Empresas y clientes"  emoji="🏢"  onPress={() => router.push("/accounts")} />
              <NavCard title="Contactos"     desc="Personas y relaciones" emoji="👤"  onPress={() => router.push("/contacts")} />
              <NavCard title="Prospectos"    desc="Captura y califica"    emoji="✨"  onPress={() => router.push("/leads")} />
            </View>

            {/* Recientes */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recientes</Text>
              <View style={{ gap: 10 }}>
                {recent.map(d => (
                  <Pressable key={d.id} style={styles.recentCard} onPress={() => router.push(`/deals/${d.id}`)}>
                    <Text style={styles.recentTitle} numberOfLines={2}>{d.title}</Text>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{labelStage(d.stage)}</Text>
                    </View>
                  </Pressable>
                ))}
                {recent.length === 0 && (
                  <Text style={{ opacity: 0.6 }}>Aún no hay oportunidades. Crea la primera 📌</Text>
                )}
              </View>
            </View>

            {/* CTA crear rápido */}
            <View style={styles.quickRow}>
              <Pressable style={[styles.quickBtn, { backgroundColor: "#111827" }]} onPress={() => router.push("/deals/new")}>
                <Text style={styles.quickText}>＋ Nueva Oportunidad</Text>
              </Pressable>
              <Pressable style={[styles.quickBtn, { backgroundColor: "#1e293b" }]} onPress={() => router.push("/leads/new")}>
                <Text style={styles.quickText}>＋ Nuevo Prospecto</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function KPI({ label, value, emoji }: { label: string; value: number; emoji: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiEmoji}>{emoji}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function NavCard({ title, desc, emoji, onPress }: { title: string; desc: string; emoji: string; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.cardEmoji}>{emoji}</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDesc}>{desc}</Text>
    </Pressable>
  );
}

function labelStage(s?: Deal["stage"]) {
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
  container: { padding: 16, gap: 16 },
  header: { gap: 6, marginTop: 6 },
  brand: { fontSize: 24, fontWeight: "900", letterSpacing: 0.5, textAlign: "center" },
  subtitle: { opacity: 0.7, textAlign: "center" },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpi: { flexGrow: 1, minWidth: 130, backgroundColor: "white", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#eee" },
  kpiEmoji: { fontSize: 18, opacity: 0.9 },
  kpiValue: { fontSize: 22, fontWeight: "900", marginTop: 6 },
  kpiLabel: { opacity: 0.7 },

  section: { gap: 10, marginTop: 4 },
  sectionTitle: { fontWeight: "900", fontSize: 16 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { flexGrow: 1, minWidth: 160, backgroundColor: "#0f172a", borderRadius: 16, padding: 14 },
  cardEmoji: { fontSize: 20 },
  cardTitle: { color: "white", fontWeight: "900", fontSize: 16, marginTop: 6 },
  cardDesc: { color: "rgba(255,255,255,0.8)", marginTop: 2, fontSize: 12 },

  recentCard: { backgroundColor: "white", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#eee", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  recentTitle: { fontWeight: "800", flex: 1, marginRight: 12 },

  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 12, fontWeight: "800", color: "#3730a3" },

  quickRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  quickBtn: { flex: 1, borderRadius: 12, padding: 14, alignItems: "center", justifyContent: "center" },
  quickText: { color: "white", fontWeight: "900" },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
});
