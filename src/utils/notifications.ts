// src/utils/notifications.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const ANDROID_CHANNEL_ID = "crm-reminders";
const STORAGE_PREFIX = "notif:";

type ScheduleParams = {
  activityId: string;
  title: string;
  body?: string;
  when: Date; // fecha/hora exactas en la zona del dispositivo
};

type StoredNotif = {
  notificationId: string;
  when: number; // epoch ms
};

const keyFor = (activityId: string) => `${STORAGE_PREFIX}${activityId}`;

// --- Compat: handler sin dramas de tipos entre SDKs ---
const BEHAVIOR: any = {
  shouldShowAlert: true,
  shouldPlaySound: true,
  shouldSetBadge: false,
};

// Algunos SDKs tipan distinto NotificationHandler/Behavior.
// Casteamos a any para evitar el error de TS, el runtime es correcto.
(Notifications as any).setNotificationHandler({
  handleNotification: async () => BEHAVIOR,
} as any);


/** Pide permisos y crea canal Android con sonido/vibración. */
export async function initNotifications() {
  try {
    if (Platform.OS === "web") {
      alert("✅ Notificaciones habilitadas (simuladas en WEB)");
      return;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: "Recordatorios CRM",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.NOTIFICATION_EVENT,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      });
    }
  } catch (err) {
    console.warn("initNotifications error:", err);
  }
}

/** Normaliza un trigger por fecha para cualquier SDK (cast final). */
function makeDateTrigger(when: Date) {
  if (Platform.OS === "android") {
    // En algunos SDKs se usa { date, channelId }, en otros { type: DATE, date, channelId }
    return ({ date: when, channelId: ANDROID_CHANNEL_ID } as any) as Notifications.NotificationTriggerInput;
  }
  return ({ date: when } as any) as Notifications.NotificationTriggerInput;
}

/**
 * Programa una notificación local a fecha/hora exactas con alerta+sonido.
 * Devuelve el notificationId y lo persiste asociado a activityId.
 */
export async function scheduleActivityReminder({
  activityId,
  title,
  body,
  when,
}: ScheduleParams) {
  try {
    if (Platform.OS === "web") {
      const diff = Math.max(1000, when.getTime() - Date.now());
      setTimeout(() => alert(`🚨 Recordatorio (WEB)\n\n${title}\n\n${body ?? ""}`), diff);
      return `web-alert-${activityId}`;
    }

    // Si ya existía uno, cancélalo (reprogramación)
    await cancelActivityReminder(activityId);

    // Evitar programar en pasado
    const now = Date.now();
    let whenDate = new Date(when);
    if (whenDate.getTime() <= now) {
      whenDate = new Date(now + 60_000); // +1 min
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: Platform.OS === "ios" ? true : undefined,
        data: { activityId, type: "activity-reminder" },
      },
      trigger: makeDateTrigger(whenDate), // 👈 cast interno anti-rojos
    });

    const stored: StoredNotif = { notificationId, when: whenDate.getTime() };
    await AsyncStorage.setItem(keyFor(activityId), JSON.stringify(stored));
    return notificationId;
  } catch (err) {
    console.warn("scheduleActivityReminder error:", err);
    return null;
  }
}

/** Cancela la notificación programada (si existe) para una actividad. */
export async function cancelActivityReminder(activityId: string) {
  try {
    const raw = await AsyncStorage.getItem(keyFor(activityId));
    if (raw) {
      const parsed: StoredNotif = JSON.parse(raw);
      if (parsed?.notificationId) {
        await Notifications.cancelScheduledNotificationAsync(parsed.notificationId);
      }
      await AsyncStorage.removeItem(keyFor(activityId));
    }
  } catch (err) {
    console.warn("cancelActivityReminder error:", err);
  }
}

/** Cancela todas las notificaciones programadas por este módulo. */
export async function cancelAllActivityReminders() {
  try {
    if (Platform.OS === "web") return;
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
    const rawList = await AsyncStorage.multiGet(ours);
    const ids: string[] = [];
    for (const [, raw] of rawList) {
      if (!raw) continue;
      try {
        const parsed: StoredNotif = JSON.parse(raw);
        if (parsed?.notificationId) ids.push(parsed.notificationId);
      } catch {}
    }
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    await AsyncStorage.multiRemove(ours);
  } catch (err) {
    console.warn("cancelAllActivityReminders error:", err);
  }
}

/** Reprograma (cancela + programa de nuevo) a una nueva fecha/hora. */
export async function rescheduleActivityReminder(params: ScheduleParams) {
  await cancelActivityReminder(params.activityId);
  return scheduleActivityReminder(params);
}

/**
 * (Opcional) Re-asegura notificaciones al abrir la app.
 * Pásale un fetcher que devuelva actividades "open" con remindAtMs futuro.
 */
export async function reensurePendingReminders(
  getOpenActivities: () => Promise<
    Array<{ id: string; title: string; notes?: string | null; remindAtMs?: number | null }>
  >
) {
  try {
    if (Platform.OS === "web") return;
    const items = await getOpenActivities();
    const now = Date.now();

    for (const it of items) {
      if (!it.remindAtMs || it.remindAtMs <= now) continue;

      const raw = await AsyncStorage.getItem(keyFor(it.id));
      if (raw) continue; // ya programada

      await scheduleActivityReminder({
        activityId: it.id,
        title: it.title || "Actividad pendiente",
        body: it.notes || "Tienes una actividad pendiente",
        when: new Date(it.remindAtMs),
      });
    }
  } catch (err) {
    console.warn("reensurePendingReminders error:", err);
  }
}

/** DEBUG: programa una notificación que suena en X segundos (nativo) */
export async function debugNotifyIn(seconds: number = 10) {
  if (Platform.OS === "web") {
    alert(`(WEB) Simulando notificación en ${seconds}s`);
    setTimeout(() => alert("🚨 (WEB) Debug notify"), seconds * 1000);
    return;
  }
  await initNotifications();
  const when = new Date(Date.now() + Math.max(3000, seconds * 1000));

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🔔 Debug notification",
      body: `Deberías ver/oir esto en ~${seconds}s`,
      sound: Platform.OS === "ios" ? true : undefined,
      data: { kind: "debug" },
    },
    trigger: makeDateTrigger(when), // 👈 mismo helper
  });
}



// import { Alert, Platform } from "react-native";

// /**
//  * ⚡ Versión de diagnóstico
//  * - Muestra alertas inmediatas al llamar scheduleActivityReminder()
//  * - Loguea en consola y crea un timeout que también dispara alerta
//  */

// export async function initNotifications() {
//   console.log("🟢 initNotifications llamada correctamente");
//   if (Platform.OS === "web") {
//     window.alert("✅ initNotifications ejecutada (WEB)");
//   } else {
//     Alert.alert("✅ initNotifications ejecutada (MÓVIL)");
//   }
// }

// export async function scheduleActivityReminder(opts: {
//   activityId: string;
//   title: string;
//   body?: string;
//   when: Date;
// }) {
//   const { activityId, title, body, when } = opts;

//   console.log("📅 scheduleActivityReminder ejecutado con:", {
//     activityId,
//     title,
//     body,
//     when: when.toISOString(),
//   });

//   const diff = Math.max(1000, when.getTime() - Date.now());

//   // 🔥 Muestra alerta inmediata para confirmar que la función se llama
//   if (Platform.OS === "web") {
//     window.alert(`🔔 Programando recordatorio (WEB)\n\n${title}\n\nen ${Math.round(
//       diff / 1000
//     )} segundos`);
//   } else {
//     Alert.alert(
//       "🔔 Programando recordatorio (MÓVIL)",
//       `${title}\n\nEn ${Math.round(diff / 1000)} segundos`,
//       [{ text: "OK" }]
//     );
//   }

//   // ⏱️ Luego de diff milisegundos muestra el recordatorio real
//   setTimeout(() => {
//     console.log("🚨 Recordatorio disparado:", title);
//     if (Platform.OS === "web") {
//       window.alert(`🚨 Recordatorio (WEB)\n\n${title}\n\n${body ?? ""}`);
//     } else {
//       Alert.alert("🚨 Recordatorio", `${title}\n\n${body ?? ""}`, [{ text: "OK" }]);
//     }
//   }, diff);

//   return `alert-${activityId}`;
// }

// export async function cancelActivityReminder(activityId: string) {
//   console.log("🛑 Cancelar recordatorio simulado:", activityId);
// }

// export async function cancelAllActivityReminders() {
//   console.log("🛑 Cancelar todos los recordatorios simulados");
// }
