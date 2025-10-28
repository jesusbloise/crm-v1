// app/calendar/google.tsx
import { api } from "@/src/api/http";
import { startGoogleAuth } from "@/src/google/oauth";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

const BG = "#0b0c10";
const CARD = "#14151a";
const BORDER = "#272a33";
const TEXT = "#e8ecf1";
const MUTED = "#a9b0bd";
const PRIMARY = "#7c3aed";
const ACCENT = "#22d3ee";

 type MeResp =
   | { connected: false; hasRefresh?: boolean; email?: undefined; calendarId?: undefined }
   | { connected: true; hasRefresh: boolean; email?: string; calendarId?: string };

type CalendarItem = {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
};

export default function GoogleAgenda() {
  const [me, setMe] = useState<MeResp>({ connected: false });
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cals, setCals] = useState<CalendarItem[]>([]);
  const [loadingCals, setLoadingCals] = useState(false);

  // helper para asegurar forma de MeResp desde cualquier respuesta
  const toMe = (v: any): MeResp => {
    if (v && typeof v === "object" && "connected" in v) {
      return {
        connected: !!(v as any).connected,
        hasRefresh: !!(v as any).hasRefresh,
        email:typeof (v as any).email === "string" ? (v as any).email : undefined,
        calendarId:typeof (v as any).calendarId === "string"? (v as any).calendarId: undefined,
      } as MeResp;
    }
    return { connected: false };
  };

  // Cargar estado de conexión al montar
  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<{
          connected: boolean;
          email?: string;
          calendarId?: string;
        }>("/integrations/google/me");
        setMe(toMe(data));
      } catch {
        setMe({ connected: false });
      }
    })();
  }, []);

  const connect = async () => {
    try {
      const { code, verifier, redirectUri } = await startGoogleAuth();
      const resp = await api.post<{ ok?: boolean; email?: string; error?: string }>(
        "/integrations/google/exchange",
        { code, verifier, redirectUri }
      );

      if ((resp as any)?.error === "no_refresh_token_returned") {
        // Caso típico si ya se otorgó consentimiento sin prompt=consent
        alert(
          "Google no devolvió refresh_token. Vuelve a intentar y asegúrate de ver la pantalla de consentimiento (prompt=consent)."
        );
      }

      // Re-consulta /me
      const data = await api.get<{
        connected: boolean;
        email?: string;
        calendarId?: string;
      }>("/integrations/google/me");
      const next = toMe(data);
      setMe(next);

      // Si ya está conectado, carga eventos del mes actual
      if (next.connected) await loadCurrentMonth();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo conectar Google");
    }
  };

  const loadCalendars = async () => {
    setLoadingCals(true);
    try {
      const data = await api.get<{ items: CalendarItem[] }>(
        "/integrations/google/calendars"
      );
      setCals(data?.items ?? []);
    } catch {
      alert("No pude listar tus calendarios");
    } finally {
      setLoadingCals(false);
    }
  };

  const useCalendar = async (calendarId: string) => {
    try {
      await api.post<{ ok: boolean }>("/integrations/google/calendars/use", {
        calendarId,
      });
      const data = await api.get<{
        connected: boolean;
        email?: string;
        calendarId?: string;
      }>("/integrations/google/me");
      setMe(toMe(data));
      await loadCurrentMonth();
    } catch {
      alert("No pude guardar el calendario");
    }
  };

  const monthRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { timeMin: start.toISOString(), timeMax: end.toISOString() };
  }, []);

  const loadCurrentMonth = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        timeMin: monthRange.timeMin,
        timeMax: monthRange.timeMax,
      }).toString();
      const data = await api.get<{ items: any[] }>(
        `/integrations/google/events?${qs}`
      );
      setEvents(data?.items ?? []);
    } catch (e: any) {
      alert(
        e?.message ??
          "No pude traer eventos. Verifica que Google esté conectado y con permisos."
      );
    } finally {
      setLoading(false);
    }
  };

  // agrupar por día (YYYY-MM-DD)
  const grouped = useMemo(() => {
    const byDay = new Map<string, any[]>();
    for (const ev of events) {
      const startIso = ev?.start?.dateTime || ev?.start?.date;
      if (!startIso) continue;
      const day = String(startIso).slice(0, 10);
      const arr = byDay.get(day) || [];
      arr.push(ev);
      byDay.set(day, arr);
    }
    return Array.from(byDay.entries()).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
  }, [events]);

  return (
    <View style={{ flex: 1, backgroundColor: BG, padding: 16 }}>
      <Text style={{ color: TEXT, fontSize: 20, fontWeight: "900", marginBottom: 8 }}>
        Google Calendar
      </Text>

      {!me.connected ? (
        <Pressable
          onPress={connect}
          style={{
            backgroundColor: PRIMARY,
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900" }}>
            Conectar Google
          </Text>
        </Pressable>
        
      ) : (
        <>
          <Text style={{ color: MUTED, marginBottom: 10 }}>
            Conectado como {me.email ?? "(desconocido)"}{" "}
            {me.calendarId ? `• Usando: ${me.calendarId}` : "• Usando: primary"}
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={loadCurrentMonth}
              style={{
                backgroundColor: ACCENT,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: BG, fontWeight: "900" }}>
                Cargar mes actual
              </Text>
            </Pressable>

            <Pressable
              onPress={loadCalendars}
              style={{
                backgroundColor: "#3b82f6",
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>
                Elegir calendario
              </Text>
            </Pressable>

            <Pressable
              onPress={connect}
              style={{
                backgroundColor: "#ef4444",
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>
                Reintentar conectar
              </Text>
            </Pressable>
          </View>

          {loadingCals ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />
          ) : cals.length > 0 ? (
            <View
              style={{
                marginTop: 12,
                backgroundColor: CARD,
                borderColor: BORDER,
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <Text style={{ color: TEXT, fontWeight: "800", marginBottom: 8 }}>
                Tus calendarios
              </Text>
              <ScrollView style={{ maxHeight: 180 }}>
                {cals.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => useCalendar(c.id)}
                    style={{
                      paddingVertical: 8,
                      borderBottomColor: BORDER,
                      borderBottomWidth: 1,
                    }}
                  >
                    <Text style={{ color: TEXT, fontWeight: "700" }}>
                      {c.summary} {c.primary ? " (primary)" : ""}
                    </Text>
                    <Text style={{ color: MUTED, fontSize: 12 }}>
                      id: {c.id} • role: {c.accessRole ?? "?"}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {loading && <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />}

          <ScrollView style={{ marginTop: 12 }}>
            {grouped.map(([day, evs]) => (
              <View key={day} style={{ marginBottom: 14 }}>
                <Text style={{ color: "#fff", fontWeight: "900", marginBottom: 6 }}>
                  {day}
                </Text>
                {evs.map((ev: any) => (
                  <View
                    key={ev.id}
                    style={{
                      backgroundColor: CARD,
                      borderColor: BORDER,
                      borderWidth: 1,
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: TEXT, fontWeight: "800" }}>
                      {ev.summary || "(sin título)"}
                    </Text>
                    <Text style={{ color: MUTED, marginTop: 4 }}>
                      {(ev.start?.dateTime || ev.start?.date) ?? "—"} →{" "}
                      {(ev.end?.dateTime || ev.end?.date) ?? "—"}
                    </Text>
                    {!!ev.location && (
                      <Text style={{ color: MUTED, marginTop: 4 }}>
                        {ev.location}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ))}

            {!loading && events.length === 0 && (
              <Text style={{ color: MUTED, marginTop: 12 }}>
                No hay eventos en el mes actual.
              </Text>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}
