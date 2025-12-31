// src/lib/googleCalendar.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const GOOGLE_TOKEN_KEY = "googleCalendar:accessToken";

// ✅ Cola de eventos pendientes
const GOOGLE_CAL_QUEUE_KEY = "googleCalendar:queue:v1";

// ✅ límites sanos para no inflar storage
const MAX_QUEUE_ITEMS = 200;

// retry simple (red / 429 / 5xx)
const RETRY_DELAY_MS = 400;

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

// ===============================
// ✅ COLA (Queue) de calendar events
// ===============================

type QueuedCalendarItem = {
  activityId: string;
  title: string;
  notes?: string | null;
  startAtISO: string; // guardamos string para no perder Date
  createdAt: number;
};

async function readQueue(): Promise<QueuedCalendarItem[]> {
  try {
    const raw = await AsyncStorage.getItem(GOOGLE_CAL_QUEUE_KEY);
    const arr = raw ? (JSON.parse(raw) as QueuedCalendarItem[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedCalendarItem[]) {
  try {
    await AsyncStorage.setItem(GOOGLE_CAL_QUEUE_KEY, JSON.stringify(items));
  } catch {}
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeNotConnectedError() {
  const err: any = new Error("Google Calendar not connected");
  err.code = "not_connected";
  return err;
}

/**
 * Agrega a la cola un evento “pendiente” (dedupe por activityId).
 * Úsalo cuando NO hay Google conectado.
 */
export async function enqueueCalendarEventFromActivity(
  activity: CalendarActivityPayload
) {
  const startAt = activity.startAt;
  if (!startAt || Number.isNaN(startAt.getTime())) return;

  const item: QueuedCalendarItem = {
    activityId: activity.id,
    title: activity.title || "Actividad CRM",
    notes: activity.notes || null,
    startAtISO: startAt.toISOString(),
    createdAt: Date.now(),
  };

  const q = await readQueue();

  // ✅ dedupe por id (si ya existe, lo reemplazamos por el más nuevo)
  const next = q.filter((x) => x.activityId !== item.activityId);
  next.push(item);

  // ✅ orden por createdAt (asc)
  next.sort((a, b) => a.createdAt - b.createdAt);

  // ✅ cap de tamaño: si se pasa, recortamos los más viejos
  const trimmed =
    next.length > MAX_QUEUE_ITEMS ? next.slice(next.length - MAX_QUEUE_ITEMS) : next;

  await writeQueue(trimmed);
}

export async function getCalendarQueueCount(): Promise<number> {
  const q = await readQueue();
  return q.length;
}

export async function clearCalendarQueue() {
  try {
    await AsyncStorage.removeItem(GOOGLE_CAL_QUEUE_KEY);
  } catch {}
}

/**
 * Vacía la cola: intenta crear todos los eventos pendientes en Google Calendar.
 * - Si no hay token: lanza { code: "not_connected" }
 * - Si token inválido (401/403): limpia token, mantiene cola y lanza { code: "not_connected" }
 * - Si un item falla por red/429/5xx, se deja en cola.
 */
export async function flushCalendarQueue() {
  const accessToken = await loadGoogleAccessToken();
  if (!accessToken) throw makeNotConnectedError();

  const q = await readQueue();
  if (q.length === 0) return;

  const remaining: QueuedCalendarItem[] = [];

  for (let i = 0; i < q.length; i++) {
    const item = q[i];

    const startAt = new Date(item.startAtISO);
    if (Number.isNaN(startAt.getTime())) {
      // dato corrupto → lo descartamos
      continue;
    }

    try {
      const ok = await createGoogleEventWithRetry(accessToken, {
        summary: item.title || "Actividad CRM",
        description: item.notes || undefined,
        startAt,
      });

      if (!ok) {
        // fallo recuperable (red/429/5xx/otro no-auth) → se queda en cola
        remaining.push(item);
      }
    } catch (err: any) {
      // si es not_connected, dejamos este y TODOS los que faltan en cola
      if (err?.code === "not_connected") {
        remaining.push(item, ...q.slice(i + 1));
        await writeQueue(remaining);
        throw err;
      }

      // error desconocido → se queda en cola
      remaining.push(item);
    }
  }

  await writeQueue(remaining);
}

// ===============================
// ✅ Crear evento real en Google
// ===============================

async function createGoogleEventWithRetry(
  accessToken: string,
  payload: { summary: string; description?: string; startAt: Date }
): Promise<boolean> {
  // 1er intento
  const r1 = await createGoogleEvent(accessToken, payload);

  // si fue ok, listo
  if (r1 === true) return true;

  // r1=false significa fallo recuperable (no-auth no llega como false, llega como throw)
  await sleep(RETRY_DELAY_MS);

  // 2do intento
  return createGoogleEvent(accessToken, payload);
}

/**
 * Devuelve:
 * - true  => creado OK
 * - false => fallo recuperable (red/429/5xx/otros)
 * Lanza:
 * - { code: "not_connected" } si 401/403 (y limpia token)
 */
async function createGoogleEvent(
  accessToken: string,
  payload: { summary: string; description?: string; startAt: Date }
): Promise<boolean> {
  const { startAt } = payload;
  if (Number.isNaN(startAt.getTime())) return true;

  // Duración por defecto: 30 minutos
  const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);

  const body = {
    summary: payload.summary || "Actividad CRM",
    description: payload.description || undefined,
    start: { dateTime: startAt.toISOString() },
    end: { dateTime: endAt.toISOString() },
  };

  let res: Response;

  try {
    res = await fetch(
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
  } catch (e) {
    // red
    return false;
  }

  // token inválido / permisos
  if (res.status === 401 || res.status === 403) {
    await clearGoogleAccessToken();
    throw makeNotConnectedError();
  }

  // rate limit / server errors => recuperable
  if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
    return false;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.log("Error creando evento en Google Calendar:", text);
    return false;
  }

  return true;
}

/**
 * Crea un evento en el calendario principal de Google usando startAt.
 *
 * ✅ Importante (cola):
 * - Si NO hay token -> ENCOLA (antes era “no hace nada”).
 * - Si token muere (401/403) -> limpia token y ENCOLA.
 * - Si falla por red -> ENCOLA (así no se pierde).
 */
export async function createCalendarEventFromActivity(
  activity: CalendarActivityPayload
) {
  const { startAt } = activity;
  if (!startAt || Number.isNaN(startAt.getTime())) return;

  const accessToken = await loadGoogleAccessToken();
  if (!accessToken) {
    await enqueueCalendarEventFromActivity(activity);
    return;
  }

  try {
    const ok = await createGoogleEventWithRetry(accessToken, {
      summary: activity.title || "Actividad CRM",
      description: activity.notes || undefined,
      startAt,
    });

    if (!ok) {
      // fallo recuperable => a cola
      await enqueueCalendarEventFromActivity(activity);
    }
  } catch (err: any) {
    // not_connected u otros => a cola
    await enqueueCalendarEventFromActivity(activity);
  }
}


// // src/lib/googleCalendar.ts
// import AsyncStorage from "@react-native-async-storage/async-storage";

// const GOOGLE_TOKEN_KEY = "googleCalendar:accessToken";

// type StoredGoogleToken = {
//   accessToken: string;
//   expiresAt?: number | null;
// };

// export async function saveGoogleAccessToken(
//   accessToken: string,
//   expiresInSec?: number
// ) {
//   const now = Date.now();
//   const expiresAt =
//     typeof expiresInSec === "number" ? now + expiresInSec * 1000 : null;

//   const payload: StoredGoogleToken = { accessToken, expiresAt };
//   await AsyncStorage.setItem(GOOGLE_TOKEN_KEY, JSON.stringify(payload));
// }

// export async function loadGoogleAccessToken(): Promise<string | null> {
//   try {
//     const raw = await AsyncStorage.getItem(GOOGLE_TOKEN_KEY);
//     if (!raw) return null;

//     const parsed: StoredGoogleToken = JSON.parse(raw);
//     if (parsed.expiresAt && parsed.expiresAt <= Date.now()) {
//       await AsyncStorage.removeItem(GOOGLE_TOKEN_KEY);
//       return null;
//     }
//     return parsed.accessToken || null;
//   } catch {
//     return null;
//   }
// }

// export async function clearGoogleAccessToken() {
//   try {
//     await AsyncStorage.removeItem(GOOGLE_TOKEN_KEY);
//   } catch {}
// }

// export type CalendarActivityPayload = {
//   id: string;
//   title: string;
//   notes?: string | null;
//   startAt: Date; // fecha+hora del recordatorio
// };


// /**
//  * Crea un evento en el calendario principal de Google usando startAt
//  * como hora de inicio. Si no hay token guardado, NO hace nada.
//  */
// export async function createCalendarEventFromActivity(
//   activity: CalendarActivityPayload
// ) {
//   const accessToken = await loadGoogleAccessToken();
//   if (!accessToken) {
//     // Usuario no ha conectado Google Calendar → salimos silenciosamente.
//     return;
//   }

//   const { startAt } = activity;
//   if (Number.isNaN(startAt.getTime())) return;

//   // Duración por defecto: 30 minutos
//   const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);

//   const body = {
//     summary: activity.title || "Actividad CRM",
//     description: activity.notes || undefined,
//     start: {
//       dateTime: startAt.toISOString(),
//     },
//     end: {
//       dateTime: endAt.toISOString(),
//     },
//   };

//   try {
//     const res = await fetch(
//       "https://www.googleapis.com/calendar/v3/calendars/primary/events",
//       {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify(body),
//       }
//     );

//     if (res.status === 401 || res.status === 403) {
//       // Token caducado o sin permisos → limpiar para que el user vuelva a conectar
//       await clearGoogleAccessToken();
//       return;
//     }

//     if (!res.ok) {
//       const text = await res.text();
//       console.log("Error creando evento en Google Calendar:", text);
//     }
//   } catch (err) {
//     console.log("Error de red al crear evento en Google Calendar:", err);
//   }
// }
