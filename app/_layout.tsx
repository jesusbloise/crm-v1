// app/_layout.tsx
import { Feather } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Stack, router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const queryClient = new QueryClient();

/* 🎨 Tema consistente (igual al resto) */
const COLORS = {
  bg: "#0b0c10",
  card: "#14151a",
  text: "#e8ecf1",
  subtle: "#a9b0bd",
  border: "#272a33",
  accent: "#7c3aed",   // morado
  accent2: "#22d3ee",  // cian (por si lo necesitas)
};

const TAB_HEIGHT = 60;

function useAppFocusSync() {
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (Platform.OS !== "web") {
        focusManager.setFocused(state === "active");
      }
    });
    // @ts-ignore RN nuevas versiones devuelven objeto con remove()
    return () => sub?.remove?.();
  }, []);
}

/** iOS DEV fetch shim */
function setupIOSDevFetchShim() {
  if (!__DEV__ || Platform.OS !== "ios") return;

  const origFetch = global.fetch as typeof fetch;

  const hostUri =
    // @ts-ignore diferentes claves según versión de Expo
    (Constants as any)?.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoGo?.hostUri ||
    "";
  const lanHost = typeof hostUri === "string" ? hostUri.split(":")[0] : null;
  if (!lanHost) return;

  const BAD_HOSTNAMES = [
    "localhost",
    "127.0.0.1",
    "postlab-vm40",
    "atomica-vm",
  ];
  const HOST_RE = /^https?:\/\/([^\/:]+)(:\d+)?(\/.*)?$/i;

  global.fetch = (async (input: any, init?: RequestInit) => {
    try {
      let url = typeof input === "string" ? input : input?.url;

      if (typeof url === "string") {
        const m = url.match(HOST_RE);
        if (m) {
          const originalHost = m[1];
          const originalPort = m[2] || "";
          const restPath     = m[3] || "/";

          if (BAD_HOSTNAMES.includes(originalHost)) {
            const schema = url.startsWith("https://") ? "https" : "http";
            const rewritten = `${schema}://${lanHost}${originalPort}${restPath}`;
            input = typeof input === "string" ? rewritten : new Request(rewritten, input);
          }
        }
      }
      return await origFetch(input, init);
    } catch (e) {
      throw e;
    }
  }) as any;
}

export default function RootLayout() {
  useAppFocusSync();
  setupIOSDevFetchShim();

  const insets = useSafeAreaInsets();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Status bar clara sobre fondo oscuro */}
      <StatusBar style="light" />

      <View style={styles.appContainer}>
        <Stack
          screenOptions={{
            contentStyle: {
              backgroundColor: COLORS.bg,
              paddingBottom: TAB_HEIGHT + insets.bottom,
            },
            headerStyle: { backgroundColor: COLORS.bg },
            headerTitleStyle: { color: COLORS.text, fontWeight: "800" },
            headerTintColor: COLORS.text,
            headerShadowVisible: false,
          }}
        />

        {/* Menú inferior persistente */}
        <BottomBar bottomInset={insets.bottom} />
      </View>
    </QueryClientProvider>
  );
}

function BottomBar({ bottomInset }: { bottomInset: number }) {
  const pathname = usePathname();

  const items = [
    { href: "/",          label: "Resumen",  icon: "home" as const },
    { href: "/contacts",  label: "Contactos",icon: "users" as const },
    { href: "/deals",     label: "Oportun.", icon: "briefcase" as const },
    { href: "/tasks",     label: "Activ.",   icon: "check-square" as const },
    { href: "/more",      label: "Más",      icon: "grid" as const },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname === "";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <View
      style={[
        styles.tabBar,
        {
          paddingBottom: Math.max(bottomInset, 8),
          height: TAB_HEIGHT + Math.max(bottomInset, 8),
        },
      ]}
    >
      {items.map((it) => {
        const active = isActive(it.href);
        return (
          <Pressable
            key={it.href}
            onPress={() => router.push(it.href as any)}
            style={({ pressed }) => [
              styles.tabItem,
              active && styles.tabItemActive,
              pressed && !active && { opacity: 0.88 },
            ]}
            android_ripple={{ color: "rgba(255,255,255,0.06)", borderless: false }}
          >
            <Feather
              name={it.icon}
              size={20}
              color={active ? COLORS.accent : COLORS.subtle}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.tabLabel,
                { color: active ? COLORS.accent : COLORS.subtle },
              ]}
            >
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const shadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: -6 } },
  android: { elevation: 16 },
  web: { boxShadow: "0 -10px 24px rgba(0,0,0,0.35)" } as any,
});

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  tabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 8,
    ...shadow,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
    marginHorizontal: 4,
    borderRadius: 12,
  },
  // “pill” sutil para el tab activo
  tabItemActive: {
    backgroundColor: "rgba(124,58,237,0.12)", // morado translúcido
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.35)",
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});


// // app/_layout.tsx
// import { Feather } from "@expo/vector-icons";
// import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
// import Constants from "expo-constants"; // 👈 para detectar la IP LAN de Expo
// import { Stack, router, usePathname } from "expo-router";
// import { StatusBar } from "expo-status-bar";
// import React, { useEffect } from "react";
// import {
//   AppState,
//   Platform,
//   Pressable,
//   StyleSheet,
//   Text,
//   View,
// } from "react-native";
// import { useSafeAreaInsets } from "react-native-safe-area-context";

// const queryClient = new QueryClient();

// const COLORS = {
//   bg: "#0E0F11",   // fondo app
//   text: "#EAEAEA", // texto claro
//   accent: "#FF6A00",
//   border: "#2a2a2c",
//   subtle: "rgba(255,255,255,0.7)",
// };

// const TAB_HEIGHT = 60;

// function useAppFocusSync() {
//   useEffect(() => {
//     const sub = AppState.addEventListener("change", (state) => {
//       if (Platform.OS !== "web") {
//         focusManager.setFocused(state === "active");
//       }
//     });
//     // @ts-ignore RN nuevas versiones devuelven objeto con remove()
//     return () => sub?.remove?.();
//   }, []);
// }

// /** iOS DEV shim:
//  * Si una request apunta a localhost/host privado, la reescribe a la IP LAN que usa Expo Go.
//  * ✔️ Solo iOS y __DEV__, no afecta Android/Web ni builds de producción.
//  * ✔️ No modifica tus servicios ni BASE_URLs; es transparente para tu código.
//  */
// function setupIOSDevFetchShim() {
//   if (!__DEV__ || Platform.OS !== "ios") return;

//   const origFetch = global.fetch;
//   // hostUri suele ser "192.168.1.50:8081" → tomamos la IP
//   const hostUri =
//     // @ts-ignore - distintas claves según versión de Expo
//     Constants?.expoConfig?.hostUri ||
//     // @ts-ignore
//     Constants?.manifest2?.extra?.expoGo?.hostUri ||
//     "";
//   const lanHost = typeof hostUri === "string" ? hostUri.split(":")[0] : null; // "192.168.1.50"
//   const lanBase3001 = lanHost ? `http://${lanHost}:3001` : null;
//   if (!lanBase3001) return;

//   // 👇 Agrega aquí los hosts/puertos internos que iOS no puede resolver en tu entorno
//   const BAD_HOSTS = [
//     "http://localhost:3001",
//     "http://127.0.0.1:3001",
//     "http://postlab-vm40:3001",
//     "http://atomica-vm:3001",
//     // "http://TU-HOST:3001",
//   ];

//   global.fetch = (async (input: any, init?: RequestInit) => {
//     try {
//       let url = typeof input === "string" ? input : input?.url;

//       if (typeof url === "string") {
//         for (const bad of BAD_HOSTS) {
//           if (url.startsWith(bad)) {
//             const rew = lanBase3001 + url.slice(bad.length);
//             // console.log("[iOS shim] ↪", url, "=>", rew);
//             if (typeof input === "string") {
//               input = rew;
//             } else {
//               input = new Request(rew, input);
//             }
//             break;
//           }
//         }
//       }
//       return await origFetch(input, init);
//     } catch (e) {
//       // console.warn("[iOS shim] fetch error:", e);
//       throw e;
//     }
//   }) as any;
// }

// export default function RootLayout() {
//   useAppFocusSync();
//   setupIOSDevFetchShim(); // 👈 activamos el shim solo en iOS+DEV

//   const insets = useSafeAreaInsets();

//   return (
//     <QueryClientProvider client={queryClient}>
//       {/* Status bar clara sobre fondo oscuro */}
//       <StatusBar style="light" />

//       <View style={styles.appContainer}>
//         <Stack
//           screenOptions={{
//             // Fondo de TODAS las pantallas
//             contentStyle: {
//               backgroundColor: COLORS.bg,
//               // espacio para que la barra no tape el contenido
//               paddingBottom: TAB_HEIGHT + insets.bottom,
//             },
//             // Header oscuro y sin sombra
//             headerStyle: { backgroundColor: COLORS.bg },
//             headerTitleStyle: { color: COLORS.text, fontWeight: "800" },
//             headerTintColor: COLORS.text,
//             headerShadowVisible: false,
//           }}
//         />

//         {/* Menú inferior persistente */}
//         <BottomBar bottomInset={insets.bottom} />
//       </View>
//     </QueryClientProvider>
//   );
// }

// function BottomBar({ bottomInset }: { bottomInset: number }) {
//   const pathname = usePathname();

//   const items = [
//     { href: "/", label: "Resumen", icon: "home" as const },
//     { href: "/contacts", label: "Contactos", icon: "users" as const },
//     { href: "/deals", label: "Oportun.", icon: "briefcase" as const },
//     { href: "/tasks", label: "Activ.", icon: "check-square" as const },
//     { href: "/more", label: "Más", icon: "grid" as const },
//   ];

//   const isActive = (href: string) => {
//     // activo si coincide exacto o si estás en una subruta (ej: /contacts/123)
//     if (href === "/") return pathname === "/" || pathname === "";
//     return pathname === href || pathname.startsWith(href + "/");
//   };

//   return (
//     <View
//       style={[
//         styles.tabBar,
//         { paddingBottom: Math.max(bottomInset, 8), height: TAB_HEIGHT + Math.max(bottomInset, 8) },
//       ]}
//     >
//       {items.map((it) => {
//         const active = isActive(it.href);
//         return (
//           <Pressable
//             key={it.href}
//             onPress={() => router.push(it.href as any)}
//             style={({ pressed }) => [
//               styles.tabItem,
//               pressed && !active && { opacity: 0.85 },
//             ]}
//             android_ripple={{ color: "rgba(255,255,255,0.06)", borderless: false }}
//           >
//             <Feather
//               name={it.icon}
//               size={20}
//               color={active ? COLORS.accent : COLORS.subtle}
//             />
//             <Text
//               numberOfLines={1}
//               style={[
//                 styles.tabLabel,
//                 { color: active ? COLORS.accent : COLORS.subtle },
//               ]}
//             >
//               {it.label}
//             </Text>
//           </Pressable>
//         );
//       })}
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   appContainer: {
//     flex: 1,
//     backgroundColor: COLORS.bg,
//   },
//   tabBar: {
//     position: "absolute",
//     left: 0,
//     right: 0,
//     bottom: 0,
//     backgroundColor: COLORS.bg,
//     borderTopWidth: 1,
//     borderTopColor: COLORS.border,
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-around",
//     paddingTop: 8,
//   },
//   tabItem: {
//     flex: 1,
//     alignItems: "center",
//     justifyContent: "center",
//     gap: 4,
//   },
//   tabLabel: {
//     fontSize: 11,
//     fontWeight: "800",
//     letterSpacing: 0.2,
//   },
// });

