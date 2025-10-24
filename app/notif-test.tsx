// app/notif-test.tsx
import * as Notifications from "expo-notifications";
import * as React from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const ANDROID_CHANNEL_ID = "crm-reminders-test";

// ⚙️ handler compatible con cualquier SDK (sin drama de tipos)
(Notifications as any).setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
} as any);

function makeDateTrigger(date: Date) {
  if (Platform.OS === "android") {
    return ({ date, channelId: ANDROID_CHANNEL_ID } as any) as Notifications.NotificationTriggerInput;
  }
  return ({ date } as any) as Notifications.NotificationTriggerInput;
}

export default function NotifTest() {
  const [log, setLog] = React.useState<string[]>([]);
  const push = (m: any) => {
    const s = typeof m === "string" ? m : JSON.stringify(m);
    console.log("[notif-test]", s);
    setLog((L) => [new Date().toLocaleTimeString() + " " + s, ...L].slice(0, 200));
  };

  React.useEffect(() => {
    (async () => {
      // 🔐 permisos
      if (Platform.OS !== "web") {
        const perm = await Notifications.requestPermissionsAsync().catch((e) => {
          push(e);
          return { granted: false } as any;
        });
        push({ permissions: perm });
        if (!perm?.granted) {
          Alert.alert("Permisos", "Activa las notificaciones para esta app en Ajustes del sistema");
        }
      }

      // 📣 canal android
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
          name: "CRM Test",
          importance: Notifications.AndroidImportance.MAX,
          sound: "default",
          vibrationPattern: [0, 200, 200, 200],
          enableVibrate: true,
          showBadge: true,
          bypassDnd: true,
        }).catch(push);
        push("Android: canal OK");
      }
    })();
  }, []);

  const ping = () => {
    push("PING onPress");
    if (Platform.OS === "web") {
      alert("✅ PING (WEB) — el botón SÍ dispara");
    } else {
      Alert.alert("✅ PING", "El botón SÍ dispara");
    }
  };

  const in10s = async () => {
    push("programar en 10s");
    if (Platform.OS === "web") {
      alert("⏱️ (WEB) simulando en 10s");
      setTimeout(() => alert("🚨 (WEB) 10s"), 10_000);
      return;
    }
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔔 Debug (10s)",
        body: "Deberías ver/oir esto en ~10s",
        sound: Platform.OS === "ios" ? true : undefined,
        data: { kind: "debug-10s" },
      },
      trigger:
        Platform.OS === "android"
          ? (({ seconds: 10, channelId: ANDROID_CHANNEL_ID } as any) as Notifications.NotificationTriggerInput)
          : (({ seconds: 10 } as any) as Notifications.NotificationTriggerInput),
    }).catch((e) => {
      push(e);
      return null;
    });
    push({ scheduled10sId: id });
  };

  const in1minDate = async () => {
    const when = new Date(Date.now() + 60_000);
    push({ programar_fecha: when.toISOString() });

    if (Platform.OS === "web") {
      alert("⏱️ (WEB) simulando en ~60s");
      setTimeout(() => alert("🚨 (WEB) +1min"), 60_000);
      return;
    }
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "📅 Debug (+1 min)",
        body: when.toLocaleString(),
        sound: Platform.OS === "ios" ? true : undefined,
        data: { kind: "debug-date" },
      },
      trigger: makeDateTrigger(when),
    }).catch((e) => {
      push(e);
      return null;
    });
    push({ scheduledDateId: id });
  };

  const list = async () => {
    const pending = await Notifications.getAllScheduledNotificationsAsync().catch((e) => {
      push(e);
      return [];
    });
    push({ pending });
    Alert.alert("Programadas", JSON.stringify(pending, null, 2));
  };

  const cancelAll = async () => {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(push);
    push("Canceladas todas");
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>Notif Test</Text>

      <View style={s.row}>
        <Btn label="PING (debe mostrar alerta ya)" onPress={ping} />
      </View>

      <View style={s.row}>
        <Btn label="En 10s" onPress={in10s} />
        <Btn label="+1 min (fecha exacta)" onPress={in1minDate} />
      </View>

      <View style={s.row}>
        <Btn label="Ver programadas" onPress={list} />
        <Btn label="Cancelar todas" onPress={cancelAll} />
      </View>

      <Text style={s.subtitle}>Log</Text>
      <ScrollView style={s.logBox}>
        {log.map((l, i) => (
          <Text key={i} style={s.logLine}>
            {l}
          </Text>
        ))}
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
  logBox: {
    flex: 1,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#272a33",
    borderRadius: 12,
    padding: 8,
  },
  logLine: { color: "#e8ecf1", fontSize: 12, marginBottom: 4 },
});
