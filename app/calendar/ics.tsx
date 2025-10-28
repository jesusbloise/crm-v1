// app/calendar/ics.tsx
import { api, qs } from "@/src/api/http";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

const BG = "#0b0c10";
const CARD = "#14151a";
const BORDER = "#272a33";
const TEXT = "#e8ecf1";
const MUTED = "#a9b0bd";
const PRIMARY = "#7c3aed";
const ACCENT = "#22d3ee";
const CHIP = "#1e293b";

type MeResp = { connected: boolean; url?: string | null };
type MonthPreset = 1 | 3 | 6 | 12;
const MONTH_PRESETS: MonthPreset[] = [1, 3, 6, 12];

/* --- utils fechas --- */
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const startOfWeekMon = (d: Date) => {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Dom..6=Sab
  const diff = (day + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
};
const addDays = (d: Date, n: number) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

function buildMonthMatrix(ref: Date) {
  const first = startOfMonth(ref);
  const start = startOfWeekMon(first);
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return { cells };
}

function toLocalTimeLabel(iso?: string) {
  if (!iso) return "";
  const hasTime = iso.includes("T");
  if (!hasTime) return "Todo el día";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function rangeFromRef(refDate: Date, months: number) {
  const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const end = new Date(refDate.getFullYear(), refDate.getMonth() + months, 0);
  end.setHours(23, 59, 59, 999);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

export default function ICSCalendar() {
  const { width, height } = Dimensions.get("window");
  const isPhone = width < 430;

  // 🔎 Zoom
  const [scale, setScale] = useState(isPhone ? 1.35 : 1.0);
  const clamp = (v: number) => Math.max(1.0, Math.min(1.9, v));

  // tamaños base + escala
  const baseCellW = isPhone ? 120 : 110;
  const baseRowH = isPhone ? 160 : 118;
  const baseFont = isPhone ? 12 : 14;
  const baseDayFont = isPhone ? 15 : 14;
  const baseChipFont = isPhone ? 13 : 12;

  const cellW = Math.round(baseCellW * scale);
  const rowH = Math.round(baseRowH * scale);
  const fontBase = Math.round(baseFont * scale);
  const dayFont = Math.round(baseDayFont * scale);
  const chipFont = Math.round(baseChipFont * scale);
  const chipPadV = Math.max(6, Math.round(8 * scale));
  const chipPadH = Math.max(8, Math.round(10 * scale));
  const cellPad = Math.max(8, Math.round(10 * scale));

  // viewport vertical de la grilla (para que la página pueda seguir scrolleando hacia la Agenda)
  const gridViewportH = Math.min(rowH * 6 + 40, Math.round(height * 0.58));

  const [me, setMe] = useState<MeResp>({ connected: false });
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [months, setMonths] = useState<MonthPreset>(1);
  const [monthOffset, setMonthOffset] = useState(0);

  // mes visible
  const refDate = useMemo(() => {
    const base = new Date();
    return new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const matrix = useMemo(() => buildMonthMatrix(refDate), [refDate]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<MeResp>("/integrations/ics/me");
        setMe(data);
        if (data?.url) setUrl(String(data.url));
      } catch {
        setMe({ connected: false });
      }
    })();
  }, []);

  // Cargar eventos del rango anclado al mes visible
  const loadEvents = async (opts?: { force?: boolean }) => {
    if (!me.connected && !opts?.force) return;
    setLoading(true);
    try {
      const params = rangeFromRef(refDate, months);
      const data = await api.get<{ items: any[] }>(
        `/integrations/ics/events${qs(params as any)}`
      );
      setEvents(data?.items ?? []);
    } catch (e: any) {
      alert(e?.message || "No pude traer eventos ICS");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (me.connected) void loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refDate, months, me.connected]);

  const saveUrl = async () => {
    const value = url.trim();
    if (!value) {
      alert("Pega tu URL ICS privada del calendario");
      return;
    }
    setSaving(true);
    try {
      await api.post("/integrations/ics/save", { url: value });
      const data = await api.get<MeResp>("/integrations/ics/me");
      setMe(data);
      setEditMode(false);
      await loadEvents({ force: true });
    } catch (e: any) {
      alert(e?.message || "No pude guardar la URL");
    } finally {
      setSaving(false);
    }
  };

  // filtrar eventos al mes visible
  const visibleMonthEvents = useMemo(() => {
    const first = startOfMonth(refDate);
    const last = endOfMonth(refDate);
    const firstISO = first.toISOString();
    const lastISO = new Date(
      last.getFullYear(),
      last.getMonth(),
      last.getDate(),
      23, 59, 59, 999
    ).toISOString();

    return events.filter((ev) => {
      const s = ev?.start?.dateTime || ev?.start?.date;
      const e = ev?.end?.dateTime || ev?.end?.date;
      if (!s || !e) return false;
      return String(s) <= lastISO && String(e) >= firstISO;
    });
  }, [events, refDate]);

  // mapas para grilla y agenda
  const byDay = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const ev of visibleMonthEvents) {
      const startIso = ev?.start?.dateTime || ev?.start?.date;
      if (!startIso) continue;
      const key = String(startIso).slice(0, 10);
      const arr = map.get(key) || [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [visibleMonthEvents]);

  const agendaDays = useMemo(() => {
    const entries = Array.from(byDay.entries());
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return entries;
  }, [byDay]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const s = new Set<string>();
    if (byDay.has(todayKey)) s.add(todayKey);
    setExpanded(s);
  }, [refDate, events]);

  const toggleDay = (k: string) => {
    const s = new Set(expanded);
    s.has(k) ? s.delete(k) : s.add(k);
    setExpanded(s);
  };
  const expandAll = () => setExpanded(new Set(agendaDays.map(([k]) => k)));
  const collapseAll = () => setExpanded(new Set());

  const ShortUrl = ({ value }: { value?: string | null }) => {
    if (!value) return <Text style={{ color: MUTED }}>—</Text>;
    const tail = value.length > 54 ? "…" + value.slice(-54) : value;
    return <Text style={{ color: MUTED }}>{tail}</Text>;
  };

  const monthLabel = useMemo(
    () => refDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
    [refDate]
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ padding: isPhone ? 12 : 16, paddingBottom: 32 }}
    >
      {/* Topbar + Zoom */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <Text style={{ color: TEXT, fontSize: Math.round(20 * (isPhone ? 0.95 : 1)), fontWeight: "900", flex: 1 }} numberOfLines={1}>
          Google Calendar (ICS – solo lectura)
        </Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Pressable onPress={() => setScale((s) => clamp(s - 0.1))}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#11151b", borderRadius: 10, borderColor: BORDER, borderWidth: 1 }}>
            <Text style={{ color: TEXT, fontWeight: "800" }}>–</Text>
          </Pressable>
          <Pressable onPress={() => setScale((s) => clamp(s + 0.1))}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#11151b", borderRadius: 10, borderColor: BORDER, borderWidth: 1 }}>
            <Text style={{ color: TEXT, fontWeight: "800" }}>+</Text>
          </Pressable>
          <Pressable onPress={() => setScale(isPhone ? 1.35 : 1.0)}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: CARD, borderRadius: 10, borderColor: BORDER, borderWidth: 1 }}>
            <Text style={{ color: TEXT, fontWeight: "800" }}>Ajustar</Text>
          </Pressable>
        </View>
      </View>

      {/* Nav mes */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
        <Pressable onPress={() => setMonthOffset(0)}
          style={{ paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#11151b", borderRadius: 10, borderColor: BORDER, borderWidth: 1 }}>
          <Text style={{ color: TEXT, fontWeight: "800" }}>Hoy</Text>
        </Pressable>
        <Pressable onPress={() => setMonthOffset((o) => o - 1)}
          style={{ paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#11151b", borderRadius: 10, borderColor: BORDER, borderWidth: 1 }}>
          <Text style={{ color: TEXT, fontWeight: "800" }}>←</Text>
        </Pressable>
        <View style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: CARD, borderRadius: 10, borderColor: BORDER, borderWidth: 1, minWidth: 160, alignItems: "center" }}>
          <Text style={{ color: TEXT, fontWeight: "900", textTransform: "capitalize", fontSize: fontBase }} numberOfLines={1}>
            {monthLabel}
          </Text>
        </View>
        <Pressable onPress={() => setMonthOffset((o) => o + 1)}
          style={{ paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#11151b", borderRadius: 10, borderColor: BORDER, borderWidth: 1 }}>
          <Text style={{ color: TEXT, fontWeight: "800" }}>→</Text>
        </Pressable>
      </View>

      {/* Config URL */}
      <View style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 12, padding: isPhone ? 10 : 12, marginBottom: 10, gap: 10 }}>
        <Text style={{ color: TEXT, fontWeight: "800", fontSize: fontBase }}>URL secreta iCal (ICS)</Text>
        <Text style={{ color: MUTED, fontSize: isPhone ? 11 : 12 }}>
          Configuración del calendario → Integrar calendario → “Dirección secreta en formato iCal”.
        </Text>

        {me.connected && !editMode ? (
          <View style={{ borderColor: BORDER, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#0f1115" }}>
            <ShortUrl value={me.url ?? url} />
          </View>
        ) : (
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              color: TEXT, backgroundColor: "#0f1115", borderColor: BORDER, borderWidth: 1,
              borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.select({ ios: 12, android: 10, default: 10 }), fontSize: fontBase,
            }}
          />
        )}

        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {(!me.connected || editMode) && (
            <Pressable onPress={saveUrl} disabled={saving}
              style={{ backgroundColor: PRIMARY, opacity: saving ? 0.6 : 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>
                {saving ? "Guardando…" : me.connected ? "Guardar cambios" : "Guardar URL"}
              </Text>
            </Pressable>
          )}
          {me.connected && !editMode && (
            <Pressable onPress={() => setEditMode(true)}
              style={{ backgroundColor: "#1f2430", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderColor: BORDER, borderWidth: 1 }}>
              <Text style={{ color: TEXT, fontWeight: "900" }}>Editar URL</Text>
            </Pressable>
          )}
          {editMode && (
            <Pressable onPress={() => { setEditMode(false); setUrl(me.url || ""); }}
              style={{ backgroundColor: "#1f2430", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderColor: BORDER, borderWidth: 1 }}>
              <Text style={{ color: TEXT, fontWeight: "900" }}>Cancelar</Text>
            </Pressable>
          )}

          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            {MONTH_PRESETS.map((m) => {
              const active = months === m;
              return (
                <Pressable key={m} onPress={() => setMonths(m)}
                  style={{ backgroundColor: active ? ACCENT : "#0f1115", borderColor: BORDER, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 }}>
                  <Text style={{ color: active ? BG : TEXT, fontWeight: "800", fontSize: fontBase }}>
                    {m} {m === 1 ? "mes" : "meses"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={() => loadEvents({ force: true })} disabled={!me.connected}
            style={{ backgroundColor: ACCENT, opacity: me.connected ? 1 : 0.6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 }}>
            <Text style={{ color: BG, fontWeight: "900" }}>Cargar</Text>
          </Pressable>
        </View>

        {!me.connected && <Text style={{ color: MUTED, fontSize: fontBase }}>Aún no guardas la URL ICS. Pégala arriba y presiona “Guardar URL”.</Text>}
      </View>

      {loading && <ActivityIndicator color="#fff" style={{ marginBottom: 10 }} />}

      {/* ===== Grilla del mes (con su propio viewport) ===== */}
      <View style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 12, overflow: "hidden" }}>
        {/* encabezados */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ width: cellW * 7 }}>
            <View style={{ flexDirection: "row", borderBottomColor: BORDER, borderBottomWidth: 1 }}>
              {["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"].map((h) => (
                <View key={h} style={{ width: cellW, paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ color: MUTED, fontWeight: "800", fontSize: fontBase }}>{h}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* grilla con scroll H y V */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ height: gridViewportH }}>
            <View style={{ width: cellW * 7 }}>
              {Array.from({ length: 6 }, (_, row) => (
                <View key={row} style={{ flexDirection: "row", borderBottomColor: row < 5 ? BORDER : "transparent", borderBottomWidth: row < 5 ? 1 : 0, height: rowH }}>
                  {matrix.cells.slice(row * 7, row * 7 + 7).map((day, i) => {
                    const inMonth = day.getMonth() === refDate.getMonth();
                    const dayKey = day.toISOString().slice(0, 10);
                    const evs = (byDay.get(dayKey) || []).slice().sort((a, b) =>
                      String(a?.start?.dateTime || a?.start?.date).localeCompare(String(b?.start?.dateTime || b?.start?.date))
                    );
                    const today = isSameDay(day, new Date());

                    const headerH = Math.max(24, Math.round(26 * scale));
                    const listH = rowH - headerH - cellPad;

                    return (
                      <View key={`${row}-${i}`} style={{ width: cellW, borderRightColor: i < 6 ? BORDER : "transparent", borderRightWidth: i < 6 ? 1 : 0, padding: cellPad, opacity: inMonth ? 1 : 0.6 }}>
                        {/* Cabecera del día */}
                        <View style={{ flexDirection: "row", justifyContent: "space-between", height: headerH }}>
                          <Text style={{ color: TEXT, fontWeight: "800", fontSize: dayFont }}>{day.getDate()}</Text>
                          {today && (
                            <View style={{ backgroundColor: ACCENT, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                              <Text style={{ color: BG, fontWeight: "900", fontSize: Math.max(10, Math.round(11 * scale)) }}>Hoy</Text>
                            </View>
                          )}
                        </View>

                        {/* Eventos multilínea con scroll interno */}
                        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ maxHeight: listH }}>
                          {evs.length === 0 && <Text style={{ color: MUTED, fontSize: fontBase - 1 }}>—</Text>}
                          {evs.map((ev: any, idx: number) => {
                            const startIso = ev?.start?.dateTime || ev?.start?.date;
                            const time = toLocalTimeLabel(startIso);
                            return (
                              <View key={ev.id || ev.uid || `${idx}-${startIso}`} style={{ backgroundColor: CHIP, borderColor: BORDER, borderWidth: 1, borderRadius: 12, paddingVertical: chipPadV, paddingHorizontal: chipPadH, marginBottom: 8 }}>
                                <Text style={{ color: TEXT, fontSize: chipFont }}>
                                  {!!time && <Text style={{ fontWeight: "900" }}>{time} · </Text>}
                                  <Text style={{ fontWeight: "800" }}>{ev.summary || "(sin título)"}</Text>
                                </Text>
                                {!!ev.location && (
                                  <Text style={{ color: MUTED, fontSize: Math.max(10, chipFont - 2), marginTop: 2 }}>
                                    {ev.location}
                                  </Text>
                                )}
                              </View>
                            );
                          })}
                        </ScrollView>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      </View>

      {/* ====== DETALLE (AGENDA) POR DÍA ====== */}
      <View style={{ marginTop: 12, backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 12 }}>
        <View style={{ padding: 12, borderBottomColor: BORDER, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ color: TEXT, fontWeight: "900", fontSize: Math.max(14, fontBase) }}>
            Detalle del mes (Agenda)
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={expandAll} style={{ backgroundColor: "#0f1115", borderColor: BORDER, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: TEXT, fontWeight: "800" }}>Expandir todo</Text>
            </Pressable>
            <Pressable onPress={collapseAll} style={{ backgroundColor: "#0f1115", borderColor: BORDER, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: TEXT, fontWeight: "800" }}>Colapsar todo</Text>
            </Pressable>
          </View>
        </View>

        {agendaDays.length === 0 && (
          <Text style={{ color: MUTED, padding: 12 }}>No hay eventos en este mes.</Text>
        )}

        {agendaDays.map(([dayKey, evs]) => {
          const d = new Date(dayKey + "T00:00:00");
          const label = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "long" });
          const isOpen = expanded.has(dayKey);
          return (
            <View key={dayKey} style={{ borderTopColor: BORDER, borderTopWidth: 1 }}>
              <Pressable onPress={() => toggleDay(dayKey)} style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: TEXT, fontWeight: "900", textTransform: "capitalize" }}>{label}</Text>
                <Text style={{ color: MUTED, fontWeight: "800" }}>{isOpen ? "▲" : "▼"} {evs.length}</Text>
              </Pressable>
              {isOpen && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
                  {evs
                    .slice()
                    .sort((a, b) =>
                      String(a?.start?.dateTime || a?.start?.date).localeCompare(String(b?.start?.dateTime || b?.start?.date))
                    )
                    .map((ev: any, idx: number) => {
                      const startIso = ev?.start?.dateTime || ev?.start?.date;
                      const time = toLocalTimeLabel(startIso);
                      return (
                        <View key={ev.id || ev.uid || `${idx}-${startIso}`} style={{ backgroundColor: "#0f1115", borderColor: BORDER, borderWidth: 1, borderRadius: 12, paddingVertical: Math.max(8, chipPadV - 2), paddingHorizontal: Math.max(10, chipPadH) }}>
                          <Text style={{ color: TEXT, fontSize: Math.max(12, chipFont) }}>
                            {!!time && <Text style={{ fontWeight: "900" }}>{time} · </Text>}
                            <Text style={{ fontWeight: "800" }}>{ev.summary || "(sin título)"}</Text>
                          </Text>
                          {!!ev.location && (
                            <Text style={{ color: MUTED, fontSize: Math.max(11, chipFont - 1), marginTop: 2 }}>
                              {ev.location}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {!loading && me.connected && events.length === 0 && (
        <Text style={{ color: MUTED, marginTop: 12, fontSize: fontBase }}>
          No hay eventos cargados. Cambia el mes o presiona “Cargar”.
        </Text>
      )}
    </ScrollView>
  );
}
