// app/debug-notifs.tsx
import * as Notifications from "expo-notifications";
import * as React from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const ANDROID_CHANNEL_ID = "crm-reminders";

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


function makeDateTrigger(when: Date) {
  if (Platform.OS === "android") {
    return ({ date: when, channelId: ANDROID_CHANNEL_ID } as any) as Notifications.NotificationTriggerInput;
  }
  return ({ date: when } as any) as Notifications.NotificationTriggerInput;
}

export default function DebugNotifs() {
  const [log, setLog] = React.useState<string[]>([]);
  const push = (m: any) => {
    const s = typeof m === "string" ? m : JSON.stringify(m);
    console.log("[DEBUG]", s);
    setLog((L) => [new Date().toLocaleTimeString() + " " + s, ...L].slice(0, 200));
  };

  const askPerms = async () => {
    try {
      if (Platform.OS === "web") {
        alert("WEB no soporta notifs nativas; usaremos alerts.");
        push("WEB: no nativo");
        return;
      }
      const res = await Notifications.requestPermissionsAsync();
      push({ permissions: res });
      if (res.granted) Alert.alert("Permisos OK", JSON.stringify(res));
      else Alert.alert("Sin permisos", "Habilita notificaciones para la app en Ajustes.");
    } catch (e) {
      push(e);
    }
  };

  const ensureChannel = async () => {
    try {
      if (Platform.OS !== "android") { push("iOS: canal no aplica"); return; }
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: "Recordatorios CRM",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        showBadge: true,
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      push("Android: canal creado/ok");
      Alert.alert("Canal listo", ANDROID_CHANNEL_ID);
    } catch (e) { push(e); }
  };

  const scheduleIn10s = async () => {
    try {
      if (Platform.OS === "web") { alert("🚨 (WEB) 10s"); setTimeout(() => alert("🚨 (WEB) DEBUG"), 10000); return; }
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "🔔 Debug (10s)",
          body: "Deberías oír/ver esto en ~10s",
          sound: Platform.OS === "ios" ? true : undefined,
          data: { kind: "debug-10s" },
        },
        trigger: (Platform.OS === "android"
          ? ({ seconds: 10, channelId: ANDROID_CHANNEL_ID } as any)
          : ({ seconds: 10 } as any)) as Notifications.NotificationTriggerInput,
      });
      push({ scheduled10sId: id });
    } catch (e) { push(e); }
  };

  const scheduleIn1minDate = async () => {
    try {
      if (Platform.OS === "web") { alert("🚨 (WEB) 60s"); setTimeout(() => alert("🚨 (WEB) DEBUG"), 60000); return; }
      const when = new Date(Date.now() + 60_000);
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "📅 Debug (+1 min)",
          body: when.toLocaleString(),
          sound: Platform.OS === "ios" ? true : undefined,
          data: { kind: "debug-date" },
        },
        trigger: makeDateTrigger(when),
      });
      push({ scheduledDateId: id, when: when.toISOString() });
    } catch (e) { push(e); }
  };

  const listScheduled = async () => {
    try {
      const pending = await Notifications.getAllScheduledNotificationsAsync();
      push({ pending });
      Alert.alert("Programadas", JSON.stringify(pending, null, 2));
    } catch (e) { push(e); }
  };

  const cancelAll = async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      push("Canceladas todas");
    } catch (e) { push(e); }
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>Debug Notificaciones</Text>
      <View style={s.row}>
        <Btn label="1) Pedir permisos" onPress={askPerms} />
        <Btn label="2) Canal Android" onPress={ensureChannel} />
      </View>
      <View style={s.row}>
        <Btn label="3) En 10s (segundos)" onPress={scheduleIn10s} />
        <Btn label="4) En 1 min (fecha)" onPress={scheduleIn1minDate} />
      </View>
      <View style={s.row}>
        <Btn label="Ver programadas" onPress={listScheduled} />
        <Btn label="Cancelar todas" onPress={cancelAll} />
      </View>

      <Text style={s.subtitle}>Log</Text>
      <ScrollView style={s.logBox}>
        {log.map((l, i) => <Text key={i} style={s.logLine}>{l}</Text>)}
      </ScrollView>
    </View>
  );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0c10", padding: 16, gap: 12 },
  title: { color: "#fff", fontWeight: "900", fontSize: 18 },
  subtitle: { color: "#a9b0bd", fontWeight: "800", marginTop: 8 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btn: { backgroundColor: "#7c3aed", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  btnText: { color: "#fff", fontWeight: "900" },
  logBox: { flex: 1, marginTop: 8, borderWidth: 1, borderColor: "#272a33", borderRadius: 12, padding: 8 },
  logLine: { color: "#e8ecf1", fontSize: 12, marginBottom: 4 },
});
