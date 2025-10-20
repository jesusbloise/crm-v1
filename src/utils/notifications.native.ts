// src/utils/notifications.native.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const STORAGE_KEY = "activity.notifications.map";
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:4000";

/** Empuja al futuro (ahora + 10s) y redondea al segundo */
function normalizeFutureDate(when: Date, minLeadMs = 10_000): Date {
  const now = Date.now();
  const target = when.getTime();
  const min = now + minLeadMs;
  const normalized = target < min ? min : target;
  return new Date(Math.ceil(normalized / 1000) * 1000);
}

// Mostrar notificaciones en foreground (SDK 54 con flags iOS extra)
Notifications.setNotificationHandler({
  handleNotification: async (): Promise<Notifications.NotificationBehavior> => ({
    shouldShowAlert: true,
    shouldSetBadge: true,
    shouldPlaySound: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function initNotifications() {
  // Permisos
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    await Notifications.requestPermissionsAsync();
  }

  // Canal Android: usa "default" para que no tengamos que pasar channelId
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Recordatorios",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    // (Opcional) si quieres mantener un canal nombrado también:
    await Notifications.setNotificationChannelAsync("activities", {
      name: "Recordatorios de actividades",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

async function loadMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
async function saveMap(m: Record<string, string>) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(m));
}

/** (Opcional) Registrar token push del dispositivo en tu backend */
export async function registerDevicePushToken(userId: string) {
  await initNotifications();
  const devicePushToken = await Notifications.getExpoPushTokenAsync();
  const token = devicePushToken.data;
  try {
    await fetch(`${API_BASE}/api/push/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, token, platform: Platform.OS }),
    });
  } catch {
    // silencioso
  }
}

/** Para <60s usa timeInterval; para >=60s usa date. SIN channelId en trigger */
function buildSmartTrigger(
  effectiveWhen: Date
): Notifications.DateTriggerInput | Notifications.TimeIntervalTriggerInput {
  const diffSec = Math.max(1, Math.ceil((effectiveWhen.getTime() - Date.now()) / 1000));
  if (diffSec < 60) {
    return {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(diffSec, 10),
      repeats: false,
    } as Notifications.TimeIntervalTriggerInput;
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: effectiveWhen,
  } as Notifications.DateTriggerInput;
}

/** Programa local en el dispositivo y guarda el id en AsyncStorage */
export async function scheduleActivityReminder(opts: {
  activityId: string;
  title: string;
  body?: string;
  when: Date;
}) {
  await initNotifications();

  const effectiveWhen = normalizeFutureDate(opts.when, 10_000);
  const trigger = buildSmartTrigger(effectiveWhen);

  console.log("🔔 scheduleActivityReminder");
  console.log("  activityId:", opts.activityId);
  console.log("  when (local):", effectiveWhen.toString());
  console.log("  when (ISO):", effectiveWhen.toISOString());
  console.log("  trigger.type:", trigger.type);

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: opts.title || "Actividad",
        body: opts.body || "Tienes una actividad pendiente",
        sound: "default",
      },
      trigger,
    });
    console.log("  ✅ scheduled id:", id);
    const map = await loadMap();
    map[opts.activityId] = id;
    await saveMap(map);
    return id;
  } catch (e) {
    console.log("  ❌ scheduling error:", e);
    throw e;
  }
}


export async function cancelActivityReminder(activityId: string) {
  const map = await loadMap();
  const notifId = map[activityId];
  if (notifId) {
    await Notifications.cancelScheduledNotificationAsync(notifId);
    delete map[activityId];
    await saveMap(map);
  }
}

export async function cancelAllActivityReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await saveMap({});
}

export async function syncPendingReminders(_userId: string) {
  // no-op por ahora
}
