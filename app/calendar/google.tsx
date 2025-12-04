// app/calendar/google.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { Link } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

WebBrowser.maybeCompleteAuthSession();

// Endpoints de Google OAuth
const discovery = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

// Clave para guardar el token en AsyncStorage
const STORAGE_KEY = "crm:googleCalendarToken";

type StoredToken = {
  accessToken: string;
  expiresAt: number; // epoch ms
};

type GoogleEvent = {
  id: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

export default function GoogleCalendarScreen() {
  const clientId =
    (Constants.expoConfig as any)?.extra?.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [events, setEvents] = useState<GoogleEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectUri = AuthSession.makeRedirectUri();

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      redirectUri,
      responseType: AuthSession.ResponseType.Token,
      usePKCE: false, // importante para evitar el error de code_challenge
    },
    discovery
  );

  // 1) Al montar, intentamos recuperar un token guardado
  useEffect(() => {
    const loadToken = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const parsed: StoredToken = JSON.parse(raw);
        if (parsed.expiresAt > Date.now()) {
          // Token aún válido
          setAccessToken(parsed.accessToken);
        } else {
          // Expirado, limpiamos
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        console.warn("Error leyendo token de Google Calendar:", e);
      } finally {
        setLoadingToken(false);
      }
    };
    loadToken();
  }, []);

  useEffect(() => {
    if (accessToken && loadingToken) {
      setLoadingToken(false);
    }
  }, [accessToken, loadingToken]);

  // 2) Respuesta OAuth
  useEffect(() => {
    if (!response) return;
    if (response.type === "success") {
      const auth = response.params as any;
      if (auth.access_token) {
        const token = auth.access_token as string;
        const expiresInSec = Number(auth.expires_in ?? 3600);
        const expiresAt =
          Date.now() + expiresInSec * 1000 - 60 * 1000; // margen 1 min

        const stored: StoredToken = { accessToken: token, expiresAt };

        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored)).catch(
          () => {}
        );
        setAccessToken(token);
        setError(null);
      } else {
        setError("No se recibió access_token desde Google.");
      }
    } else if (response.type === "error") {
      setError("Error en el flujo de autenticación con Google.");
    } else if (response.type === "dismiss") {
      setError("Conexión cancelada.");
    }
  }, [response]);

  // 3) Cuando tenemos token, cargamos eventos
  useEffect(() => {
    if (!accessToken) return;
    loadEvents(accessToken);
  }, [accessToken]);

  async function loadEvents(token: string) {
    try {
      setLoadingEvents(true);
      setError(null);

      // Traer TODO el mes actual (para parecerse al calendario web)
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const timeMin = monthStart.toISOString();
      const timeMax = monthEnd.toISOString();

      const res = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events" +
          "?singleEvents=true&orderBy=startTime" +
          "&timeMin=" +
          encodeURIComponent(timeMin) +
          "&timeMax=" +
          encodeURIComponent(timeMax) +
          "&maxResults=250",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        const text = await res.text();
        console.log("Error Google Calendar:", text);
        setError(
          "No se pudieron cargar los eventos. Verifica que la API de Calendar esté habilitada."
        );
        return;
      }

      const json = await res.json();
      setEvents(json.items ?? []);
    } catch (err: any) {
      console.log("loadEvents error:", err);
      setError("Ocurrió un error al leer el calendario.");
    } finally {
      setLoadingEvents(false);
    }
  }

  // 4) Desconectar
  const handleDisconnect = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {}
    setAccessToken(null);
    setEvents([]);
  };

  // Helpers de fecha

  function parseStart(ev: GoogleEvent) {
    const s = ev.start;
    if (!s) return null;
    if (s.dateTime) {
      const d = new Date(s.dateTime);
      if (Number.isNaN(d.getTime())) return null;
      return d;
    }
    if (s.date) {
      const d = new Date(s.date + "T00:00:00");
      if (Number.isNaN(d.getTime())) return null;
      return d;
    }
    return null;
  }

  function formatTimeRange(ev: GoogleEvent) {
    const s = ev.start;
    const e = ev.end;
    if (s?.date || e?.date) {
      return "Todo el día";
    }
    if (s?.dateTime && e?.dateTime) {
      const ds = new Date(s.dateTime);
      const de = new Date(e.dateTime);
      if (Number.isNaN(ds.getTime()) || Number.isNaN(de.getTime())) {
        return "";
      }
      return `${ds.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })} – ${de.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
    return "";
  }

  function formatDateHeader(d: Date) {
    const dia = d.toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return dia.toUpperCase();
  }

  // Agrupar por día (para la lista de abajo)
  const grouped = useMemo(() => {
    const map = new Map<string, { date: Date; items: GoogleEvent[] }>();

    for (const ev of events) {
      const d = parseStart(ev);
      if (!d) continue;
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      if (!map.has(key)) {
        map.set(key, { date: d, items: [] });
      }
      map.get(key)!.items.push(ev);
    }

    const arr = Array.from(map.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    for (const g of arr) {
      g.items.sort((a, b) => {
        const da = parseStart(a)?.getTime() ?? 0;
        const db = parseStart(b)?.getTime() ?? 0;
        return da - db;
      });
    }

    return arr;
  }, [events]);

  // Datos para el GRID mensual
  const monthGrid = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Mapeo día -> eventos
    const eventsByDay = new Map<number, GoogleEvent[]>();
    for (const ev of events) {
      const d = parseStart(ev);
      if (!d) continue;
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const day = d.getDate();
      if (!eventsByDay.has(day)) eventsByDay.set(day, []);
      eventsByDay.get(day)!.push(ev);
    }

    // En JS getDay() Domingo=0, Lunes=1...; queremos Lunes primera columna
    const jsFirst = firstDay.getDay(); // 0..6
    const mondayIndex = (jsFirst + 6) % 7; // 0..6 (Lunes=0)

    const cells: {
      key: string;
      day?: number;
      isToday?: boolean;
      events: GoogleEvent[];
    }[] = [];

    // huecos antes del 1
    for (let i = 0; i < mondayIndex; i++) {
      cells.push({ key: `empty-${i}`, events: [] });
    }

    // días del mes
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday =
        day === today.getDate() &&
        month === today.getMonth() &&
        year === today.getFullYear();
      cells.push({
        key: `day-${day}`,
        day,
        isToday,
        events: eventsByDay.get(day) ?? [],
      });
    }

    return { cells, year, month };
  }, [events]);

  // UI

  if (loadingToken && !accessToken) {
    return (
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Google Calendar</Text>
          <Link href="/tasks/new" asChild>
            <Pressable style={styles.newActivityBtn}>
              <Text style={styles.newActivityText}>Nueva actividad</Text>
            </Pressable>
          </Link>
        </View>
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color="#22D3EE" />
          <Text style={styles.subtitle}>Preparando integración…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Barra superior: título + botón de nueva actividad */}
      <View style={styles.topBar}>
        <Text style={styles.title}>Google Calendar</Text>
        <Link href="/tasks/new" asChild>
          <Pressable style={styles.newActivityBtn}>
            <Text style={styles.newActivityText}>Nueva actividad</Text>
          </Pressable>
        </Link>
      </View>

      {!accessToken ? (
        <View style={styles.centerBox}>
          <Text style={styles.subtitle}>Integración con Google Calendar</Text>
          <Pressable
            style={styles.connectBtn}
            onPress={() => {
              if (!request) return;
              promptAsync({ showInRecents: true });
            }}
            disabled={!request}
          >
            <Text style={styles.connectText}>Conectar con Google</Text>
          </Pressable>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.headerRow}>
            <Text style={styles.connectedText}>
              Calendario conectado. Mes actual.
            </Text>
            <Pressable style={styles.disconnectBtn} onPress={handleDisconnect}>
              <Text style={styles.disconnectText}>Desconectar</Text>
            </Pressable>
          </View>

          {loadingEvents ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="small" color="#22D3EE" />
              <Text style={styles.subtitle}>Cargando eventos…</Text>
            </View>
          ) : (
            <>
              {/* GRID mensual tipo Google */}
              <View style={styles.monthHeaderRow}>
                <Text style={styles.monthTitle}>
                  {new Date(
                    monthGrid.year,
                    monthGrid.month,
                    1
                  ).toLocaleDateString("es-ES", {
                    month: "long",
                    year: "numeric",
                  })}
                </Text>
              </View>

              <View style={styles.weekDaysRow}>
                {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
                  <Text key={d} style={styles.weekDayLabel}>
                    {d}
                  </Text>
                ))}
              </View>

              <View style={styles.monthGrid}>
                {monthGrid.cells.map((cell) => {
                  if (!cell.day) {
                    return <View key={cell.key} style={styles.dayCellEmpty} />;
                  }
                  const evs = cell.events;
                  const showEvents = evs.slice(0, 2);
                  const moreCount = evs.length - showEvents.length;

                  return (
                    <View key={cell.key} style={styles.dayCell}>
                      <Text
                        style={[
                          styles.dayNumber,
                          cell.isToday && styles.dayNumberToday,
                        ]}
                      >
                        {cell.day}
                      </Text>
                      {showEvents.map((ev) => (
                        <Text
                          key={ev.id}
                          style={styles.dayEvent}
                          numberOfLines={1}
                        >
                          • {ev.summary || "Sin título"}
                        </Text>
                      ))}
                      {moreCount > 0 && (
                        <Text style={styles.dayMore}>+{moreCount} más</Text>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Lista detallada de eventos por día (debajo del grid) */}
              {grouped.length === 0 ? (
                <View style={[styles.centerBox, { paddingTop: 16 }]}>
                  <Text style={styles.subtitle}>
                    No se encontraron eventos en este mes.
                  </Text>
                </View>
              ) : (
                <ScrollView contentContainerStyle={styles.list}>
                  {grouped.map((group) => (
                    <View key={group.date.toISOString()}>
                      <Text style={styles.dayHeader}>
                        {formatDateHeader(group.date)}
                      </Text>
                      {group.items.map((ev) => (
                        <View key={ev.id} style={styles.eventRow}>
                          <Text style={styles.eventTime}>
                            {formatTimeRange(ev) || "Todo el día"}
                          </Text>
                          <View style={styles.eventCard}>
                            <Text style={styles.eventTitle}>
                              {ev.summary || "Sin título"}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ))}
                </ScrollView>
              )}
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      )}
    </View>
  );
}

/* 🎨 Estilos */

const BG = "#0F1115";
const TEXT = "#F3F4F6";
const SUBTLE = "#A4ADBD";
const CARD = "#171923";
const BORDER = "#2B3140";
const PRIMARY = "#7C3AED";

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
    padding: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    color: TEXT,
    fontSize: 20,
    fontWeight: "900",
  },
  newActivityBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  newActivityText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },
  subtitle: {
    color: SUBTLE,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  connectedText: {
    color: SUBTLE,
  },

  connectBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  connectText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },

  disconnectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#111827",
  },
  disconnectText: {
    color: "#FCA5A5",
    fontSize: 11,
    fontWeight: "700",
  },

  /* Grid mensual */

  monthHeaderRow: {
    marginTop: 4,
    marginBottom: 4,
  },
  monthTitle: {
    color: TEXT,
    fontSize: 16,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  weekDaysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    marginTop: 4,
  },
  weekDayLabel: {
    flex: 1,
    textAlign: "center",
    color: SUBTLE,
    fontSize: 11,
    fontWeight: "700",
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  dayCell: {
    width: `${100 / 7}%`,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    padding: 4,
    minHeight: 60,
  },
  dayCellEmpty: {
    width: `${100 / 7}%`,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    minHeight: 60,
  },
  dayNumber: {
    color: SUBTLE,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
  },
  dayNumberToday: {
    color: "#fff",
    backgroundColor: PRIMARY,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignSelf: "flex-start",
  },
  dayEvent: {
    color: TEXT,
    fontSize: 10,
  },
  dayMore: {
    color: SUBTLE,
    fontSize: 10,
    marginTop: 1,
  },

  /* Lista detallada */

  list: {
    paddingTop: 8,
    paddingBottom: 24,
    gap: 8,
  },
  dayHeader: {
    color: SUBTLE,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 4,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  eventTime: {
    width: 80,
    color: SUBTLE,
    fontSize: 11,
  },
  eventCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  eventTitle: {
    color: TEXT,
    fontWeight: "800",
    fontSize: 14,
  },

  error: {
    color: "#fecaca",
    marginTop: 8,
    textAlign: "center",
  },
});

// // app/calendar/google.tsx
// import { api } from "@/src/api/http";
// import { startGoogleAuth } from "@/src/google/oauth";
// import { useEffect, useMemo, useState } from "react";
// import {
//     ActivityIndicator,
//     Pressable,
//     ScrollView,
//     Text,
//     View,
// } from "react-native";

// const BG = "#0b0c10";
// const CARD = "#14151a";
// const BORDER = "#272a33";
// const TEXT = "#e8ecf1";
// const MUTED = "#a9b0bd";
// const PRIMARY = "#7c3aed";
// const ACCENT = "#22d3ee";

//  type MeResp =
//    | { connected: false; hasRefresh?: boolean; email?: undefined; calendarId?: undefined }
//    | { connected: true; hasRefresh: boolean; email?: string; calendarId?: string };

// type CalendarItem = {
//   id: string;
//   summary: string;
//   primary?: boolean;
//   accessRole?: string;
//   backgroundColor?: string;
// };

// export default function GoogleAgenda() {
//   const [me, setMe] = useState<MeResp>({ connected: false });
//   const [events, setEvents] = useState<any[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [cals, setCals] = useState<CalendarItem[]>([]);
//   const [loadingCals, setLoadingCals] = useState(false);

//   // helper para asegurar forma de MeResp desde cualquier respuesta
//   const toMe = (v: any): MeResp => {
//     if (v && typeof v === "object" && "connected" in v) {
//       return {
//         connected: !!(v as any).connected,
//         hasRefresh: !!(v as any).hasRefresh,
//         email:typeof (v as any).email === "string" ? (v as any).email : undefined,
//         calendarId:typeof (v as any).calendarId === "string"? (v as any).calendarId: undefined,
//       } as MeResp;
//     }
//     return { connected: false };
//   };

//   // Cargar estado de conexión al montar
//   useEffect(() => {
//     (async () => {
//       try {
//         const data = await api.get<{
//           connected: boolean;
//           email?: string;
//           calendarId?: string;
//         }>("/integrations/google/me");
//         setMe(toMe(data));
//       } catch {
//         setMe({ connected: false });
//       }
//     })();
//   }, []);

//   const connect = async () => {
//     try {
//       const { code, verifier, redirectUri } = await startGoogleAuth();
//       const resp = await api.post<{ ok?: boolean; email?: string; error?: string }>(
//         "/integrations/google/exchange",
//         { code, verifier, redirectUri }
//       );

//       if ((resp as any)?.error === "no_refresh_token_returned") {
//         // Caso típico si ya se otorgó consentimiento sin prompt=consent
//         alert(
//           "Google no devolvió refresh_token. Vuelve a intentar y asegúrate de ver la pantalla de consentimiento (prompt=consent)."
//         );
//       }

//       // Re-consulta /me
//       const data = await api.get<{
//         connected: boolean;
//         email?: string;
//         calendarId?: string;
//       }>("/integrations/google/me");
//       const next = toMe(data);
//       setMe(next);

//       // Si ya está conectado, carga eventos del mes actual
//       if (next.connected) await loadCurrentMonth();
//     } catch (e: any) {
//       alert(e?.message ?? "No se pudo conectar Google");
//     }
//   };

//   const loadCalendars = async () => {
//     setLoadingCals(true);
//     try {
//       const data = await api.get<{ items: CalendarItem[] }>(
//         "/integrations/google/calendars"
//       );
//       setCals(data?.items ?? []);
//     } catch {
//       alert("No pude listar tus calendarios");
//     } finally {
//       setLoadingCals(false);
//     }
//   };

//   const useCalendar = async (calendarId: string) => {
//     try {
//       await api.post<{ ok: boolean }>("/integrations/google/calendars/use", {
//         calendarId,
//       });
//       const data = await api.get<{
//         connected: boolean;
//         email?: string;
//         calendarId?: string;
//       }>("/integrations/google/me");
//       setMe(toMe(data));
//       await loadCurrentMonth();
//     } catch {
//       alert("No pude guardar el calendario");
//     }
//   };

//   const monthRange = useMemo(() => {
//     const now = new Date();
//     const start = new Date(now.getFullYear(), now.getMonth(), 1);
//     const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
//     end.setHours(23, 59, 59, 999);
//     return { timeMin: start.toISOString(), timeMax: end.toISOString() };
//   }, []);

//   const loadCurrentMonth = async () => {
//     setLoading(true);
//     try {
//       const qs = new URLSearchParams({
//         timeMin: monthRange.timeMin,
//         timeMax: monthRange.timeMax,
//       }).toString();
//       const data = await api.get<{ items: any[] }>(
//         `/integrations/google/events?${qs}`
//       );
//       setEvents(data?.items ?? []);
//     } catch (e: any) {
//       alert(
//         e?.message ??
//           "No pude traer eventos. Verifica que Google esté conectado y con permisos."
//       );
//     } finally {
//       setLoading(false);
//     }
//   };

//   // agrupar por día (YYYY-MM-DD)
//   const grouped = useMemo(() => {
//     const byDay = new Map<string, any[]>();
//     for (const ev of events) {
//       const startIso = ev?.start?.dateTime || ev?.start?.date;
//       if (!startIso) continue;
//       const day = String(startIso).slice(0, 10);
//       const arr = byDay.get(day) || [];
//       arr.push(ev);
//       byDay.set(day, arr);
//     }
//     return Array.from(byDay.entries()).sort(([a], [b]) =>
//       a < b ? -1 : a > b ? 1 : 0
//     );
//   }, [events]);

//   return (
//     <View style={{ flex: 1, backgroundColor: BG, padding: 16 }}>
//       <Text style={{ color: TEXT, fontSize: 20, fontWeight: "900", marginBottom: 8 }}>
//         Google Calendar
//       </Text>

//       {!me.connected ? (
//         <Pressable
//           onPress={connect}
//           style={{
//             backgroundColor: PRIMARY,
//             paddingVertical: 12,
//             borderRadius: 12,
//             alignItems: "center",
//             marginTop: 8,
//           }}
//         >
//           <Text style={{ color: "#fff", fontWeight: "900" }}>
//             Conectar Google
//           </Text>
//         </Pressable>
        
//       ) : (
//         <>
//           <Text style={{ color: MUTED, marginBottom: 10 }}>
//             Conectado como {me.email ?? "(desconocido)"}{" "}
//             {me.calendarId ? `• Usando: ${me.calendarId}` : "• Usando: primary"}
//           </Text>

//           <View style={{ flexDirection: "row", gap: 10 }}>
//             <Pressable
//               onPress={loadCurrentMonth}
//               style={{
//                 backgroundColor: ACCENT,
//                 paddingVertical: 10,
//                 paddingHorizontal: 12,
//                 borderRadius: 10,
//                 alignItems: "center",
//               }}
//             >
//               <Text style={{ color: BG, fontWeight: "900" }}>
//                 Cargar mes actual
//               </Text>
//             </Pressable>

//             <Pressable
//               onPress={loadCalendars}
//               style={{
//                 backgroundColor: "#3b82f6",
//                 paddingVertical: 10,
//                 paddingHorizontal: 12,
//                 borderRadius: 10,
//                 alignItems: "center",
//               }}
//             >
//               <Text style={{ color: "#fff", fontWeight: "900" }}>
//                 Elegir calendario
//               </Text>
//             </Pressable>

//             <Pressable
//               onPress={connect}
//               style={{
//                 backgroundColor: "#ef4444",
//                 paddingVertical: 10,
//                 paddingHorizontal: 12,
//                 borderRadius: 10,
//                 alignItems: "center",
//               }}
//             >
//               <Text style={{ color: "#fff", fontWeight: "900" }}>
//                 Reintentar conectar
//               </Text>
//             </Pressable>
//           </View>

//           {loadingCals ? (
//             <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />
//           ) : cals.length > 0 ? (
//             <View
//               style={{
//                 marginTop: 12,
//                 backgroundColor: CARD,
//                 borderColor: BORDER,
//                 borderWidth: 1,
//                 borderRadius: 12,
//                 padding: 12,
//               }}
//             >
//               <Text style={{ color: TEXT, fontWeight: "800", marginBottom: 8 }}>
//                 Tus calendarios
//               </Text>
//               <ScrollView style={{ maxHeight: 180 }}>
//                 {cals.map((c) => (
//                   <Pressable
//                     key={c.id}
//                     onPress={() => useCalendar(c.id)}
//                     style={{
//                       paddingVertical: 8,
//                       borderBottomColor: BORDER,
//                       borderBottomWidth: 1,
//                     }}
//                   >
//                     <Text style={{ color: TEXT, fontWeight: "700" }}>
//                       {c.summary} {c.primary ? " (primary)" : ""}
//                     </Text>
//                     <Text style={{ color: MUTED, fontSize: 12 }}>
//                       id: {c.id} • role: {c.accessRole ?? "?"}
//                     </Text>
//                   </Pressable>
//                 ))}
//               </ScrollView>
//             </View>
//           ) : null}

//           {loading && <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />}

//           <ScrollView style={{ marginTop: 12 }}>
//             {grouped.map(([day, evs]) => (
//               <View key={day} style={{ marginBottom: 14 }}>
//                 <Text style={{ color: "#fff", fontWeight: "900", marginBottom: 6 }}>
//                   {day}
//                 </Text>
//                 {evs.map((ev: any) => (
//                   <View
//                     key={ev.id}
//                     style={{
//                       backgroundColor: CARD,
//                       borderColor: BORDER,
//                       borderWidth: 1,
//                       borderRadius: 12,
//                       padding: 12,
//                       marginBottom: 8,
//                     }}
//                   >
//                     <Text style={{ color: TEXT, fontWeight: "800" }}>
//                       {ev.summary || "(sin título)"}
//                     </Text>
//                     <Text style={{ color: MUTED, marginTop: 4 }}>
//                       {(ev.start?.dateTime || ev.start?.date) ?? "—"} →{" "}
//                       {(ev.end?.dateTime || ev.end?.date) ?? "—"}
//                     </Text>
//                     {!!ev.location && (
//                       <Text style={{ color: MUTED, marginTop: 4 }}>
//                         {ev.location}
//                       </Text>
//                     )}
//                   </View>
//                 ))}
//               </View>
//             ))}

//             {!loading && events.length === 0 && (
//               <Text style={{ color: MUTED, marginTop: 12 }}>
//                 No hay eventos en el mes actual.
//               </Text>
//             )}
//           </ScrollView>
//         </>
//       )}
//     </View>
//   );
// }
