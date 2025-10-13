// app/index.tsx
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import {
    ActivityIndicator,
    Image,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { listAccounts } from "@/src/api/accounts";
import { listContacts } from "@/src/api/contacts";
import { listDeals, type Deal, type DealStage } from "@/src/api/deals";
import { listLeads } from "@/src/api/leads";

// Ajusta la extensión si no es .png
const LOGO = require("../assets/images/ATOMICA-Logo-02.png");

const ORANGE = "#FF6A00";
const ORANGE_DARK = "#D95700";
const BG = "#0e0e0f";
const CARD = "#151517";
const BORDER = "#2a2a2c";
const TEXT = "#f3f4f6";
const SUBTLE = "rgba(255,255,255,0.7)";

const STAGES: DealStage[] = ["nuevo","calificado","propuesta","negociacion","ganado","perdido"];

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

  const loading  = qDeals.isLoading || qAcc.isLoading || qCon.isLoading || qLeads.isLoading;
  const hasError = qDeals.isError   || qAcc.isError   || qCon.isError   || qLeads.isError;

  const accounts = qAcc.data ?? [];
  const accountName = (id?: string | null) =>
    accounts.find(a => a.id === id)?.name;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "Inicio" }} />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Logo */}
        <View style={styles.header}>
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color="#fff" /></View>
        ) : hasError ? (
          <View style={styles.center}>
            <Text style={styles.error}>
              Error cargando datos. Verifica el servidor.
            </Text>
          </View>
        ) : (
          <>
            {/* KPIs: una sola línea */}
            <View style={styles.kpiRow}>
              <KPI label="Oportunidades" value={deals.length} />
              <KPI label="Prospectos" value={(qLeads.data ?? []).length} />
              <KPI label="Cuentas" value={(qAcc.data ?? []).length} />
              <KPI label="Contactos" value={(qCon.data ?? []).length} />
              <KPI label="Ganadas" value={won} />
             
            </View>

            {/* Accesos rápidos */}
            <View style={styles.grid}>
              <NavCard title="Oportunidades"  desc="Gestiona tu pipeline"  onPress={() => router.push("/deals")} />
              <NavCard title="Cuentas"        desc="Empresas y clientes"   onPress={() => router.push("/accounts")} />
              <NavCard title="Contactos"      desc="Personas y relaciones" onPress={() => router.push("/contacts")} />
              <NavCard title="Prospectos"     desc="Captura y califica"    onPress={() => router.push("/leads")} />
            </View>

            {/* Recientes: título + empresa + tira de etapas */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recientes</Text>
              <View style={{ gap: 10 }}>
                {recent.map(d => (
                  <Pressable
                    key={d.id}
                    style={({ pressed }) => [styles.recentCard, pressed && styles.pressed]}
                    onPress={() => router.push(`/deals/${d.id}`)}
                    accessibilityRole="button"
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.recentTitle} numberOfLines={2}>{d.title}</Text>
                      <Text style={styles.recentSub} numberOfLines={1}>
                        {accountName(d.account_id) ?? "—"}
                      </Text>

                      {/* Tira de etapas con progreso */}
                      <View style={styles.stageStrip}>
                        {STAGES.map((s, idx) => {
                          const currentIndex = Math.max(0, STAGES.indexOf((d.stage as DealStage) || "nuevo"));
                          const active = idx <= currentIndex;
                          return (
                            <View
                              key={s}
                              style={[styles.stageDot, active && styles.stageDotActive]}
                              accessibilityLabel={`${s}${active ? " (completado)" : ""}`}
                            />
                          );
                        })}
                      </View>
                    </View>

                    {/* Etiqueta estado actual */}
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{labelStage(d.stage)}</Text>
                    </View>
                  </Pressable>
                ))}
                {recent.length === 0 && (
                  <Text style={styles.muted}>Aún no hay oportunidades. Crea la primera 📌</Text>
                )}
              </View>
            </View>

            {/* CTA crear rápido */}
            <View style={styles.quickRow}>
              <Pressable
                style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed]}
                onPress={() => router.push("/deals/new")}
                accessibilityRole="button"
              >
                <Text style={styles.quickText}>＋ Nueva Oportunidad</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.quickBtnSecondary, pressed && styles.pressed]}
                onPress={() => router.push("/leads/new")}
                accessibilityRole="button"
              >
                <Text style={styles.quickText}>＋ Nuevo Prospecto</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function KPI({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function NavCard({
  title, desc, onPress,
}: { title: string; desc: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
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

// Sombras solo en web (sin warnings en RN Web)
const cardShadowWeb = Platform.select({
  web: { boxShadow: "0 6px 24px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.05)" } as any,
  default: {},
});

const DOT_W = 12;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  container: { padding: 16, gap: 16 },

  header: { gap: 8, marginTop: 6, alignItems: "center" },
  logo: { width: 200, height: 64 },

  // KPIs en una sola fila (sin wrap)
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "nowrap",
  },
  kpi: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#171718",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    ...cardShadowWeb,
  },
  kpiValue: { fontSize: 18, fontWeight: "900", color: "#fff" },
  kpiLabel: { color: "#a3a3a3", marginTop: 2, fontSize: 12 },

  section: { gap: 10, marginTop: 2 },
  sectionTitle: { fontWeight: "900", fontSize: 16, color: "#fff" },
  muted: { color: "rgba(255,255,255,0.65)" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    flexGrow: 1,
    minWidth: 160,
    backgroundColor: "#1a1b1d",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    ...cardShadowWeb,
  },
  pressed: { opacity: 0.9 },

  cardTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  cardDesc: { color: "rgba(255,255,255,0.78)", marginTop: 2, fontSize: 12 },

  recentCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    ...cardShadowWeb,
  },
  recentTitle: { fontWeight: "800", flex: 1, marginRight: 12, color: TEXT },
  recentSub: { color: SUBTLE, fontSize: 12 },

  // Tira de etapas
  stageStrip: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  stageDot: { width: DOT_W, height: 6, borderRadius: 3, backgroundColor: "#2a2a2c" },
  stageDotActive: { backgroundColor: ORANGE },

  // Estado actual a la derecha
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "#232325", borderWidth: 1, borderColor: "#343437" },
  badgeText: { fontSize: 12, fontWeight: "800", color: "#e5e7eb" },

  quickRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  quickBtn: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ORANGE,
  },
  quickBtnSecondary: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ORANGE_DARK,
  },
  quickText: { color: "#fff", fontWeight: "900" },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  error: { color: "#fecaca", textAlign: "center" },
});
