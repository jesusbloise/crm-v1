// src/utils/notifications.native.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

const STORAGE_KEY = "activity.notifications.map";
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:4000";

/** Detecta si podemos usar expo-notifications en este runtime */
export const notificationsSupported =
  Platform.OS !== "web" && Constants.appOwnership !== "expo";

/** Importa expo-notifications de forma segura (dinámica) */
async function loadExpoNotifications() {
  if (!notificationsSupported) return null;
  // Import dinámico: evita que Metro evalue el módulo en Expo Go
  const mod = await import("expo-notifications");
  return mod;
}

/** Empuja al futuro (ahora + 10s) y redondea al segundo */
function normalizeFutureDate(when: Date, minLeadMs = 10_000): Date {
  const now = Date.now();
  const target = when.getTime();
  const min = now + minLeadMs;
  const normalized = target < min ? min : target;
  return new Date(Math.ceil(normalized / 1000) * 1000);
}

/** Mapa (activityId -> notificationId) */
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

/** Registra el handler una sola vez */
let handlersRegistered = false;

async function ensureHandlersRegistered() {
  const Notifications = await loadExpoNotifications();
  if (!Notifications) return null;

  if (!handlersRegistered) {
    // Tipos conservadores para evitar errores en TS
    Notifications.setNotificationHandler({
      handleNotification: async () =>
        ({
          shouldShowAlert: true,
          shouldSetBadge: true,
          shouldPlaySound: true,
        } as any), // <- evita que TS se queje si la SDK añade/quita props
    } as any);

    handlersRegistered = true;
  }
  return Notifications;
}


/** Inicializa permisos y canales (Android) */
export async function initNotifications() {
  const Notifications = await ensureHandlersRegistered();
  if (!Notifications) return { status: "unsupported" as const };

  // Permisos
  const { status: current } = await Notifications.getPermissionsAsync();
  if (current !== "granted") {
    await Notifications.requestPermissionsAsync();
  }

  // Canal Android "default"
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Recordatorios",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    // Opcional: canal adicional
    await Notifications.setNotificationChannelAsync("activities", {
      name: "Recordatorios de actividades",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  return { status };
}

/** (Opcional) Registrar token push del dispositivo en tu backend */
export async function registerDevicePushToken(userId: string) {
  const Notifications = await ensureHandlersRegistered();
  if (!Notifications) return;

  // En algunos entornos puede requerir projectId; aquí usamos la API simple
  const devicePushToken = await Notifications.getExpoPushTokenAsync();
  const token = devicePushToken?.data;
  if (!token) return;

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

/** Para <60s usa interval; para >=60s usa date. SIN channelId explícito */
function buildSmartTrigger(effectiveWhen: Date): any {
  const diffSec = Math.max(1, Math.ceil((effectiveWhen.getTime() - Date.now()) / 1000));
  if (diffSec < 60) {
    return {
      seconds: Math.max(diffSec, 10),
      repeats: false,
    };
  }
  return { date: effectiveWhen };
}

/** Programa notificación local y guarda el id en AsyncStorage */
export async function scheduleActivityReminder(opts: {
  activityId: string;
  title: string;
  body?: string;
  when: Date;
}) {
  const Notifications = await ensureHandlersRegistered();
  if (!Notifications) throw new Error("notifications_unsupported");

  const effectiveWhen = normalizeFutureDate(opts.when, 10_000);
  const trigger = buildSmartTrigger(effectiveWhen);

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: opts.title || "Actividad",
        body: opts.body || "Tienes una actividad pendiente",
        sound: "default",
      },
      trigger,
    });

    const map = await loadMap();
    map[opts.activityId] = id;
    await saveMap(map);
    return id;
  } catch (e) {
    // Re-lanzamos para que la UI pueda mostrar un error
    throw e;
  }
}

/** Cancela una notificación programada por activityId */
export async function cancelActivityReminder(activityId: string) {
  const Notifications = await loadExpoNotifications();
  if (!Notifications) return;

  const map = await loadMap();
  const notifId = map[activityId];
  if (notifId) {
    await Notifications.cancelScheduledNotificationAsync(notifId);
    delete map[activityId];
    await saveMap(map);
  }
}

/** Cancela todas las notificaciones locales de actividades */
export async function cancelAllActivityReminders() {
  const Notifications = await loadExpoNotifications();
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await saveMap({});
}

/** Placeholder para futura sincronización desde backend */
export async function syncPendingReminders(_userId: string) {
  // no-op por ahora
}
