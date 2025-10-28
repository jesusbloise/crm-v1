// app/index.tsx
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// opcionales (si no están, funciona igual)
let Haptics: any;
let LinearGradient: any;
try { Haptics = require("expo-haptics"); } catch {}
try { LinearGradient = require("expo-linear-gradient").LinearGradient; } catch {}

import { listAccounts } from "@/src/api/accounts";
import { listContacts } from "@/src/api/contacts";
import { listDeals, type Deal, type DealStage } from "@/src/api/deals";
import { listLeads } from "@/src/api/leads";

const LOGO = require("../assets/images/ATOMICA-Logo-02.png");

/* 🎨 Paleta pro morado/cian */
const PRIMARY = "#7C3AED";   // morado (acciones)
const ACCENT  = "#22D3EE";   // cian (detalles)
const BG      = "#0F1115";   // fondo
const CARD    = "#171923";   // tarjetas (oscuras)
const BORDER  = "#2B3140";   // bordes
const TEXT    = "#F3F4F6";   // texto principal
const SUBTLE  = "#A4ADBD";   // subtítulos
const SUCCESS = "#10B981";
const DANGER  = "#EF4444";

/* 👉 Sección lista clara */
const LIGHT_CARD   = "#ECEFF4";
const LIGHT_BORDER = "#CBD5E1";
const DARK_TEXT    = "#0F172A";
const DARK_SUBTLE  = "#475569";

const STAGES: DealStage[] = ["nuevo","calificado","propuesta","negociacion","ganado","perdido"];
type StageFilter = "todos" | DealStage;

export default function Home() {
  const router = useRouter();

  // Data
  const qDeals = useQuery({ queryKey: ["deals"], queryFn: listDeals });
  const qAcc   = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const qCon   = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
  const qLeads = useQuery({ queryKey: ["leads"],  queryFn: listLeads });

  const loading  = qDeals.isLoading || qAcc.isLoading || qCon.isLoading || qLeads.isLoading;
  const hasError = qDeals.isError   || qAcc.isError   || qCon.isError   || qLeads.isError;

  const deals    = qDeals.data ?? [];
  const leads    = qLeads.data ?? [];
  const accounts = qAcc.data ?? [];
  const contacts = qCon.data ?? [];

  const accountName = useCallback(
    (id?: string | null) => accounts.find(a => a.id === id)?.name,
    [accounts]
  );

  const [filter, setFilter] = useState<StageFilter>("todos");
  const [refreshing, setRefreshing] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtered = useMemo(() => {
    const base = [...deals].sort((a,b)=>(b.updated_at??0)-(a.updated_at??0));
    return filter === "todos" ? base : base.filter(d => d.stage === filter);
  }, [deals, filter]);

  const firstErrorMsg =
    (qDeals.error as any)?.message ||
    (qAcc.error as any)?.message ||
    (qCon.error as any)?.message ||
    (qLeads.error as any)?.message ||
    "";

  const refetchAll = useCallback(async () => {
    try {
      setRefreshing(true);
      await Promise.all([qDeals.refetch(), qAcc.refetch(), qCon.refetch(), qLeads.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [qDeals, qAcc, qCon, qLeads]);

  const onNav = (path: string) => () => {
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as any);
  };

  const onGo = (path: string) => () => {
    Haptics?.selectionAsync?.();
    router.push(path as any);
  };

  // Header gradient (fallback a View si no está LinearGradient)
  const HeaderBg: React.ComponentType<any> = LinearGradient ?? View;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ title: "Inicio" }} />

      {/* Banner error */}
      {hasError && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Sin conexión al servidor</Text>
          <Text style={styles.bannerText} numberOfLines={2}>
            Verifica que el backend esté encendido.
            {firstErrorMsg ? ` ${firstErrorMsg}` : ""}
          </Text>
          <Pressable style={({pressed})=>[styles.bannerBtn, pressed&&styles.pressed]} onPress={refetchAll}>
            <Text style={styles.bannerBtnText}>Reintentar</Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={{ color: SUBTLE, marginTop: 8 }}>Cargando panel…</Text>
        </View>
      ) : (
        <>
          {/* Encabezado con degradé */}
          <HeaderBg
            style={styles.headerWrap}
            {...(LinearGradient ? { colors: [PRIMARY, ACCENT], start:{x:0,y:0}, end:{x:1,y:1} } : {})}
          >
            <View style={styles.headerTop}>
              {logoOk ? (
                <Image source={LOGO} style={styles.logo} resizeMode="contain" onError={()=>setLogoOk(false)} />
              ) : (
                <Text style={styles.appTitle}>ATOMICA CRM</Text>
              )}
              <View style={styles.avatarCircle}>
                <Text style={{ color: "#0b1120", fontWeight: "900" }}>A</Text>
              </View>
            </View>

            <Text style={styles.hello}>¡Bienvenido!</Text>
            <Text style={styles.subHello}>Gestiona tu pipeline y prospectos</Text>

            {/* Botones grandes con contador (grid 2×3 incluyendo Calendario) */}
            <View style={styles.bigButtonsRow}>
              <BigButton label="Oportunidades" count={deals.length}     onPress={onGo("/deals")} />
              <BigButton label="Prospectos"    count={leads.length}     onPress={onGo("/leads")} />
              <BigButton label="Cuentas"       count={accounts.length}  onPress={onGo("/accounts")} />
              <BigButton label="Contactos"     count={contacts.length}  onPress={onGo("/contacts")} />
              {/* 👇 NUEVO acceso directo al calendario Google */}
              <BigButton label="Calendario"    count={0}                onPress={onGo("/calendar/google")} />
            </View>
          </HeaderBg>

          {/* Filtros por etapa */}
          <View style={styles.filterRow}>
            <Chip
              label="Todos"
              active={filter === "todos"}
              onPress={() => { Haptics?.selectionAsync?.(); setFilter("todos"); }}
            />
            {STAGES.map(s => (
              <Chip
                key={s}
                label={labelStage(s)}
                active={filter === s}
                onPress={() => { Haptics?.selectionAsync?.(); setFilter(s); }}
              />
            ))}
          </View>

          {/* Lista (gris claro) */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl tintColor="#fff" colors={["#fff"]} refreshing={refreshing} onRefresh={refetchAll} />
            }
            renderItem={({ item: d }) => (
              <Pressable
                style={({ pressed }) => [styles.cardLight, pressed && styles.pressed]}
                android_ripple={{ color: "rgba(0,0,0,0.06)" }}
                onPress={() => router.push(`/deals/${d.id}`)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.titleLight} numberOfLines={2}>{d.title}</Text>
                  <Text style={styles.subLight} numberOfLines={1}>{accountName(d.account_id) ?? "—"}</Text>

                  <View style={styles.stageStrip}>
                    {STAGES.map((s, idx) => {
                      const currentIndex = Math.max(0, STAGES.indexOf((d.stage as DealStage) || "nuevo"));
                      const active = idx <= currentIndex;
                      return <View key={s} style={[styles.stageDot, active && styles.stageDotActive]} />;
                    })}
                  </View>
                </View>

                <View style={[
                  styles.badgeLight,
                  d.stage === "ganado" && { borderColor: "#BBF7D0", backgroundColor: "#ECFDF5" },
                  d.stage === "perdido" && { borderColor: "#FECACA", backgroundColor: "#FEF2F2" },
                ]}>
                  <Text style={[styles.badgeTextLight, (d.stage==="ganado"||d.stage==="perdido") && { color: DARK_TEXT }]}>
                    {labelStage(d.stage)}
                  </Text>
                </View>
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <Text style={{ color: SUBTLE }}>No hay registros para este filtro.</Text>
              </View>
            }
            contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
          />

          {/* FAB único “＋” -> Action Sheet */}
          <View style={styles.fabWrapOne}>
            <Pressable
              style={({pressed})=>[styles.fabOne, pressed&&styles.pressed]}
              onPress={() => { Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium); setSheetOpen(true); }}
            >
              <Text style={styles.fabOneText}>＋</Text>
            </Pressable>
          </View>

          {/* Sheet simple */}
          {sheetOpen && (
            <View style={styles.sheetOverlay}>
              <Pressable style={{ flex: 1 }} onPress={() => setSheetOpen(false)} />
              <View style={styles.sheet}>
                <Text style={styles.sheetTitle}>Crear nuevo</Text>

                <SheetBtn label="Oportunidad" onPress={() => { setSheetOpen(false); router.push("/deals/new" as any); }} />
                <SheetBtn label="Prospecto"   onPress={() => { setSheetOpen(false); router.push("/leads/new" as any); }} />
                <SheetBtn label="Cuenta"      onPress={() => { setSheetOpen(false); router.push("/accounts/new" as any); }} />
                <SheetBtn label="Contacto"    onPress={() => { setSheetOpen(false); router.push("/contacts/new" as any); }} />
                <SheetBtn label="Actividad"   onPress={() => { setSheetOpen(false); router.push("/tasks/new" as any); }} />

                <Pressable style={styles.sheetCancel} onPress={() => setSheetOpen(false)}>
                  <Text style={styles.sheetCancelText}>Cancelar</Text>
                </Pressable>
              </View>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

/* ——— UI helpers ——— */

function BigButton({ label, count, onPress }: { label: string; count: number; onPress: () => void }) {
  return (
    <Pressable style={({pressed})=>[styles.bigBtn, pressed && styles.pressed]} onPress={onPress}>
      <Text style={styles.bigBtnLabel}>{label}</Text>
      <View style={styles.bigBtnPill}><Text style={styles.bigBtnPillText}>{count}</Text></View>
    </Pressable>
  );
}

function SheetBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({pressed})=>[styles.sheetBtn, pressed && { opacity: 0.9 }]} onPress={onPress}>
      <Text style={styles.sheetBtnText}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({pressed})=>[
      styles.chip,
      active && styles.chipActive,
      pressed && styles.pressed
    ]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
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

/* ——— Styles ——— */
const shadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } },
  android: { elevation: 6 },
  web: { boxShadow: "0 14px 40px rgba(0,0,0,0.40)" } as any,
});

const DOT_W = 12;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },

  /* Header */
  headerWrap: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18,
    borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
  },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 150, height: 46 },
  appTitle: { color: TEXT, fontWeight: "900", fontSize: 18 },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },

  hello: { color: "#0b1120", fontWeight: "900", fontSize: 20, marginTop: 10 },
  subHello: { color: "rgba(255,255,255,0.92)", marginTop: 2 },

  // banner error
  banner: { backgroundColor: "#3a1c1c", borderBottomWidth: 1, borderColor: "#6b1d1d", paddingHorizontal: 16, paddingVertical: 12 },
  bannerTitle: { color: "#fecaca", fontWeight: "800" },
  bannerText: { color: "#fca5a5", marginTop: 4 },
  bannerBtn: { alignSelf: "flex-start", marginTop: 8, backgroundColor: DANGER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  bannerBtnText: { color: "#fff", fontWeight: "800" },

  // Botones grandes (grid flexible)
  bigButtonsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 0, marginTop: 12 },
  bigBtn: {
    flexBasis: "48%",
    backgroundColor: "#141821",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...shadow,
  },
  bigBtnLabel: { color: TEXT, fontWeight: "900" },
  bigBtnPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)"
  },
  bigBtnPillText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  // filtros
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#1f2430", borderWidth: 1, borderColor: BORDER },
  chipActive: { backgroundColor: "rgba(124,58,237,0.20)", borderColor: PRIMARY },
  chipText: { color: SUBTLE, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#E9D5FF" },

  // Lista clara
  cardLight: {
    backgroundColor: LIGHT_CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: LIGHT_BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 12,
    marginHorizontal: 16,
    ...shadow,
  },
  titleLight: { fontWeight: "800", flex: 1, marginRight: 12, color: DARK_TEXT },
  subLight: { color: DARK_SUBTLE, fontSize: 12, marginTop: 2 },

  stageStrip: { flexDirection: "row", alignItems: "center", columnGap: 6, marginTop: 6 },
  stageDot: { width: DOT_W, height: 6, borderRadius: 3, backgroundColor: "#B8C2D1" },
  stageDotActive: { backgroundColor: ACCENT },

  badgeLight: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: "#E2E8F0", borderWidth: 1, borderColor: LIGHT_BORDER,
  },
  badgeTextLight: { fontSize: 12, fontWeight: "800", color: DARK_TEXT },

  pressed: { opacity: 0.88 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },

  // FAB único
  fabWrapOne: { position: "absolute", right: 16, bottom: 24, alignItems: "flex-end" },
  fabOne: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: PRIMARY, ...shadow },
  fabOneText: { color: "#fff", fontSize: 28, lineHeight: 28, fontWeight: "900" },

  // Sheet
  sheetOverlay: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: CARD, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderWidth: 1, borderColor: BORDER, padding: 16, gap: 8,
  },
  sheetTitle: { color: TEXT, fontWeight: "900", fontSize: 16, marginBottom: 4 },
  sheetBtn: {
    backgroundColor: "#131723", borderWidth: 1, borderColor: BORDER,
    paddingVertical: 12, borderRadius: 12, alignItems: "center",
  },
  sheetBtnText: { color: TEXT, fontWeight: "900" },
  sheetCancel: { marginTop: 6, alignItems: "center", paddingVertical: 10 },
  sheetCancelText: { color: SUBTLE, fontWeight: "800" },
});
