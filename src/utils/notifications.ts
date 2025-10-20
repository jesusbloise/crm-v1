import { Alert, Platform } from "react-native";

/**
 * ⚡ Versión de diagnóstico
 * - Muestra alertas inmediatas al llamar scheduleActivityReminder()
 * - Loguea en consola y crea un timeout que también dispara alerta
 */

export async function initNotifications() {
  console.log("🟢 initNotifications llamada correctamente");
  if (Platform.OS === "web") {
    window.alert("✅ initNotifications ejecutada (WEB)");
  } else {
    Alert.alert("✅ initNotifications ejecutada (MÓVIL)");
  }
}

export async function scheduleActivityReminder(opts: {
  activityId: string;
  title: string;
  body?: string;
  when: Date;
}) {
  const { activityId, title, body, when } = opts;

  console.log("📅 scheduleActivityReminder ejecutado con:", {
    activityId,
    title,
    body,
    when: when.toISOString(),
  });

  const diff = Math.max(1000, when.getTime() - Date.now());

  // 🔥 Muestra alerta inmediata para confirmar que la función se llama
  if (Platform.OS === "web") {
    window.alert(`🔔 Programando recordatorio (WEB)\n\n${title}\n\nen ${Math.round(
      diff / 1000
    )} segundos`);
  } else {
    Alert.alert(
      "🔔 Programando recordatorio (MÓVIL)",
      `${title}\n\nEn ${Math.round(diff / 1000)} segundos`,
      [{ text: "OK" }]
    );
  }

  // ⏱️ Luego de diff milisegundos muestra el recordatorio real
  setTimeout(() => {
    console.log("🚨 Recordatorio disparado:", title);
    if (Platform.OS === "web") {
      window.alert(`🚨 Recordatorio (WEB)\n\n${title}\n\n${body ?? ""}`);
    } else {
      Alert.alert("🚨 Recordatorio", `${title}\n\n${body ?? ""}`, [{ text: "OK" }]);
    }
  }, diff);

  return `alert-${activityId}`;
}

export async function cancelActivityReminder(activityId: string) {
  console.log("🛑 Cancelar recordatorio simulado:", activityId);
}

export async function cancelAllActivityReminders() {
  console.log("🛑 Cancelar todos los recordatorios simulados");
}

// import { Platform } from "react-native";

// export type ScheduleOpts = {
//   activityId: string;
//   title: string;
//   body?: string;
//   when: Date;
// };

// interface NotifAPI {
//   initNotifications(): Promise<void>;
//   scheduleActivityReminder(opts: ScheduleOpts): Promise<string>;
//   cancelActivityReminder(activityId: string): Promise<void>;
//   cancelAllActivityReminders(): Promise<void>;
//   // opcional: sync de pendientes en móvil (no-op en web)
//   syncPendingReminders?(userId: string): Promise<void>;
// }

// // Elegimos la implementación correcta sin importar expo-notifications en web
// const impl: NotifAPI =
//   Platform.OS === "web"
//     ? // web: no usa APIs nativas
//       // eslint-disable-next-line @typescript-eslint/no-var-requires
//       require("./notifications.web")
//     : // nativo (iOS/Android): usa expo-notifications
//       // eslint-disable-next-line @typescript-eslint/no-var-requires
//       require("./notifications.native");

// export const {
//   initNotifications,
//   scheduleActivityReminder,
//   cancelActivityReminder,
//   cancelAllActivityReminders,
//   // @ts-ignore (solo existe en nativo)
//   syncPendingReminders,
// } = impl as NotifAPI;
