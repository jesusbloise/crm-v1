// import {
//     cancelAllActivityReminders,
//     initNotifications,
//     scheduleActivityReminder,
// } from "@/src/utils/notifications";
// import * as Notifications from "expo-notifications";
// import React, { useEffect } from "react";
// import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text } from "react-native";

// export default function NotificationsTester() {
//   useEffect(() => {
//     // 1) Solicita permisos y crea canal Android
//     initNotifications().catch(() => {});

//     // 2) Listeners para ver si la app recibe algo (foreground/background)
//     const sub1 = Notifications.addNotificationReceivedListener((n) => {
//       console.log("📥 RECEIVED (foreground):", JSON.stringify(n, null, 2));
//     });
//     const sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
//       console.log("📬 RESPONSE (tapped):", JSON.stringify(r, null, 2));
//     });
//     return () => { sub1.remove(); sub2.remove(); };
//   }, []);

//   const showNow = async () => {
//     // 👇 debe aparecer inmediatamente si los permisos están bien
//     await Notifications.presentNotificationAsync({
//       content: {
//         title: "Prueba inmediata",
//         body: "Si ves esto, permisos y handler están OK",
//         sound: "default",
//       },
//     });
//   };

//   const schedule10s = async () => {
//     const when = new Date(Date.now() + 10_000);
//     const id = await scheduleActivityReminder({
//       activityId: "test-10s",
//       title: "Test 10s",
//       body: "Deberías ver esto en ~10s",
//       when,
//     });
//     Alert.alert("Programado", `ID: ${id}`);
//   };

//   const schedule65s = async () => {
//     const when = new Date(Date.now() + 65_000);
//     const id = await scheduleActivityReminder({
//       activityId: "test-65s",
//       title: "Test 65s",
//       body: "Deberías ver esto en ~65s",
//       when,
//     });
//     Alert.alert("Programado", `ID: ${id}`);
//   };

//   const listScheduled = async () => {
//     if (Platform.OS === "web") {
//       Alert.alert("Info", "En web no hay API para listar; la prueba es visual.");
//       return;
//     }
//     const items = await Notifications.getAllScheduledNotificationsAsync();
//     console.log("📅 PROGRAMADAS:", JSON.stringify(items, null, 2));
//     Alert.alert("Programadas (ver consola)", `${items.length} item(s)`);
//   };

//   const cancelAll = async () => {
//     await cancelAllActivityReminders();
//     Alert.alert("Listo", "Todas canceladas");
//   };

//   return (
//     <ScrollView contentContainerStyle={styles.c}>
//       <Text style={styles.h1}>Notifications Tester</Text>

//       <Pressable style={styles.btn} onPress={showNow}>
//         <Text style={styles.btnText}>Mostrar ahora</Text>
//       </Pressable>

//       <Pressable style={styles.btn} onPress={schedule10s}>
//         <Text style={styles.btnText}>Programar en 10s</Text>
//       </Pressable>

//       <Pressable style={styles.btn} onPress={schedule65s}>
//         <Text style={styles.btnText}>Programar en 65s</Text>
//       </Pressable>

//       <Pressable style={styles.btn} onPress={listScheduled}>
//         <Text style={styles.btnText}>Listar programadas (nativo)</Text>
//       </Pressable>

//       <Pressable style={[styles.btn, styles.danger]} onPress={cancelAll}>
//         <Text style={styles.btnText}>Cancelar todas</Text>
//       </Pressable>

//       <Text style={styles.note}>
//         • Primero pulsa “Mostrar ahora”. Si aparece, permisos y canal están OK.{"\n"}
//         • Luego prueba 10s (usa timeInterval) y 65s (usa trigger por fecha).{"\n"}
//         • En web, solo verás una Web Notification si la pestaña está abierta.
//       </Text>
//     </ScrollView>
//   );
// }

// const styles = StyleSheet.create({
//   c: { padding: 20, gap: 12 },
//   h1: { fontSize: 22, fontWeight: "800" },
//   btn: { backgroundColor: "#7C3AED", padding: 14, borderRadius: 12, alignItems: "center" },
//   btnText: { color: "#fff", fontWeight: "900" },
//   danger: { backgroundColor: "#EF4444" },
//   note: { opacity: 0.8, marginTop: 10 },
// });
