// src/utils/notifications.web.ts

// Guardamos los timeouts para poder cancelar si hace falta
const timeouts = new Map<string, number>();

/** Empuja al futuro (ahora + 10s) para evitar errores */
function normalizeFutureDate(when: Date, minLeadMs = 10_000): Date {
  const now = Date.now();
  const target = when.getTime();
  const min = now + minLeadMs;
  return new Date(target < min ? min : target);
}

export async function initNotifications() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {}
  }
}

/** Placeholder: registra presencia web (si luego activas Web Push real) */
export async function registerDevicePushToken(_userId: string) {
  // Aquí irá tu registro real de Web Push (Service Worker + VAPID).
}

export async function scheduleActivityReminder(opts: {
  activityId: string;
  title: string;
  body?: string;
  when: Date;
}) {
  await initNotifications();

  const effectiveWhen = normalizeFutureDate(opts.when);
  const diff = effectiveWhen.getTime() - Date.now();

  const timeoutId = window.setTimeout(() => {
    showNow(opts.title, opts.body);
    timeouts.delete(opts.activityId);
  }, diff);

  // guarda para poder cancelar luego
  timeouts.set(opts.activityId, timeoutId);
  return `web-${timeoutId}`;
}

function showNow(title: string, body?: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title || "Actividad", { body: body || "Tienes una actividad pendiente" });
  }
}

export async function cancelActivityReminder(activityId: string) {
  const timeoutId = timeouts.get(activityId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeouts.delete(activityId);
  }
}

export async function cancelAllActivityReminders() {
  for (const id of timeouts.values()) clearTimeout(id);
  timeouts.clear();
}
