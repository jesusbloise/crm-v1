// app/calendar/google.tsx
import CalendarMonthView, {
  type CalendarViewEvent,
} from "@/src/components/CalendarMonthView";
import {
  clearGoogleAccessToken,
  flushCalendarQueue,
  loadGoogleAccessToken,
  saveGoogleAccessToken,
} from "@/src/lib/googleCalendar";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

type GoogleEvent = CalendarViewEvent;

function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function cleanOAuthHash() {
  if (Platform.OS !== "web") return;

  window.history.replaceState(
    window.history.state,
    document.title,
    window.location.pathname + window.location.search
  );
}

export default function GoogleCalendarScreen() {
  const clientId =
    (Constants.expoConfig as any)?.extra?.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";

  const params = useLocalSearchParams<{
    date?: string | string[];
  }>();

  const requestedDate = Array.isArray(params.date)
    ? params.date[0]
    : params.date;

  const targetDate = useMemo(() => {
    if (
      !requestedDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ) {
      return null;
    }

    const [year, month, day] = requestedDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }, [requestedDate]);

  const [calendarView, setCalendarView] = useState(() => {
    const initial = targetDate ?? new Date();

    return {
      year: initial.getFullYear(),
      month: initial.getMonth(),
      selectedDate: localDateKey(initial),
    };
  });

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [events, setEvents] = useState<GoogleEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventsRequest = useRef(0);
  const visibleYear = calendarView.year;
  const visibleMonth = calendarView.month;

  // Conservar las direcciones del flujo de conexión existente.
  const redirectUri =
    Platform.OS === "web"
      ? typeof window !== "undefined" &&
        window.location.hostname === "localhost"
        ? "http://localhost:8081"
        : "https://crm-v1-1-uo1a.onrender.com/"
      : AuthSession.makeRedirectUri();

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      scopes: [
        "openid",
        "profile",
        "https://www.googleapis.com/auth/calendar.events",
      ],
      redirectUri,
      responseType: AuthSession.ResponseType.Token,
      usePKCE: false,
    },
    discovery
  );

  // Aplicar la fecha recibida al entrar desde Contactos.
  useEffect(() => {
    const date = targetDate ?? new Date();

    eventsRequest.current += 1;
    setEvents([]);

    setCalendarView({
      year: date.getFullYear(),
      month: date.getMonth(),
      selectedDate: localDateKey(date),
    });
  }, [targetDate]);

  // Ignorar respuestas que lleguen después de salir de la pantalla.
  useEffect(() => {
    return () => {
      eventsRequest.current += 1;
    };
  }, []);

  async function trySilentReauth(): Promise<boolean> {
    try {
      if (!request) return false;

      const result = await promptAsync({
        showInRecents: false,
        extraParams: { prompt: "none" },
      } as any);

      return result?.type === "success";
    } catch {
      return false;
    }
  }

  // Recuperar la conexión guardada o recibir el regreso de Google.
  useEffect(() => {
    let cancelled = false;

    async function synchronizeQueue() {
      try {
        await flushCalendarQueue();
      } catch (error: unknown) {
        if (cancelled) return;

        const code = (error as { code?: string })?.code;

        if (code === "not_connected") {
          setAccessToken(null);
          setError(
            "Google Calendar necesita que vuelvas a conectarlo."
          );
        } else if (code === "session_changed") {
          setAccessToken(null);
          setError(
            "La sesión o el workspace cambió. Vuelve a abrir el calendario."
          );
        } else {
          console.warn(
            "Google Calendar: quedaron actividades pendientes de sincronizar."
          );
        }
      }
    }

    async function loadToken() {
      try {
        if (Platform.OS === "web") {
          const oauthParams = new URLSearchParams(
            window.location.hash.replace(/^#/, "")
          );

          const returnedToken = oauthParams.get("access_token");

          if (returnedToken) {
            const rawExpiration = Number(
              oauthParams.get("expires_in") ?? 3600
            );

            const expiresInSec =
              Number.isFinite(rawExpiration) && rawExpiration > 0
                ? rawExpiration
                : 3600;

            cleanOAuthHash();

            await saveGoogleAccessToken(
              returnedToken,
              expiresInSec
            );

            if (cancelled) return;

            setAccessToken(returnedToken);
            setError(null);

            await synchronizeQueue();
            return;
          }
        }

        const savedToken = await loadGoogleAccessToken();

        if (cancelled) return;

        setAccessToken(savedToken);

        if (savedToken) {
          setError(null);
          await synchronizeQueue();
        }
      } catch (error: unknown) {
        if (cancelled) return;

        setAccessToken(null);
        setError(
          error instanceof Error
            ? error.message
            : "No se pudo recuperar la conexión de Google Calendar."
        );
      } finally {
        if (!cancelled) setLoadingToken(false);
      }
    }

    void loadToken();

    return () => {
      cancelled = true;
    };
  }, []);

  // Respuesta del flujo OAuth utilizado en móvil o al reconectar.
  useEffect(() => {
    if (!response) return;

    let cancelled = false;

    if (response.type === "success") {
      const token = response.params.access_token;
      const rawExpiration = Number(
        response.params.expires_in ?? 3600
      );

      const expiresInSec =
        Number.isFinite(rawExpiration) && rawExpiration > 0
          ? rawExpiration
          : 3600;

      cleanOAuthHash();

      if (typeof token !== "string" || !token.trim()) {
        setError("No se recibió un token válido de Google.");
        setLoadingToken(false);
        return;
      }

      async function saveConnection() {
        setLoadingToken(true);

        try {
          await saveGoogleAccessToken(token, expiresInSec);

          if (cancelled) return;

          setAccessToken(token);
          setError(null);

          try {
            await flushCalendarQueue();
          } catch (error: unknown) {
            if (cancelled) return;

            const code = (error as { code?: string })?.code;

            if (code === "not_connected") {
              setAccessToken(null);
              setError(
                "Google Calendar necesita que vuelvas a conectarlo."
              );
            } else if (code === "session_changed") {
              setAccessToken(null);
              setError(
                "La sesión o el workspace cambió. Vuelve a abrir el calendario."
              );
            } else {
              console.warn(
                "Google Calendar: quedaron actividades pendientes de sincronizar."
              );
            }
          }
        } catch (error: unknown) {
          if (cancelled) return;

          setAccessToken(null);
          setError(
            error instanceof Error
              ? error.message
              : "No se pudo guardar la conexión de Google Calendar."
          );
        } finally {
          if (!cancelled) setLoadingToken(false);
        }
      }

      void saveConnection();
    } else if (response.type === "error") {
      setError("No se pudo completar la conexión con Google.");
    } else if (
      response.type === "dismiss" ||
      response.type === "cancel"
    ) {
      setError("Conexión cancelada.");
    }

    return () => {
      cancelled = true;
    };
  }, [response]);

  // Retirar cualquier fragmento OAuth que permanezca en la dirección.
  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      !accessToken ||
      loadingToken
    ) {
      return;
    }

    const oauthParams = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );

    if (oauthParams.has("access_token")) {
      cleanOAuthHash();
    }
  }, [accessToken, loadingToken]);

  async function loadEvents(token: string) {
    const requestId = ++eventsRequest.current;

    setLoadingEvents(true);
    setEvents([]);
    setError(null);

    try {
      const monthStart = new Date(
        visibleYear,
        visibleMonth,
        1
      );

      const monthEnd = new Date(
        visibleYear,
        visibleMonth + 1,
        1
      );

      const collected: GoogleEvent[] = [];
      const seenPages = new Set<string>();
      let pageToken: string | undefined;

      do {
        const query = new URLSearchParams({
          singleEvents: "true",
          orderBy: "startTime",
          timeMin: monthStart.toISOString(),
          timeMax: monthEnd.toISOString(),
          maxResults: "250",
        });

        if (pageToken) query.set("pageToken", pageToken);

        const result = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events?" +
            query.toString(),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (requestId !== eventsRequest.current) return;

        if (result.status === 401) {
          const recovered = await trySilentReauth();

          if (requestId !== eventsRequest.current) return;
          if (recovered) return;

          await clearGoogleAccessToken().catch(() => {});

          if (requestId !== eventsRequest.current) return;

          setAccessToken(null);
          setEvents([]);
          setError(
            "La sesión con Google expiró. Conecta nuevamente."
          );
          return;
        }

        if (!result.ok) {
          throw new Error(
            result.status === 403
              ? "Google no permitió consultar el calendario. Revisa los permisos de la conexión."
              : "No se pudieron cargar los eventos. Inténtalo nuevamente."
          );
        }

        const data = (await result.json()) as {
          items?: GoogleEvent[];
          nextPageToken?: string;
        };

        if (requestId !== eventsRequest.current) return;

        collected.push(
          ...(data.items ?? []).filter(
            (event) => typeof event.id === "string"
          )
        );

        pageToken = data.nextPageToken;

        if (pageToken) {
          if (seenPages.has(pageToken)) {
            throw new Error(
              "No se pudo completar la consulta de eventos."
            );
          }

          seenPages.add(pageToken);
        }
      } while (pageToken);

      if (requestId !== eventsRequest.current) return;

      const unique = new Map(
        collected.map((event) => [event.id, event])
      );

      setEvents([...unique.values()]);
    } catch (error: unknown) {
      if (requestId !== eventsRequest.current) return;

      setEvents([]);
      setError(
        error instanceof Error
          ? error.message
          : "Ocurrió un error al consultar el calendario."
      );
    } finally {
      if (requestId === eventsRequest.current) {
        setLoadingEvents(false);
      }
    }
  }

  // Consultar el mes visible cuando la conexión esté preparada.
  useEffect(() => {
    if (!accessToken || loadingToken) {
      eventsRequest.current += 1;
      setLoadingEvents(false);
      return;
    }

    void loadEvents(accessToken);

    return () => {
      eventsRequest.current += 1;
    };
    // La consulta se ejecuta al cambiar el token o el mes visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, loadingToken, visibleYear, visibleMonth]);

  async function handleDisconnect() {
    eventsRequest.current += 1;
    setAccessToken(null);
    setEvents([]);
    setLoadingEvents(false);
    setError(null);

    try {
      await clearGoogleAccessToken();
    } catch {
      setError(
        "No se pudo eliminar la conexión guardada. Vuelve a intentarlo."
      );
    }
  }

  function changeMonth(year: number, month: number) {
    if (
      year === calendarView.year &&
      month === calendarView.month
    ) {
      return;
    }

    eventsRequest.current += 1;
    setEvents([]);
    setLoadingEvents(Boolean(accessToken));
    setError(null);

    setCalendarView((previous) => ({
      ...previous,
      year,
      month,
    }));
  }

  async function connectGoogle() {
    if (!request) return;

    setError(null);

    try {
      if (Platform.OS === "web") {
        const authUrl =
          request.url ??
          (await request.makeAuthUrlAsync(discovery));

        window.location.assign(authUrl);
        return;
      }

      await promptAsync({ showInRecents: true });
    } catch {
      setError(
        "No se pudo iniciar la conexión con Google. Inténtalo nuevamente."
      );
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topBar}>
        <View style={styles.heading}>
          <Text style={styles.title}>Calendario</Text>
          <Text style={styles.subtitle}>
            Organiza tus reuniones y consulta tu agenda.
          </Text>
        </View>

        {!!accessToken && (
          <View style={styles.connectionActions}>
            <Pressable
              accessibilityRole="button"
              disabled={loadingEvents || loadingToken}
              onPress={() => void loadEvents(accessToken)}
              style={[
                styles.button,
                (loadingEvents || loadingToken) &&
                  styles.disabled,
              ]}
            >
              <Text style={styles.buttonText}>
                {loadingEvents ? "Actualizando…" : "Actualizar"}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => void handleDisconnect()}
              style={styles.button}
            >
              <Text style={styles.disconnectText}>
                Desconectar
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {loadingToken ? (
        <View style={styles.connectionCard}>
          <ActivityIndicator color="#7551c8" />
          <Text style={styles.subtitle}>
            Preparando la conexión…
          </Text>
        </View>
      ) : !accessToken ? (
        <View style={styles.connectionCard}>
          <View style={styles.connectionIcon}>
            <Text style={styles.connectionIconText}>G</Text>
          </View>

          <Text style={styles.connectionTitle}>
            Conecta tu Google Calendar
          </Text>

          <Text style={styles.connectionDescription}>
            Consulta tus eventos y continúa con la sincronización
            de actividades de tu CRM.
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={!request}
            onPress={() => void connectGoogle()}
            style={[
              styles.button,
              styles.primary,
              !request && styles.disabled,
            ]}
          >
            <Text style={styles.primaryText}>
              Conectar con Google
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.status}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>
              Google Calendar conectado
            </Text>
          </View>

          <CalendarMonthView
            events={events}
            year={visibleYear}
            month={visibleMonth}
            selectedDate={calendarView.selectedDate}
            loading={loadingEvents}
            onMonthChange={changeMonth}
            onSelectDate={(selectedDate) =>
              setCalendarView((previous) => ({
                ...previous,
                selectedDate,
              }))
            }
            onCreateActivity={() => router.push("/tasks/new")}
          />
        </>
      )}

      {!!error && (
        <View style={styles.errorBox}>
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>

          {!!accessToken && !loadingEvents && !loadingToken && (
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadEvents(accessToken)}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Reintentar</Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f6fa",
  },
  content: {
    width: "100%",
    maxWidth: 1600,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 40,
    gap: 18,
  },
  topBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  heading: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 240,
    minWidth: 0,
    gap: 6,
  },
  title: {
    color: "#202536",
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    color: "#737b8e",
    fontSize: 12,
    lineHeight: 20,
  },
  connectionActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  button: {
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#ded5ef",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#7551c8",
    fontSize: 12,
    fontWeight: "600",
  },
  primary: {
    backgroundColor: "#7551c8",
    borderColor: "#7551c8",
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  disconnectText: {
    color: "#7a6470",
    fontSize: 12,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
  connectionCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e9f0",
    borderRadius: 14,
    padding: 28,
    alignItems: "center",
    gap: 16,
  },
  connectionIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#f1ecfa",
    alignItems: "center",
    justifyContent: "center",
  },
  connectionIconText: {
    color: "#7551c8",
    fontSize: 25,
    fontWeight: "700",
  },
  connectionTitle: {
    color: "#202536",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  connectionDescription: {
    color: "#737b8e",
    fontSize: 13,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 440,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#31a681",
  },
  statusText: {
    color: "#587a65",
    fontSize: 11,
    fontWeight: "500",
  },
  errorBox: {
    borderWidth: 1,
    borderColor: "#f3d6d6",
    backgroundColor: "#fff3f3",
    borderRadius: 10,
    padding: 16,
    alignItems: "flex-start",
    gap: 12,
  },
  error: {
    color: "#b42332",
    fontSize: 12,
    lineHeight: 20,
  },
});