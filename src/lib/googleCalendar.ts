// src/lib/googleCalendar.ts
import {
  getAuthStorageScope,
  getToken,
} from "@/src/api/auth";
import { getBaseURL } from "@/src/config/baseUrl";
import AsyncStorage from "@react-native-async-storage/async-storage";

const GOOGLE_TOKEN_KEY = "googleCalendar:accessToken:v2";
const GOOGLE_CAL_QUEUE_KEY = "googleCalendar:queue:v2";
const GOOGLE_EVENT_MAP_KEY = "googleCalendar:eventMap:v2";

const MAX_QUEUE_ITEMS = 200;
const RETRY_DELAY_MS = 400;

const GOOGLE_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

type CalendarContext = {
  storageKey: string;
  crmToken: string;
  tenantId: string;
  apiBase: string;
};

type StoredGoogleToken = {
  accessToken: string;
  expiresAt?: number | null;
};

export type CalendarActivityPayload = {
  id: string;
  title: string;
  notes?: string | null;
  startAt: Date;
};

// La cola no almacena títulos ni notas.
// Se recuperan del CRM cuando se procesa cada actividad.
type QueuedCalendarItem = {
  activityId: string;
  createdAt: number;
};

type EventMap = Record<string, string>;

type CurrentActivity = {
  id: string;
  title?: string;
  notes?: string | null;
  status?: string;
  remind_at_ms?: number | string | null;
  due_date?: number | string | null;
};

type CalendarError = Error & {
  code?: string;
};

type GoogleResult = {
  ok: boolean;
  notFound?: boolean;
  eventId?: string;
};

// Serializa las operaciones de este módulo para evitar que
// dos procesos sobrescriban simultáneamente la cola o el mapa.
let operationTail: Promise<unknown> = Promise.resolve();

function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationTail.then(operation);

  operationTail = result.then(
    () => undefined,
    () => undefined
  );

  return result;
}

function makeError(code: string, message: string): CalendarError {
  const error: CalendarError = new Error(message);
  error.code = code;
  return error;
}

function makeNotConnectedError() {
  return makeError(
    "not_connected",
    "Google Calendar no está conectado."
  );
}

function errorCode(error: unknown): string | undefined {
  return (error as CalendarError | null)?.code;
}

function storageKey(context: CalendarContext, key: string) {
  return `${key}:${context.storageKey}`;
}

async function captureContext(): Promise<CalendarContext | null> {
  const tokenBefore = await getToken();
  if (!tokenBefore) return null;

  const scope = await getAuthStorageScope();
  if (!scope) return null;

  if ((await getToken()) !== tokenBefore) return null;

  return {
    storageKey: scope.storageKey,
    crmToken: tokenBefore,
    tenantId: scope.tenantId,
    apiBase: getBaseURL().replace(/\/+$/, ""),
  };
}

async function requireContext(): Promise<CalendarContext> {
  const context = await captureContext();

  if (!context) {
    throw makeError(
      "session_changed",
      "Debes iniciar sesión para utilizar Google Calendar."
    );
  }

  return context;
}

async function assertContext(context: CalendarContext) {
  const current = await captureContext();

  if (
    !current ||
    current.storageKey !== context.storageKey ||
    current.crmToken !== context.crmToken
  ) {
    throw makeError(
      "session_changed",
      "La sesión o el workspace cambió. Vuelve a intentar."
    );
  }
}

// ===============================
// Storage interno con contexto fijo
// ===============================

async function readGoogleToken(
  context: CalendarContext
): Promise<StoredGoogleToken | null> {
  const key = storageKey(context, GOOGLE_TOKEN_KEY);
  const raw = await AsyncStorage.getItem(key);

  if (!raw) return null;

  let parsed: StoredGoogleToken;

  try {
    parsed = JSON.parse(raw);
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }

  if (
    !parsed ||
    typeof parsed.accessToken !== "string" ||
    !parsed.accessToken.trim()
  ) {
    await AsyncStorage.removeItem(key);
    return null;
  }

  if (
    parsed.expiresAt != null &&
    (
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt <= Date.now()
    )
  ) {
    await AsyncStorage.removeItem(key);
    return null;
  }

  return parsed;
}

async function readQueue(
  context: CalendarContext
): Promise<QueuedCalendarItem[]> {
  const raw = await AsyncStorage.getItem(
    storageKey(context, GOOGLE_CAL_QUEUE_KEY)
  );

  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const unique = new Map<string, QueuedCalendarItem>();

    for (const value of parsed) {
      if (
        !value ||
        typeof value.activityId !== "string" ||
        !value.activityId.trim()
      ) {
        continue;
      }

      unique.set(value.activityId, {
        activityId: value.activityId,
        createdAt: Number.isFinite(Number(value.createdAt))
          ? Number(value.createdAt)
          : Date.now(),
      });
    }

    return [...unique.values()]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-MAX_QUEUE_ITEMS);
  } catch {
    return [];
  }
}

async function writeQueue(
  context: CalendarContext,
  items: QueuedCalendarItem[]
) {
  await AsyncStorage.setItem(
    storageKey(context, GOOGLE_CAL_QUEUE_KEY),
    JSON.stringify(items)
  );
}

async function readEventMap(
  context: CalendarContext
): Promise<EventMap> {
  const raw = await AsyncStorage.getItem(
    storageKey(context, GOOGLE_EVENT_MAP_KEY)
  );

  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: EventMap = Object.create(null);

    for (const [id, eventId] of Object.entries(parsed)) {
      if (typeof eventId === "string" && eventId) {
        result[id] = eventId;
      }
    }

    return result;
  } catch {
    return {};
  }
}

async function writeEventMap(
  context: CalendarContext,
  map: EventMap
) {
  await AsyncStorage.setItem(
    storageKey(context, GOOGLE_EVENT_MAP_KEY),
    JSON.stringify(map)
  );
}

async function enqueue(
  context: CalendarContext,
  activityId: string
) {
  const queue = await readQueue(context);
  const next = queue.filter(
    (item) => item.activityId !== activityId
  );

  next.push({ activityId, createdAt: Date.now() });

  await writeQueue(context, next.slice(-MAX_QUEUE_ITEMS));
}

// ===============================
// Token público
// ===============================

export async function saveGoogleAccessToken(
  accessToken: string,
  expiresInSec?: number
) {
  const context = await requireContext();

  return serial(async () => {
    await assertContext(context);

    const token = accessToken.trim();

    if (!token) {
      throw new Error("El token de Google está vacío.");
    }

    // Identifica la cuenta, independientemente de que su
    // access token haya cambiado.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let accountId: string;

    try {
      const response = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error(
          "No se pudo identificar la cuenta de Google. " +
          "Vuelve a conectarla y acepta los permisos."
        );
      }

      const account = await response.json();

      if (
        typeof account?.sub !== "string" ||
        !account.sub.trim()
      ) {
        throw new Error(
          "Google no devolvió un identificador de cuenta válido."
        );
      }

      accountId = account.sub;
    } finally {
      clearTimeout(timeout);
    }

    await assertContext(context);

    const accountKey = storageKey(
      context,
      "googleCalendar:account:v2"
    );

    const mapKey = storageKey(
      context,
      GOOGLE_EVENT_MAP_KEY
    );

    const previousAccountId =
      await AsyncStorage.getItem(accountKey);

    if (previousAccountId !== accountId) {
      // Conserva por separado el mapa de la cuenta anterior.
      if (previousAccountId) {
        const previousMap = await AsyncStorage.getItem(mapKey);

        if (previousMap) {
          await AsyncStorage.setItem(
            `${mapKey}:account:${encodeURIComponent(previousAccountId)}`,
            previousMap
          );
        }
      }

      // Recupera el mapa si esta cuenta ya estuvo conectada.
      const savedMap = await AsyncStorage.getItem(
        `${mapKey}:account:${encodeURIComponent(accountId)}`
      );

      if (!previousAccountId) {
        // El mapa antiguo no tiene una cuenta identificada.
        // Se conserva como respaldo, sin atribuírselo a otra cuenta.
        const legacyMap = await AsyncStorage.getItem(mapKey);

        if (legacyMap) {
          await AsyncStorage.setItem(
            `${mapKey}:unidentified-backup`,
            legacyMap
          );
        }
      }

      await assertContext(context);

      await AsyncStorage.setItem(mapKey, savedMap || "{}");
      await AsyncStorage.setItem(accountKey, accountId);
    }

    const payload: StoredGoogleToken = {
      accessToken: token,
      expiresAt:
        typeof expiresInSec === "number" &&
        Number.isFinite(expiresInSec)
          ? Date.now() + Math.max(0, expiresInSec) * 1000
          : null,
    };

    await assertContext(context);

    await AsyncStorage.setItem(
      storageKey(context, GOOGLE_TOKEN_KEY),
      JSON.stringify(payload)
    );
  });
}

export async function loadGoogleAccessToken(): Promise<string | null> {
  const context = await captureContext();
  if (!context) return null;

  return serial(async () => {
    await assertContext(context);
    const token = await readGoogleToken(context);
    await assertContext(context);
    return token?.accessToken || null;
  });
}

export async function clearGoogleAccessToken() {
  const context = await captureContext();
  if (!context) return;

  return serial(async () => {
    await AsyncStorage.removeItem(
      storageKey(context, GOOGLE_TOKEN_KEY)
    );
  });
}

// ===============================
// Cola pública
// ===============================

export async function enqueueCalendarEventFromActivity(
  activity: CalendarActivityPayload
) {
  if (!activity.id?.trim()) return;

  const context = await requireContext();

  return serial(async () => {
    await assertContext(context);
    await enqueue(context, activity.id);
  });
}

export async function getCalendarQueueCount(): Promise<number> {
  const context = await captureContext();
  if (!context) return 0;

  return serial(async () => {
    await assertContext(context);
    const queue = await readQueue(context);
    return queue.length;
  });
}

export async function clearCalendarQueue() {
  const context = await captureContext();
  if (!context) return;

  return serial(async () => {
    await AsyncStorage.removeItem(
      storageKey(context, GOOGLE_CAL_QUEUE_KEY)
    );
  });
}

// ===============================
// Consulta actual al CRM
// ===============================

async function readCurrentActivity(
  context: CalendarContext,
  activityId: string
): Promise<CurrentActivity | null> {
  await assertContext(context);

  const response = await fetch(
    `${context.apiBase}/activities/${encodeURIComponent(activityId)}`,
    {
      method: "GET",
      headers: {
  Accept: "application/json",
  Authorization: `Bearer ${context.crmToken}`,
  "X-Tenant-Id": context.tenantId,
},
    }
  );

  await assertContext(context);

  if (response.status === 403 || response.status === 404) {
    return null;
  }

  if (response.status === 401) {
    throw makeError(
      "session_changed",
      "La sesión del CRM ya no es válida."
    );
  }

  if (!response.ok) {
    throw makeError(
      "crm_unavailable",
      "No se pudo comprobar la actividad."
    );
  }

  const activity = (await response.json()) as CurrentActivity;

  if (!activity || activity.id !== activityId) {
    throw makeError(
      "invalid_activity_response",
      "La respuesta de la actividad no es válida."
    );
  }

  return activity;
}

function buildEventBody(activity: CurrentActivity) {
  if (activity.status !== "open") return null;

  const timestamp = Number(
    activity.remind_at_ms ?? activity.due_date
  );

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  const start = new Date(timestamp);
  const end = new Date(timestamp + 30 * 60 * 1000);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return null;
  }

  return {
    summary: activity.title || "Actividad CRM",
    description: activity.notes || "",
    visibility: "private",
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

// ===============================
// Google API
// ===============================

async function googleRequest(
  context: CalendarContext,
  accessToken: string,
  method: "POST" | "PATCH" | "DELETE",
  eventId?: string,
  body?: object
): Promise<GoogleResult> {
  await assertContext(context);

  const url = eventId
    ? `${GOOGLE_EVENTS_URL}/${encodeURIComponent(eventId)}`
    : GOOGLE_EVENTS_URL;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 401 || response.status === 403) {
    // Borra únicamente el token del contexto que hizo la petición.
    await AsyncStorage.removeItem(
      storageKey(context, GOOGLE_TOKEN_KEY)
    );

    throw makeNotConnectedError();
  }

  if (response.status === 404 || response.status === 410) {
    return { ok: false, notFound: true };
  }

  if (!response.ok) {
    return { ok: false };
  }

  if (method === "POST") {
    const result = await response.json();

    if (typeof result?.id !== "string" || !result.id) {
      return { ok: false };
    }

    return { ok: true, eventId: result.id };
  }

  return { ok: true };
}

async function upsertCurrentActivity(
  context: CalendarContext,
  accessToken: string,
  activityId: string
): Promise<boolean> {
  const map = await readEventMap(context);
  const existingEventId = map[activityId];

  // Recupera los datos vigentes, no los de la cola.
  let activity = await readCurrentActivity(context, activityId);
  if (!activity) return true;

  let body = buildEventBody(activity);
  if (!body) return true;

  if (existingEventId) {
    const patched = await googleRequest(
      context,
      accessToken,
      "PATCH",
      existingEventId,
      body
    );

    if (patched.ok) return true;
    if (!patched.notFound) return false;

    delete map[activityId];
    await writeEventMap(context, map);

    // Revalida antes de crear tras un PATCH que devolvió 404.
    activity = await readCurrentActivity(context, activityId);
    if (!activity) return true;

    body = buildEventBody(activity);
    if (!body) return true;
  }

  const created = await googleRequest(
    context,
    accessToken,
    "POST",
    undefined,
    body
  );

  if (!created.ok || !created.eventId) return false;

  map[activityId] = created.eventId;

  // Guarda siempre en el contexto original, aunque cambie la sesión.
  await writeEventMap(context, map);

  return true;
}

async function upsertWithRetry(
  context: CalendarContext,
  accessToken: string,
  activityId: string
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ok = await upsertCurrentActivity(
        context,
        accessToken,
        activityId
      );

      if (ok) return true;
    } catch (error) {
      const code = errorCode(error);

      if (code === "not_connected" || code === "session_changed") {
        throw error;
      }
    }

    if (attempt === 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, RETRY_DELAY_MS);
      });
    }
  }

  return false;
}

async function flushForContext(context: CalendarContext) {
  await assertContext(context);

  const token = await readGoogleToken(context);
  if (!token) throw makeNotConnectedError();

  const queue = await readQueue(context);
  const remaining: QueuedCalendarItem[] = [];

  for (let index = 0; index < queue.length; index++) {
    const item = queue[index];

    try {
      const ok = await upsertWithRetry(
        context,
        token.accessToken,
        item.activityId
      );

      if (!ok) remaining.push(item);
    } catch (error) {
      // Conserva los pendientes en su usuario/workspace original.
      remaining.push(...queue.slice(index));
      await writeQueue(context, remaining);
      throw error;
    }
  }

  await writeQueue(context, remaining);
}

// ===============================
// API pública de envío
// ===============================

export async function flushCalendarQueue() {
  const context = await requireContext();

  return serial(() => flushForContext(context));
}

export async function createCalendarEventFromActivity(
  activity: CalendarActivityPayload
) {
  if (!activity.id?.trim()) return;

  const context = await requireContext();

  return serial(async () => {
    await assertContext(context);

    // Guardar primero permite reintentar si falla la conexión.
    await enqueue(context, activity.id);

    const token = await readGoogleToken(context);
    if (!token) return;

    try {
      await flushForContext(context);
    } catch (error) {
      if (errorCode(error) === "not_connected") return;
      throw error;
    }
  });
}

export async function deleteCalendarEventForActivity(
  activityId: string
) {
  if (!activityId?.trim()) return;

  const context = await requireContext();

  return serial(async () => {
    await assertContext(context);

    // Evita que una entrada pendiente vuelva a crear el evento.
    const queue = await readQueue(context);
    await writeQueue(
      context,
      queue.filter((item) => item.activityId !== activityId)
    );

    const token = await readGoogleToken(context);
    if (!token) return;

    const map = await readEventMap(context);
    const eventId = map[activityId];
    if (!eventId) return;

    const result = await googleRequest(
      context,
      token.accessToken,
      "DELETE",
      eventId
    );

    // Conserva el mapa si Google no confirmó el borrado.
    if (result.ok || result.notFound) {
      delete map[activityId];
      await writeEventMap(context, map);
    }
  });
}