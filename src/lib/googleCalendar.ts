// src/lib/googleCalendar.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const GOOGLE_TOKEN_KEY = "googleCalendar:accessToken";

// Cola de eventos pendientes
const GOOGLE_CAL_QUEUE_KEY = "googleCalendar:queue:v1";

// Map activityId -> googleEventId (para UPDATE y evitar duplicados)
const GOOGLE_EVENT_MAP_KEY = "googleCalendar:eventMap:v1";

// límites sanos para no inflar storage
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
// Queue
// ===============================

type QueuedCalendarItem = {
  activityId: string;
  title: string;
  notes?: string | null;
  startAtISO: string;
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

// ===============================
// EventId map (activityId -> eventId)
// ===============================

type EventMap = Record<string, string>;

async function readEventMap(): Promise<EventMap> {
  try {
    const raw = await AsyncStorage.getItem(GOOGLE_EVENT_MAP_KEY);
    const obj = raw ? (JSON.parse(raw) as EventMap) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

async function writeEventMap(map: EventMap) {
  try {
    await AsyncStorage.setItem(GOOGLE_EVENT_MAP_KEY, JSON.stringify(map));
  } catch {}
}

async function getEventIdForActivity(activityId: string): Promise<string | null> {
  const map = await readEventMap();
  return map[activityId] || null;
}

async function setEventIdForActivity(activityId: string, eventId: string) {
  const map = await readEventMap();
  map[activityId] = eventId;
  await writeEventMap(map);
}

async function removeEventIdForActivity(activityId: string) {
  const map = await readEventMap();
  if (map[activityId]) {
    delete map[activityId];
    await writeEventMap(map);
  }
}

// ===============================
// Queue API
// ===============================

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

  // dedupe por activityId (si ya existe, reemplaza por el más nuevo)
  const next = q.filter((x) => x.activityId !== item.activityId);
  next.push(item);

  // orden por createdAt
  next.sort((a, b) => a.createdAt - b.createdAt);

  // cap
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
 * Vacía la cola:
 * - Si no hay token: lanza not_connected
 * - Si 401/403: limpia token, mantiene cola y lanza not_connected
 * - Si un item falla por red/429/5xx -> se deja en cola
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
      continue;
    }

    try {
      const ok = await upsertGoogleEventWithRetry(accessToken, {
        activityId: item.activityId,
        summary: item.title || "Actividad CRM",
        description: item.notes || undefined,
        startAt,
      });

      if (!ok) remaining.push(item);
    } catch (err: any) {
      if (err?.code === "not_connected") {
        remaining.push(item, ...q.slice(i + 1));
        await writeQueue(remaining);
        throw err;
      }
      remaining.push(item);
    }
  }

  await writeQueue(remaining);
}

// ===============================
// Google API helpers (POST/PATCH)
// ===============================

function buildEventBody(payload: {
  summary: string;
  description?: string;
  startAt: Date;
}) {
  const startAt = payload.startAt;
  const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);

  return {
    summary: payload.summary || "Actividad CRM",
    description: payload.description || undefined,
    start: { dateTime: startAt.toISOString() },
    end: { dateTime: endAt.toISOString() },
  };
}

async function createGoogleEvent(
  accessToken: string,
  payload: { summary: string; description?: string; startAt: Date }
): Promise<{ ok: boolean; eventId?: string }> {
  const { startAt } = payload;
  if (Number.isNaN(startAt.getTime())) return { ok: true };

  const body = buildEventBody(payload);

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
  } catch {
    return { ok: false };
  }

  if (res.status === 401 || res.status === 403) {
    await clearGoogleAccessToken();
    throw makeNotConnectedError();
  }

  if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
    return { ok: false };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.log("Error creando evento en Google Calendar:", text);
    return { ok: false };
  }

  try {
    const json: any = await res.json();
    const eventId = typeof json?.id === "string" ? json.id : undefined;
    return { ok: true, eventId };
  } catch {
    return { ok: true };
  }
}

async function patchGoogleEvent(
  accessToken: string,
  eventId: string,
  payload: { summary: string; description?: string; startAt: Date }
): Promise<{ ok: boolean; notFound?: boolean }> {
  const { startAt } = payload;
  if (!eventId) return { ok: true };
  if (Number.isNaN(startAt.getTime())) return { ok: true };

  const body = buildEventBody(payload);

  let res: Response;
  try {
    res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
        eventId
      )}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
  } catch {
    return { ok: false };
  }

  if (res.status === 401 || res.status === 403) {
    await clearGoogleAccessToken();
    throw makeNotConnectedError();
  }

  if (res.status === 404) {
    return { ok: false, notFound: true };
  }

  if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
    return { ok: false };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.log("Error actualizando evento en Google Calendar:", text);
    return { ok: false };
  }

  return { ok: true };
}

async function upsertGoogleEventWithRetry(
  accessToken: string,
  payload: {
    activityId: string;
    summary: string;
    description?: string;
    startAt: Date;
  }
): Promise<boolean> {
  // intento 1
  const r1 = await upsertGoogleEvent(accessToken, payload);
  if (r1 === true) return true;

  await sleep(RETRY_DELAY_MS);

  // intento 2
  return upsertGoogleEvent(accessToken, payload);
}

async function upsertGoogleEvent(
  accessToken: string,
  payload: {
    activityId: string;
    summary: string;
    description?: string;
    startAt: Date;
  }
): Promise<boolean> {
  const { activityId } = payload;

  const existingEventId = await getEventIdForActivity(activityId);

  // si ya existe -> PATCH (reagendar)
  if (existingEventId) {
    const patched = await patchGoogleEvent(accessToken, existingEventId, payload);

    if (patched.ok) return true;

    // si no existe en Google (404) -> borra map y cae a CREATE
    if (patched.notFound) {
      await removeEventIdForActivity(activityId);
    } else {
      // fallo recuperable
      return false;
    }
  }

  // CREATE (nuevo) y guarda el eventId
  const created = await createGoogleEvent(accessToken, payload);
  if (!created.ok) return false;

  if (created.eventId) {
    await setEventIdForActivity(activityId, created.eventId);
  }

  return true;
}

// ===============================
// Public API
// ===============================

/**
 * Crea o actualiza el evento en Google Calendar para esta actividad.
 * - Si NO hay token: ENCOLA.
 * - Si token muere (401/403): limpia token y ENCOLA.
 * - Si falla por red: ENCOLA.
 * - Si ya existe eventId guardado: actualiza (PATCH) en vez de duplicar.
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
    const ok = await upsertGoogleEventWithRetry(accessToken, {
      activityId: activity.id,
      summary: activity.title || "Actividad CRM",
      description: activity.notes || undefined,
      startAt,
    });

    if (!ok) {
      await enqueueCalendarEventFromActivity(activity);
    }
  } catch (err: any) {
    await enqueueCalendarEventFromActivity(activity);
  }
}

/**
 * Opcional (pro): si quieres borrar el evento de Google cuando el usuario desactiva el recordatorio.
 * No lo estoy usando en ningún lado todavía, pero queda listo.
 */
export async function deleteCalendarEventForActivity(activityId: string) {
  const accessToken = await loadGoogleAccessToken();
  if (!accessToken) return;

  const eventId = await getEventIdForActivity(activityId);
  if (!eventId) return;

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
        eventId
      )}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (res.status === 401 || res.status === 403) {
      await clearGoogleAccessToken();
      return;
    }

    // si ok o 404, igual limpiamos el map local
    await removeEventIdForActivity(activityId);
  } catch {
    // red: no hacemos nada
  }
}


// // src/lib/googleCalendar.ts
// import AsyncStorage from "@react-native-async-storage/async-storage";

// const GOOGLE_TOKEN_KEY = "googleCalendar:accessToken";

// // ✅ Cola de eventos pendientes
// const GOOGLE_CAL_QUEUE_KEY = "googleCalendar:queue:v1";

// // ✅ límites sanos para no inflar storage
// const MAX_QUEUE_ITEMS = 200;

// // retry simple (red / 429 / 5xx)
// const RETRY_DELAY_MS = 400;

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

// // ===============================
// // ✅ COLA (Queue) de calendar events
// // ===============================

// type QueuedCalendarItem = {
//   activityId: string;
//   title: string;
//   notes?: string | null;
//   startAtISO: string; // guardamos string para no perder Date
//   createdAt: number;
// };

// async function readQueue(): Promise<QueuedCalendarItem[]> {
//   try {
//     const raw = await AsyncStorage.getItem(GOOGLE_CAL_QUEUE_KEY);
//     const arr = raw ? (JSON.parse(raw) as QueuedCalendarItem[]) : [];
//     return Array.isArray(arr) ? arr : [];
//   } catch {
//     return [];
//   }
// }

// async function writeQueue(items: QueuedCalendarItem[]) {
//   try {
//     await AsyncStorage.setItem(GOOGLE_CAL_QUEUE_KEY, JSON.stringify(items));
//   } catch {}
// }

// function sleep(ms: number) {
//   return new Promise((r) => setTimeout(r, ms));
// }

// function makeNotConnectedError() {
//   const err: any = new Error("Google Calendar not connected");
//   err.code = "not_connected";
//   return err;
// }

// /**
//  * Agrega a la cola un evento “pendiente” (dedupe por activityId).
//  * Úsalo cuando NO hay Google conectado.
//  */
// export async function enqueueCalendarEventFromActivity(
//   activity: CalendarActivityPayload
// ) {
//   const startAt = activity.startAt;
//   if (!startAt || Number.isNaN(startAt.getTime())) return;

//   const item: QueuedCalendarItem = {
//     activityId: activity.id,
//     title: activity.title || "Actividad CRM",
//     notes: activity.notes || null,
//     startAtISO: startAt.toISOString(),
//     createdAt: Date.now(),
//   };

//   const q = await readQueue();

//   // ✅ dedupe por id (si ya existe, lo reemplazamos por el más nuevo)
//   const next = q.filter((x) => x.activityId !== item.activityId);
//   next.push(item);

//   // ✅ orden por createdAt (asc)
//   next.sort((a, b) => a.createdAt - b.createdAt);

//   // ✅ cap de tamaño: si se pasa, recortamos los más viejos
//   const trimmed =
//     next.length > MAX_QUEUE_ITEMS ? next.slice(next.length - MAX_QUEUE_ITEMS) : next;

//   await writeQueue(trimmed);
// }

// export async function getCalendarQueueCount(): Promise<number> {
//   const q = await readQueue();
//   return q.length;
// }

// export async function clearCalendarQueue() {
//   try {
//     await AsyncStorage.removeItem(GOOGLE_CAL_QUEUE_KEY);
//   } catch {}
// }

// /**
//  * Vacía la cola: intenta crear todos los eventos pendientes en Google Calendar.
//  * - Si no hay token: lanza { code: "not_connected" }
//  * - Si token inválido (401/403): limpia token, mantiene cola y lanza { code: "not_connected" }
//  * - Si un item falla por red/429/5xx, se deja en cola.
//  */
// export async function flushCalendarQueue() {
//   const accessToken = await loadGoogleAccessToken();
//   if (!accessToken) throw makeNotConnectedError();

//   const q = await readQueue();
//   if (q.length === 0) return;

//   const remaining: QueuedCalendarItem[] = [];

//   for (let i = 0; i < q.length; i++) {
//     const item = q[i];

//     const startAt = new Date(item.startAtISO);
//     if (Number.isNaN(startAt.getTime())) {
//       // dato corrupto → lo descartamos
//       continue;
//     }

//     try {
//       const ok = await createGoogleEventWithRetry(accessToken, {
//         summary: item.title || "Actividad CRM",
//         description: item.notes || undefined,
//         startAt,
//       });

//       if (!ok) {
//         // fallo recuperable (red/429/5xx/otro no-auth) → se queda en cola
//         remaining.push(item);
//       }
//     } catch (err: any) {
//       // si es not_connected, dejamos este y TODOS los que faltan en cola
//       if (err?.code === "not_connected") {
//         remaining.push(item, ...q.slice(i + 1));
//         await writeQueue(remaining);
//         throw err;
//       }

//       // error desconocido → se queda en cola
//       remaining.push(item);
//     }
//   }

//   await writeQueue(remaining);
// }

// // ===============================
// // ✅ Crear evento real en Google
// // ===============================

// async function createGoogleEventWithRetry(
//   accessToken: string,
//   payload: { summary: string; description?: string; startAt: Date }
// ): Promise<boolean> {
//   // 1er intento
//   const r1 = await createGoogleEvent(accessToken, payload);

//   // si fue ok, listo
//   if (r1 === true) return true;

//   // r1=false significa fallo recuperable (no-auth no llega como false, llega como throw)
//   await sleep(RETRY_DELAY_MS);

//   // 2do intento
//   return createGoogleEvent(accessToken, payload);
// }

// /**
//  * Devuelve:
//  * - true  => creado OK
//  * - false => fallo recuperable (red/429/5xx/otros)
//  * Lanza:
//  * - { code: "not_connected" } si 401/403 (y limpia token)
//  */
// async function createGoogleEvent(
//   accessToken: string,
//   payload: { summary: string; description?: string; startAt: Date }
// ): Promise<boolean> {
//   const { startAt } = payload;
//   if (Number.isNaN(startAt.getTime())) return true;

//   // Duración por defecto: 30 minutos
//   const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);

//   const body = {
//     summary: payload.summary || "Actividad CRM",
//     description: payload.description || undefined,
//     start: { dateTime: startAt.toISOString() },
//     end: { dateTime: endAt.toISOString() },
//   };

//   let res: Response;

//   try {
//     res = await fetch(
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
//   } catch (e) {
//     // red
//     return false;
//   }

//   // token inválido / permisos
//   if (res.status === 401 || res.status === 403) {
//     await clearGoogleAccessToken();
//     throw makeNotConnectedError();
//   }

//   // rate limit / server errors => recuperable
//   if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
//     return false;
//   }

//   if (!res.ok) {
//     const text = await res.text().catch(() => "");
//     console.log("Error creando evento en Google Calendar:", text);
//     return false;
//   }

//   return true;
// }

// /**
//  * Crea un evento en el calendario principal de Google usando startAt.
//  *
//  * ✅ Importante (cola):
//  * - Si NO hay token -> ENCOLA (antes era “no hace nada”).
//  * - Si token muere (401/403) -> limpia token y ENCOLA.
//  * - Si falla por red -> ENCOLA (así no se pierde).
//  */
// export async function createCalendarEventFromActivity(
//   activity: CalendarActivityPayload
// ) {
//   const { startAt } = activity;
//   if (!startAt || Number.isNaN(startAt.getTime())) return;

//   const accessToken = await loadGoogleAccessToken();
//   if (!accessToken) {
//     await enqueueCalendarEventFromActivity(activity);
//     return;
//   }

//   try {
//     const ok = await createGoogleEventWithRetry(accessToken, {
//       summary: activity.title || "Actividad CRM",
//       description: activity.notes || undefined,
//       startAt,
//     });

//     if (!ok) {
//       // fallo recuperable => a cola
//       await enqueueCalendarEventFromActivity(activity);
//     }
//   } catch (err: any) {
//     // not_connected u otros => a cola
//     await enqueueCalendarEventFromActivity(activity);
//   }
// }

