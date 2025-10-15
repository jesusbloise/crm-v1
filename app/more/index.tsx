// app/more/index.tsx
import { api } from "@/src/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const BG="#0b0c10", CARD="#14151a", BORDER="#272a33", TEXT="#e8ecf1", SUBTLE="#a9b0bd", ACCENT="#7c3aed";

const TENANTS = ["acme", "globex", "demo"];

export default function More() {
  const [tenant, setTenant] = useState<string>("demo");

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem("tenant_id");
      const t = saved || "demo";
      setTenant(t);
      api.setTenantId(t);
    })();
  }, []);

  const choose = async (t: string) => {
    setTenant(t);
    api.setTenantId(t);
    await AsyncStorage.setItem("tenant_id", t);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "Más" }} />
      <Text style={styles.title}>Empresa activa</Text>

      <View style={styles.row}>
        {TENANTS.map(t => {
          const active = tenant === t;
          return (
            <Pressable key={t} onPress={() => choose(t)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.hint}>Todas las listas y detalles se filtran por esta empresa.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:{ flex:1, backgroundColor:BG, padding:16 },
  title:{ color:TEXT, fontSize:18, fontWeight:"900", marginBottom:12 },
  row:{ flexDirection:"row", flexWrap:"wrap", gap:8 },
  chip:{ paddingHorizontal:12, paddingVertical:8, borderRadius:999, borderWidth:1, borderColor:BORDER, backgroundColor:CARD },
  chipActive:{ backgroundColor:ACCENT, borderColor:ACCENT },
  chipText:{ color:TEXT, fontWeight:"700" },
  chipTextActive:{ color:"#fff" },
  hint:{ color:SUBTLE, marginTop:12 },
});


// // app/more/index.tsx
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import React, { useEffect, useState } from "react";
// import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

// /* 🎨 Tema consistente */
// const BG = "#0b0c10";
// const CARD = "#14151a";
// const BORDER = "#272a33";
// const TEXT = "#e8ecf1";
// const SUBTLE = "#a9b0bd";
// const ACCENT = "#7c3aed";

// export default function More() {
//   const [tenant, setTenant] = useState("demo-tenant");

//   useEffect(() => {
//     AsyncStorage.getItem("tenant_id").then((v) => {
//       if (v) setTenant(v);
//     });
//   }, []);

//   const save = async () => {
//     const value = tenant.trim();
//     await AsyncStorage.setItem("tenant_id", value);
//     const msg = `Tenant guardado: ${value}\n\nActualiza listas con pull-to-refresh.`;
//     if (Platform.OS === "web") alert(msg);
//     else Alert.alert("Listo", msg);
//   };

//   const clear = async () => {
//     await AsyncStorage.removeItem("tenant_id");
//     setTenant("");
//     if (Platform.OS === "web") alert("Tenant eliminado");
//     else Alert.alert("Listo", "Tenant eliminado");
//   };

//   return (
//     <View style={styles.screen}>
//       <Text style={styles.title}>Ajustes</Text>

//       <View style={styles.card}>
//         <Text style={styles.label}>Tenant ID</Text>
//         <Text style={styles.hint}>
//           Define el espacio de trabajo (empresa). Todas las llamadas irán con este tenant.
//         </Text>

//         <TextInput
//           value={tenant}
//           onChangeText={setTenant}
//           placeholder="p. ej. acme-inc"
//           placeholderTextColor={SUBTLE}
//           style={styles.input}
//           autoCapitalize="none"
//           autoCorrect={false}
//         />

//         <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
//           <Pressable style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]} onPress={save}>
//             <Text style={styles.primaryText}>Guardar</Text>
//           </Pressable>
//           <Pressable style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]} onPress={clear}>
//             <Text style={styles.ghostText}>Borrar</Text>
//           </Pressable>
//         </View>
//       </View>

//       <Text style={styles.note}>
//         Tip: en desarrollo puedes cambiar de tenant y luego “pull-to-refresh” en
//         Contactos / Oportunidades para ver el efecto.
//       </Text>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG, padding: 16 },
//   title: { color: TEXT, fontWeight: "900", fontSize: 18, marginBottom: 12 },
//   card: {
//     backgroundColor: CARD,
//     borderWidth: 1,
//     borderColor: BORDER,
//     borderRadius: 14,
//     padding: 14,
//   },
//   label: { color: TEXT, fontWeight: "900" },
//   hint: { color: SUBTLE, marginTop: 4, marginBottom: 8, fontSize: 12 },
//   input: {
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: "#121318",
//     color: TEXT,
//     borderRadius: 12,
//     padding: 12,
//     marginTop: 6,
//   },
//   primaryBtn: {
//     flex: 1,
//     backgroundColor: ACCENT,
//     borderRadius: 12,
//     paddingVertical: 12,
//     alignItems: "center",
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.16)",
//   },
//   primaryText: { color: "#fff", fontWeight: "900" },
//   ghostBtn: {
//     width: 120,
//     backgroundColor: "rgba(255,255,255,0.06)",
//     borderRadius: 12,
//     paddingVertical: 12,
//     alignItems: "center",
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.12)",
//   },
//   ghostText: { color: TEXT, fontWeight: "800" },
//   pressed: { opacity: 0.9 },
//   note: { color: SUBTLE, fontSize: 12, marginTop: 12 },
// });
