// src/lib/googleCalendar.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const GOOGLE_TOKEN_KEY = "googleCalendar:accessToken";

type StoredGoogleToken = {
  accessToken: string;
  expiresAt?: number | null;
};

export async function saveGoogleAccessToken(
  accessToken: string,
  expiresInSec?: number
) {
  const now = Date.now();
  const expiresAt =
    typeof expiresInSec === "number" ? now + expiresInSec * 1000 : null;

  const payload: StoredGoogleToken = { accessToken, expiresAt };
  await AsyncStorage.setItem(GOOGLE_TOKEN_KEY, JSON.stringify(payload));
}

export async function loadGoogleAccessToken(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(GOOGLE_TOKEN_KEY);
    if (!raw) return null;

    const parsed: StoredGoogleToken = JSON.parse(raw);
    if (parsed.expiresAt && parsed.expiresAt <= Date.now()) {
      await AsyncStorage.removeItem(GOOGLE_TOKEN_KEY);
      return null;
    }
    return parsed.accessToken || null;
  } catch {
    return null;
  }
}

export async function clearGoogleAccessToken() {
  try {
    await AsyncStorage.removeItem(GOOGLE_TOKEN_KEY);
  } catch {}
}

export type CalendarActivityPayload = {
  id: string;
  title: string;
  notes?: string | null;
  startAt: Date; // fecha+hora del recordatorio
};


/**
 * Crea un evento en el calendario principal de Google usando startAt
 * como hora de inicio. Si no hay token guardado, NO hace nada.
 */
export async function createCalendarEventFromActivity(
  activity: CalendarActivityPayload
) {
  const accessToken = await loadGoogleAccessToken();
  if (!accessToken) {
    // Usuario no ha conectado Google Calendar → salimos silenciosamente.
    return;
  }

  const { startAt } = activity;
  if (Number.isNaN(startAt.getTime())) return;

  // Duración por defecto: 30 minutos
  const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);

  const body = {
    summary: activity.title || "Actividad CRM",
    description: activity.notes || undefined,
    start: {
      dateTime: startAt.toISOString(),
    },
    end: {
      dateTime: endAt.toISOString(),
    },
  };

  try {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (res.status === 401 || res.status === 403) {
      // Token caducado o sin permisos → limpiar para que el user vuelva a conectar
      await clearGoogleAccessToken();
      return;
    }

    if (!res.ok) {
      const text = await res.text();
      console.log("Error creando evento en Google Calendar:", text);
    }
  } catch (err) {
    console.log("Error de red al crear evento en Google Calendar:", err);
  }
}
