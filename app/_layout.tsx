// app/_layout.tsx
import { Feather } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Stack, router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, setAuth } from "@/src/api";
import { isMultiTenantOn } from "@/src/features/multitenant";
import { ToastProvider } from "@/src/ui/Toast"; // 👈 AÑADIDO

/* 🎨 Tema consistente */
const COLORS = {
  bg: "#0b0c10",
  card: "#14151a",
  text: "#e8ecf1",
  subtle: "#a9b0bd",
  border: "#272a33",
  accent: "#7c3aed",   // morado
  accent2: "#22d3ee",  // cian
};

const TAB_HEIGHT = 60;
const queryClient = new QueryClient();

/* Sincroniza foco de React Query al estado de la app */
function useAppFocusSync() {
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (Platform.OS !== "web") focusManager.setFocused(state === "active");
    });
    // RN nuevas versiones devuelven objeto con remove()
    // @ts-ignore
    return () => sub?.remove?.();
  }, []);
}

/** iOS DEV fetch shim para llamar al backend por IP LAN en Expo Go */
function setupIOSDevFetchShim() {
  if (!__DEV__ || Platform.OS !== "ios") return;

  const origFetch = global.fetch as typeof fetch;
  // @ts-ignore distintas claves según versión de Expo
  const hostUri =
    (Constants as any)?.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoGo?.hostUri ||
    "";
  const lanHost = typeof hostUri === "string" ? hostUri.split(":")[0] : null;
  if (!lanHost) return;

  const BAD_HOSTNAMES = ["localhost", "127.0.0.1", "postlab-vm40", "atomica-vm"];
  const HOST_RE = /^https?:\/\/([^\/:]+)(:\d+)?(\/.*)?$/i;

  global.fetch = (async (input: any, init?: RequestInit) => {
    let url = typeof input === "string" ? input : input?.url;
    try {
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

  // Gate: no renderizar rutas hasta tener token listo
  const [authReady, setAuthReady] = useState(false);

  // Auto-login DEV si no hay token guardado
  useEffect(() => {
    const ls: Storage | null = typeof localStorage !== "undefined" ? localStorage : null;
    const token = ls?.getItem("auth.token") || undefined;
    const tenant = ls?.getItem("auth.tenant") || undefined;

    async function ensureLogin() {
      try {
        if (token && tenant) {
          setAuth(token, tenant);
        } else {
          const resp = await api.post<{ token: string; active_tenant: string }>("/auth/login", {
            email: "admin@demo.local",
            password: "demo",
          });
          setAuth(resp.token, resp.active_tenant || "demo");
        }
      } catch (e) {
        console.warn("Login dev falló:", e);
      } finally {
        setAuthReady(true); // habilita render
      }
    }

    ensureLogin();
  }, []);

  useEffect(() => {
    console.log("multi-tenant:", isMultiTenantOn());
  }, []);

  const insets = useSafeAreaInsets();

  if (!authReady) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{/* 👈 ENVUELVE TODA LA APP PARA MOSTRAR TOASTS EN CUALQUIER PANTALLA */}
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

          <BottomBar bottomInset={insets.bottom} />
        </View>
      </ToastProvider>
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
  tabItemActive: {
    backgroundColor: "rgba(124,58,237,0.12)",
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
// import Constants from "expo-constants";
// import { Stack, router, usePathname } from "expo-router";
// import { StatusBar } from "expo-status-bar";
// import React, { useEffect, useState } from "react";
// import {
//   AppState,
//   Platform,
//   Pressable,
//   StyleSheet,
//   Text,
//   View,
// } from "react-native";
// import { useSafeAreaInsets } from "react-native-safe-area-context";

// import { api, setAuth } from "@/src/api"; // 👈 importante
// import { isMultiTenantOn } from "@/src/features/multitenant";

// /* 🎨 Tema consistente (igual al resto) */
// const COLORS = {
//   bg: "#0b0c10",
//   card: "#14151a",
//   text: "#e8ecf1",
//   subtle: "#a9b0bd",
//   border: "#272a33",
//   accent: "#7c3aed",   // morado
//   accent2: "#22d3ee",  // cian (por si lo necesitas)
// };

// const TAB_HEIGHT = 60;
// const queryClient = new QueryClient();

// /* Sincroniza foco de React Query al estado de la app */
// function useAppFocusSync() {
//   useEffect(() => {
//     const sub = AppState.addEventListener("change", (state) => {
//       if (Platform.OS !== "web") focusManager.setFocused(state === "active");
//     });
//     // @ts-ignore RN nuevas versiones devuelven objeto con remove()
//     return () => sub?.remove?.();
//   }, []);
// }

// /** iOS DEV fetch shim */
// function setupIOSDevFetchShim() {
//   if (!__DEV__ || Platform.OS !== "ios") return;

//   const origFetch = global.fetch as typeof fetch;

//   const hostUri =
//     // @ts-ignore diferentes claves según versión de Expo
//     (Constants as any)?.expoConfig?.hostUri ||
//     (Constants as any)?.manifest2?.extra?.expoGo?.hostUri ||
//     "";
//   const lanHost = typeof hostUri === "string" ? hostUri.split(":")[0] : null;
//   if (!lanHost) return;

//   const BAD_HOSTNAMES = [
//     "localhost",
//     "127.0.0.1",
//     "postlab-vm40",
//     "atomica-vm",
//   ];
//   const HOST_RE = /^https?:\/\/([^\/:]+)(:\d+)?(\/.*)?$/i;

//   global.fetch = (async (input: any, init?: RequestInit) => {
//     try {
//       let url = typeof input === "string" ? input : input?.url;

//       if (typeof url === "string") {
//         const m = url.match(HOST_RE);
//         if (m) {
//           const originalHost = m[1];
//           const originalPort = m[2] || "";
//           const restPath     = m[3] || "/";

//           if (BAD_HOSTNAMES.includes(originalHost)) {
//             const schema = url.startsWith("https://") ? "https" : "http";
//             const rewritten = `${schema}://${lanHost}${originalPort}${restPath}`;
//             input = typeof input === "string" ? rewritten : new Request(rewritten, input);
//           }
//         }
//       }
//       return await origFetch(input, init);
//     } catch (e) {
//       throw e;
//     }
//   }) as any;
// }

// export default function RootLayout() {
//   useAppFocusSync();
//   setupIOSDevFetchShim();

//   // ⬇️ Nuevo: gating para que no salgan 401 antes de tiempo
//   const [authReady, setAuthReady] = useState(false);

//   // Auto-login DEV: si no hay token guardado, hace login y setea headers
//   useEffect(() => {
//     const ls: Storage | null = typeof localStorage !== "undefined" ? localStorage : null;
//     const token = ls?.getItem("auth.token") || undefined;
//     const tenant = ls?.getItem("auth.tenant") || undefined;

//     async function ensureLogin() {
//       try {
//         if (token && tenant) {
//           setAuth(token, tenant);
//         } else {
//           const resp = await api.post<{ token: string; active_tenant: string }>("/auth/login", {
//             email: "admin@demo.local",
//             password: "demo",
//           });
//           setAuth(resp.token, resp.active_tenant || "demo");
//         }
//       } catch (e) {
//         console.warn("Login dev falló:", e);
//       } finally {
//         setAuthReady(true); // <- libera el render
//       }
//     }

//     ensureLogin();
//   }, []);

//   // Log informativo (sincronizado con tu bandera)
//   useEffect(() => {
//     console.log("multi-tenant:", isMultiTenantOn());
//   }, []);

//   const insets = useSafeAreaInsets();

//   // ⬇️ bloquea el render del árbol hasta tener token/tenant
//   if (!authReady) {
//     return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />;
//   }

//   return (
//     <QueryClientProvider client={queryClient}>
//       {/* Status bar clara sobre fondo oscuro */}
//       <StatusBar style="light" />

//       <View style={styles.appContainer}>
//         <Stack
//           screenOptions={{
//             contentStyle: {
//               backgroundColor: COLORS.bg,
//               paddingBottom: TAB_HEIGHT + insets.bottom,
//             },
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
//     { href: "/",          label: "Resumen",  icon: "home" as const },
//     { href: "/contacts",  label: "Contactos",icon: "users" as const },
//     { href: "/deals",     label: "Oportun.", icon: "briefcase" as const },
//     { href: "/tasks",     label: "Activ.",   icon: "check-square" as const },
//     { href: "/more",      label: "Más",      icon: "grid" as const },
//   ];

//   const isActive = (href: string) => {
//     if (href === "/") return pathname === "/" || pathname === "";
//     return pathname === href || pathname.startsWith(href + "/");
//   };

//   return (
//     <View
//       style={[
//         styles.tabBar,
//         {
//           paddingBottom: Math.max(bottomInset, 8),
//           height: TAB_HEIGHT + Math.max(bottomInset, 8),
//         },
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
//               active && styles.tabItemActive,
//               pressed && !active && { opacity: 0.88 },
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

// const shadow = Platform.select({
//   ios: { shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: -6 } },
//   android: { elevation: 16 },
//   web: { boxShadow: "0 -10px 24px rgba(0,0,0,0.35)" } as any,
// });

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
//     ...shadow,
//   },
//   tabItem: {
//     flex: 1,
//     alignItems: "center",
//     justifyContent: "center",
//     gap: 4,
//     paddingVertical: 6,
//     marginHorizontal: 4,
//     borderRadius: 12,
//   },
//   // “pill” sutil para el tab activo
//   tabItemActive: {
//     backgroundColor: "rgba(124,58,237,0.12)", // morado translúcido
//     borderWidth: 1,
//     borderColor: "rgba(124,58,237,0.35)",
//   },
//   tabLabel: {
//     fontSize: 11,
//     fontWeight: "800",
//     letterSpacing: 0.2,
//   },
// });
