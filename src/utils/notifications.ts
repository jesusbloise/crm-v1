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

(Notifications as any).setNotificationHandler({
  handleNotification: async () => BEHAVIOR,
} as any);

/**
 * 🔔 Callback opcional para mostrar un toast bonito en WEB.
 * La registramos desde React (NewActivity) y si no existe usamos alert().
 */
let toastCallback:
  | ((title: string, message: string) => void)
  | null = null;

export function registerToast(
  cb: (title: string, message: string) => void
) {
  toastCallback = cb;
}

function showWebToast(title: string, message: string) {
  if (toastCallback) {
    toastCallback(title, message);
  } else {
    // fallback simple si por alguna razón no se registró el toast
    alert(`${title}\n\n${message}`);
  }
}

/** Pide permisos y crea canal Android con sonido/vibración. */
export async function initNotifications() {
  try {
    if (Platform.OS === "web") {
      // En web no hay permisos nativos, solo simulación
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
    return ({
      date: when,
      channelId: ANDROID_CHANNEL_ID,
    } as any) as Notifications.NotificationTriggerInput;
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
      // Simulación en Web usando toast centrado
      const diff = Math.max(1000, when.getTime() - Date.now());
      setTimeout(() => {
        showWebToast(
          "Recordatorio",
          `${title}\n\n${body ?? ""}`
        );
      }, diff);
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
      trigger: makeDateTrigger(whenDate),
    });

    const stored: StoredNotif = {
      notificationId,
      when: whenDate.getTime(),
    };
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
        await Notifications.cancelScheduledNotificationAsync(
          parsed.notificationId
        );
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
    await Promise.all(
      ids.map((id) =>
        Notifications.cancelScheduledNotificationAsync(id)
      )
    );
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
    Array<{
      id: string;
      title: string;
      notes?: string | null;
      remindAtMs?: number | null;
    }>
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
    showWebToast(
      "Debug (WEB)",
      `Simulando notificación en ${seconds}s`
    );
    setTimeout(() => {
      showWebToast("Debug (WEB)", "Notificación de prueba");
    }, seconds * 1000);
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
    trigger: makeDateTrigger(when),
  });
}


// import AsyncStorage from "@react-native-async-storage/async-storage";
// import * as Notifications from "expo-notifications";
// import { Platform } from "react-native";

// const ANDROID_CHANNEL_ID = "crm-reminders";
// const STORAGE_PREFIX = "notif:";

// type ScheduleParams = {
//   activityId: string;
//   title: string;
//   body?: string;
//   when: Date; // fecha/hora exactas en la zona del dispositivo
// };

// type StoredNotif = {
//   notificationId: string;
//   when: number; // epoch ms
// };

// const keyFor = (activityId: string) => `${STORAGE_PREFIX}${activityId}`;

// // --- Compat: handler sin dramas de tipos entre SDKs ---
// const BEHAVIOR: any = {
//   shouldShowAlert: true,
//   shouldPlaySound: true,
//   shouldSetBadge: false,
// };

// // Algunos SDKs tipan distinto NotificationHandler/Behavior.
// // Casteamos a any para evitar el error de TS, el runtime es correcto.
// (Notifications as any).setNotificationHandler({
//   handleNotification: async () => BEHAVIOR,
// } as any);

// // 🔔 Callback global para mostrar un toast visual (Modal centrado)
// export let showLocalToast: null | ((t: string, m: string) => void) = null;

// export function registerToast(fn: (t: string, m: string) => void) {
//   showLocalToast = fn;
// }

// /** Pide permisos y crea canal Android con sonido/vibración. */
// export async function initNotifications() {
//   try {
//     if (Platform.OS === "web") {
//       // En web solo simulamos con toast/alert, no pedimos permisos reales
//       return;
//     }

//     const { status } = await Notifications.requestPermissionsAsync();
//     if (status !== "granted") return;

//     if (Platform.OS === "android") {
//       await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
//         name: "Recordatorios CRM",
//         importance: Notifications.AndroidImportance.MAX,
//         sound: "default",
//         vibrationPattern: [0, 250, 250, 250],
//         lockscreenVisibility:
//           Notifications.AndroidNotificationVisibility.PUBLIC,
//         bypassDnd: true,
//         enableVibrate: true,
//         enableLights: true,
//         showBadge: true,
//         audioAttributes: {
//           usage: Notifications.AndroidAudioUsage.NOTIFICATION_EVENT,
//           contentType:
//             Notifications.AndroidAudioContentType.SONIFICATION,
//         },
//       });
//     }
//   } catch (err) {
//     console.warn("initNotifications error:", err);
//   }
// }

// /** Normaliza un trigger por fecha para cualquier SDK (cast final). */
// function makeDateTrigger(when: Date) {
//   if (Platform.OS === "android") {
//     // En algunos SDKs se usa { date, channelId }, en otros { type: DATE, date, channelId }
//     return {
//       date: when,
//       channelId: ANDROID_CHANNEL_ID,
//     } as any as Notifications.NotificationTriggerInput;
//   }
//   return { date: when } as any as Notifications.NotificationTriggerInput;
// }

// /**
//  * Programa una notificación local a fecha/hora exactas con alerta+sonido.
//  * Devuelve el notificationId y lo persiste asociado a activityId.
//  */
// export async function scheduleActivityReminder({
//   activityId,
//   title,
//   body,
//   when,
// }: ScheduleParams) {
//   try {
//     // 🌐 WEB → siempre simulamos con toast/alert
//     if (Platform.OS === "web") {
//       const diff = Math.max(1000, when.getTime() - Date.now());
//       setTimeout(() => {
//         const mensaje = body ?? "";
//         if (showLocalToast) {
//           showLocalToast("Recordatorio", `${title}\n${mensaje}`);
//         } else {
//           alert(`Recordatorio (WEB)\n\n${title}\n\n${mensaje}`);
//         }
//       }, diff);

//       return `web-alert-${activityId}`;
//     }

//     // Nativo: aseguramos permisos/canales
//     await initNotifications();

//     // Algunos entornos (Expo Go / emu) no soportan notificaciones reales
//     const isAvailableFn = (Notifications as any).isAvailableAsync;
//     if (typeof isAvailableFn === "function") {
//       const isAvailable = await isAvailableFn();
//       if (!isAvailable) {
//         const mensaje =
//           "Este entorno (Expo Go / emulador) no permite notificaciones reales. " +
//           "Prueba con un build nativo para activar los recordatorios del sistema.";
//         if (showLocalToast) {
//           showLocalToast("Notificaciones no soportadas", mensaje);
//         } else {
//           alert(mensaje);
//         }
//         return null;
//       }
//     }

//     // Si ya existía uno, cancélalo (reprogramación)
//     await cancelActivityReminder(activityId);

//     // Evitar programar en pasado
//     const now = Date.now();
//     let whenDate = new Date(when);
//     if (whenDate.getTime() <= now) {
//       whenDate = new Date(now + 60_000); // +1 min
//     }

//     const notificationId =
//       await Notifications.scheduleNotificationAsync({
//         content: {
//           title,
//           body,
//           sound: Platform.OS === "ios" ? true : undefined,
//           data: { activityId, type: "activity-reminder" },
//         },
//         trigger: makeDateTrigger(whenDate), // 👈 cast interno anti-rojos
//       });

//     const stored: StoredNotif = {
//       notificationId,
//       when: whenDate.getTime(),
//     };
//     await AsyncStorage.setItem(keyFor(activityId), JSON.stringify(stored));
//     return notificationId;
//   } catch (err) {
//     console.warn("scheduleActivityReminder error:", err);
//     return null;
//   }
// }

// /** Cancela la notificación programada (si existe) para una actividad. */
// export async function cancelActivityReminder(activityId: string) {
//   try {
//     const raw = await AsyncStorage.getItem(keyFor(activityId));
//     if (raw) {
//       const parsed: StoredNotif = JSON.parse(raw);
//       if (parsed?.notificationId) {
//         await Notifications.cancelScheduledNotificationAsync(
//           parsed.notificationId
//         );
//       }
//       await AsyncStorage.removeItem(keyFor(activityId));
//     }
//   } catch (err) {
//     console.warn("cancelActivityReminder error:", err);
//   }
// }

// /** Cancela todas las notificaciones programadas por este módulo. */
// export async function cancelAllActivityReminders() {
//   try {
//     if (Platform.OS === "web") return;
//     const keys = await AsyncStorage.getAllKeys();
//     const ours = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
//     const rawList = await AsyncStorage.multiGet(ours);
//     const ids: string[] = [];
//     for (const [, raw] of rawList) {
//       if (!raw) continue;
//       try {
//         const parsed: StoredNotif = JSON.parse(raw);
//         if (parsed?.notificationId) ids.push(parsed.notificationId);
//       } catch {}
//     }
//     await Promise.all(
//       ids.map((id) =>
//         Notifications.cancelScheduledNotificationAsync(id)
//       )
//     );
//     await AsyncStorage.multiRemove(ours);
//   } catch (err) {
//     console.warn("cancelAllActivityReminders error:", err);
//   }
// }

// /** Reprograma (cancela + programa de nuevo) a una nueva fecha/hora. */
// export async function rescheduleActivityReminder(
//   params: ScheduleParams
// ) {
//   await cancelActivityReminder(params.activityId);
//   return scheduleActivityReminder(params);
// }

// /**
//  * (Opcional) Re-asegura notificaciones al abrir la app.
//  * Pásale un fetcher que devuelva actividades "open" con remindAtMs futuro.
//  */
// export async function reensurePendingReminders(
//   getOpenActivities: () => Promise<
//     Array<{
//       id: string;
//       title: string;
//       notes?: string | null;
//       remindAtMs?: number | null;
//     }>
//   >
// ) {
//   try {
//     if (Platform.OS === "web") return;
//     const items = await getOpenActivities();
//     const now = Date.now();

//     for (const it of items) {
//       if (!it.remindAtMs || it.remindAtMs <= now) continue;

//       const raw = await AsyncStorage.getItem(keyFor(it.id));
//       if (raw) continue; // ya programada

//       await scheduleActivityReminder({
//         activityId: it.id,
//         title: it.title || "Actividad pendiente",
//         body: it.notes || "Tienes una actividad pendiente",
//         when: new Date(it.remindAtMs),
//       });
//     }
//   } catch (err) {
//     console.warn("reensurePendingReminders error:", err);
//   }
// }

// /** DEBUG: programa una notificación que suena en X segundos (nativo) */
// export async function debugNotifyIn(seconds: number = 10) {
//   if (Platform.OS === "web") {
//     if (showLocalToast) {
//       showLocalToast(
//         "Debug notificación",
//         `Simulando notificación en ${seconds} segundos`
//       );
//     } else {
//       alert(`(WEB) Simulando notificación en ${seconds}s`);
//     }
//     setTimeout(() => {
//       if (showLocalToast) {
//         showLocalToast("Debug notificación", "🚨 (WEB) Debug notify");
//       } else {
//         alert("🚨 (WEB) Debug notify");
//       }
//     }, seconds * 1000);
//     return;
//   }

//   await initNotifications();
//   const when = new Date(Date.now() + Math.max(3000, seconds * 1000));

//   await Notifications.scheduleNotificationAsync({
//     content: {
//       title: "🔔 Debug notification",
//       body: `Deberías ver/oir esto en ~${seconds}s`,
//       sound: Platform.OS === "ios" ? true : undefined,
//       data: { kind: "debug" },
//     },
//     trigger: makeDateTrigger(when),
//   });
// }

