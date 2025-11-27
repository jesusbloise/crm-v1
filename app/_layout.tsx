// app/_layout.tsx
import { Feather } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Stack, router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  login as apiLogin,
  me as apiMe,
  clearActiveTenant,
  clearToken,
  getActiveTenantDetails,
  isAuthenticated,
  setActiveTenant
} from "@/src/api/auth";
import { ToastProvider } from "@/src/ui/Toast";

// ⬇️ NEW: notificaciones (init al boot + reensure) — import defensivo
import * as Notifs from "@/src/utils/notifications";
// ⬇️ NEW: fetch de actividades con recordatorio futuro
import { listOpenActivitiesWithReminder } from "@/src/api/activities";

// ⬇️ PON ESTO ARRIBA DEL COMPONENTE, DESPUÉS DE LOS IMPORTS
if (__DEV__) {
  require("../src/utils/iosTextDetect");
}

const COLORS = {
  bg: "#0b0c10",
  card: "#14151a",
  text: "#e8ecf1",
  subtle: "#a9b0bd",
  border: "#272a33",
  accent: "#7c3aed",
  accent2: "#22d3ee",
};

const TAB_HEIGHT = 60;
const queryClient = new QueryClient();

// 🔒 Opción 1: SIEMPRE pedir login (sin auto-login demo)
const AUTO_LOGIN = false;

function useAppFocusSync() {
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (Platform.OS !== "web") focusManager.setFocused(state === "active");
    });
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
    (Constants as any)?.manifest?.debuggerHost ||
    "";
  const lanHost = typeof hostUri === "string" ? hostUri.split(":")[0] : null;
  if (!lanHost) return;

  const BAD_HOSTNAMES = ["localhost", "127.0.0.1"];
  const HOST_RE = /^https?:\/\/([^\/:]+)(:\d+)?(\/.*)?$/i;

  // @ts-ignore
  global.fetch = (async (input: any, init?: RequestInit) => {
    let url = typeof input === "string" ? input : input?.url;
    try {
      if (typeof url === "string") {
        const m = url.match(HOST_RE);
        if (m) {
          const originalHost = m[1];
          const originalPort = m[2] || "";
          const restPath = m[3] || "/";
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

/* ---------- Indicador de Workspace en el header ---------- */
type TenantInfo = {
  id: string;
  name?: string;
  owner_name?: string;
  owner_email?: string;
};

function TenantPill({ value }: { value: TenantInfo | null }) {
  const label = value?.name || value?.id || "—";
  const subtitle = value?.owner_name || value?.owner_email;
  
  return (
    <Pressable
      onPress={() => router.push("/more")}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: "rgba(124,58,237,0.12)",
          borderWidth: 1,
          borderColor: "rgba(124,58,237,0.35)",
          opacity: pressed ? 0.85 : 1,
          marginRight: 8,
        },
      ]}
    >
      <Feather name="layers" size={16} color={COLORS.accent} />
      <View style={{ marginLeft: 6, flex: 1, maxWidth: 160 }}>
        <Text
          numberOfLines={1}
          style={{ color: COLORS.accent, fontWeight: "800" }}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{ color: COLORS.accent, fontSize: 11, opacity: 0.8 }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Feather name="chevron-down" size={16} color={COLORS.accent} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

export default function RootLayout() {
  useAppFocusSync();
  setupIOSDevFetchShim();

  const pathname = usePathname();
  const inAuthFlow = pathname?.startsWith("/auth");
  const insets = useSafeAreaInsets();

  const [authReady, setAuthReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [activeTenant, setActiveTenantState] = useState<TenantInfo | null>(null);

  // 🔔 inicializa notificaciones una sola vez
  useEffect(() => {
    Notifs.initNotifications?.().catch(() => {});
  }, []);

  // 🔁 re-agenda recordatorios abiertos con remind_at_ms futuro (si la función existe)
  useEffect(() => {
    if (typeof Notifs.reensurePendingReminders !== "function") {
      console.log("reensurePendingReminders no disponible (web/caché).");
      return;
    }
    Notifs.reensurePendingReminders(async () => {
      const list = await listOpenActivitiesWithReminder(Date.now());
      return list.map((a) => ({
        id: a.id,
        title: a.title,
        notes: a.notes ?? null,
        remindAtMs: a.remindAtMs,
      }));
    }).catch(() => {});
  }, []);

  // Boot inicial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hasToken = await isAuthenticated();
        if (hasToken) {
          const info = await apiMe().catch(async (err) => {
            // Si falla /me, limpiamos token corrupto y forzamos login
            console.log("⚠️ Error al verificar sesión, limpiando token...", err?.message);
            await clearToken();
            await clearActiveTenant();
            return null;
          });
          
          if (info?.active_tenant) {
            await setActiveTenant(info.active_tenant);
            console.log("✅ Tenant sincronizado del backend:", info.active_tenant);
            setAuthed(true);
          } else if (AUTO_LOGIN) {
            // (Este bloque NO se ejecuta porque AUTO_LOGIN=false)
            console.log("🔄 /me sin tenant, haciendo auto-login...");
            const data = await apiLogin({ email: "admin@demo.local", password: "demo" }).catch(() => null);
            if (data?.active_tenant) {
              await setActiveTenant(data.active_tenant);
              console.log("✅ Tenant guardado tras auto-login:", data.active_tenant);
            }
            setAuthed(Boolean(data));
          } else {
            setAuthed(Boolean(info));
          }
        } else if (AUTO_LOGIN) {
          // (Este bloque NO se ejecuta porque AUTO_LOGIN=false)
          console.log("🔄 AUTO_LOGIN activado, iniciando sesión demo...");
          const data = await apiLogin({ email: "admin@demo.local", password: "demo" }).catch(() => null);
          if (data?.active_tenant) {
            await setActiveTenant(data.active_tenant);
            console.log("✅ Tenant guardado tras auto-login:", data.active_tenant);
          }
          setAuthed(Boolean(data));
        } else {
          console.log("❌ No hay token y AUTO_LOGIN desactivado");
          setAuthed(false);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mantener el pill del header sincronizado con el tenant guardado
  useEffect(() => {
    let ignore = false;
    (async () => {
      // Solo obtener tenant si el usuario está autenticado
      const has = await isAuthenticated();
      if (!has) {
        if (!ignore) setActiveTenantState(null);
        return;
      }
      
      const t = await getActiveTenantDetails();
      if (!ignore) setActiveTenantState(t || null);
    })();
    return () => {
      ignore = true;
    };
  }, [pathname]); // refresca cuando navegas (ej: después de cambiar en /more)

  // Guard al navegar
  useEffect(() => {
    if (!authReady) return;
    (async () => {
      const has = await isAuthenticated();
      if (!has && !inAuthFlow) router.replace("/auth/login");
      if (has && inAuthFlow) router.replace("/");
    })();
  }, [authReady, inAuthFlow, pathname]);

  if (!authReady) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <StatusBar style="light" />

        <View style={styles.appContainer}>
          {/* 🔧 Aseguramos que /calendar/google tenga header y título */}
          <Stack
            screenOptions={{
              contentStyle: {
                backgroundColor: COLORS.bg,
                paddingBottom: inAuthFlow ? 0 : TAB_HEIGHT + Math.max(insets.bottom, 8),
              },
              headerStyle: { backgroundColor: COLORS.bg },
              headerTitleStyle: { color: COLORS.text, fontWeight: "800" },
              headerTintColor: COLORS.text,
              headerShadowVisible: false,
              headerRight: () => (inAuthFlow ? null : <TenantPill value={activeTenant} />),
            }}
          >
            <Stack.Screen name="index" options={{ title: "Inicio" }} />
            <Stack.Screen name="calendar/google" options={{ title: "Google Calendar" }} />
          </Stack>

          {!inAuthFlow && <BottomBar bottomInset={insets.bottom} />}
        </View>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function BottomBar({ bottomInset }: { bottomInset: number }) {
  const pathname = usePathname();

  const items = [
    { href: "/",         label: "Resumen",   icon: "home" as const },
    { href: "/contacts", label: "Contactos", icon: "users" as const },
    { href: "/deals",    label: "Oportun.",  icon: "briefcase" as const },
    { href: "/tasks",    label: "Activ.",    icon: "check-square" as const },
    { href: "/calendar", label: "Calend.",   icon: "calendar" as const },
    { href: "/more",     label: "Más",       icon: "grid" as const },
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
// import { useEffect, useState } from "react";
// import {
//   AppState,
//   Platform,
//   Pressable,
//   StyleSheet,
//   Text,
//   View,
// } from "react-native";
// import { useSafeAreaInsets } from "react-native-safe-area-context";

// import {
//   login as apiLogin,
//   me as apiMe,
//   clearActiveTenant,
//   clearToken,
//   getActiveTenantDetails,
//   isAuthenticated,
//   setActiveTenant
// } from "@/src/api/auth";
// import { ToastProvider } from "@/src/ui/Toast";

// // ⬇️ NEW: notificaciones (init al boot + reensure) — import defensivo
// import * as Notifs from "@/src/utils/notifications";
// // ⬇️ NEW: fetch de actividades con recordatorio futuro
// import { listOpenActivitiesWithReminder } from "@/src/api/activities";

// // ⬇️ PON ESTO ARRIBA DEL COMPONENTE, DESPUÉS DE LOS IMPORTS
// if (__DEV__) {
//   require("../src/utils/iosTextDetect");
// }

// const COLORS = {
//   bg: "#0b0c10",
//   card: "#14151a",
//   text: "#e8ecf1",
//   subtle: "#a9b0bd",
//   border: "#272a33",
//   accent: "#7c3aed",
//   accent2: "#22d3ee",
// };

// const TAB_HEIGHT = 60;
// const queryClient = new QueryClient();
// const AUTO_LOGIN = process.env.EXPO_PUBLIC_AUTO_LOGIN === "1";

// function useAppFocusSync() {
//   useEffect(() => {
//     const sub = AppState.addEventListener("change", (state) => {
//       if (Platform.OS !== "web") focusManager.setFocused(state === "active");
//     });
//     // @ts-ignore
//     return () => sub?.remove?.();
//   }, []);
// }

// /** iOS DEV fetch shim para llamar al backend por IP LAN en Expo Go */
// function setupIOSDevFetchShim() {
//   if (!__DEV__ || Platform.OS !== "ios") return;

//   const origFetch = global.fetch as typeof fetch;
//   // @ts-ignore distintas claves según versión de Expo
//   const hostUri =
//     (Constants as any)?.expoConfig?.hostUri ||
//     (Constants as any)?.manifest2?.extra?.expoGo?.hostUri ||
//     (Constants as any)?.manifest?.debuggerHost ||
//     "";
//   const lanHost = typeof hostUri === "string" ? hostUri.split(":")[0] : null;
//   if (!lanHost) return;

//   const BAD_HOSTNAMES = ["localhost", "127.0.0.1"];
//   const HOST_RE = /^https?:\/\/([^\/:]+)(:\d+)?(\/.*)?$/i;

//   // @ts-ignore
//   global.fetch = (async (input: any, init?: RequestInit) => {
//     let url = typeof input === "string" ? input : input?.url;
//     try {
//       if (typeof url === "string") {
//         const m = url.match(HOST_RE);
//         if (m) {
//           const originalHost = m[1];
//           const originalPort = m[2] || "";
//           const restPath = m[3] || "/";
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

// /* ---------- Indicador de Workspace en el header ---------- */
// type TenantInfo = {
//   id: string;
//   name?: string;
//   owner_name?: string;
//   owner_email?: string;
// };

// function TenantPill({ value }: { value: TenantInfo | null }) {
//   const label = value?.name || value?.id || "—";
//   const subtitle = value?.owner_name || value?.owner_email;
  
//   return (
//     <Pressable
//       onPress={() => router.push("/more")}
//       style={({ pressed }) => [
//         {
//           flexDirection: "row",
//           alignItems: "center",
//           paddingHorizontal: 10,
//           paddingVertical: 6,
//           borderRadius: 999,
//           backgroundColor: "rgba(124,58,237,0.12)",
//           borderWidth: 1,
//           borderColor: "rgba(124,58,237,0.35)",
//           opacity: pressed ? 0.85 : 1,
//           marginRight: 8,
//         },
//       ]}
//     >
//       <Feather name="layers" size={16} color={COLORS.accent} />
//       <View style={{ marginLeft: 6, flex: 1, maxWidth: 160 }}>
//         <Text
//           numberOfLines={1}
//           style={{ color: COLORS.accent, fontWeight: "800" }}
//         >
//           {label}
//         </Text>
//         {subtitle ? (
//           <Text
//             numberOfLines={1}
//             style={{ color: COLORS.accent, fontSize: 11, opacity: 0.8 }}
//           >
//             {subtitle}
//           </Text>
//         ) : null}
//       </View>
//       <Feather name="chevron-down" size={16} color={COLORS.accent} style={{ marginLeft: 4 }} />
//     </Pressable>
//   );
// }

// export default function RootLayout() {
//   useAppFocusSync();
//   setupIOSDevFetchShim();

//   const pathname = usePathname();
//   const inAuthFlow = pathname?.startsWith("/auth");
//   const insets = useSafeAreaInsets();

//   const [authReady, setAuthReady] = useState(false);
//   const [authed, setAuthed] = useState(false);
//   const [activeTenant, setActiveTenantState] = useState<TenantInfo | null>(null);

//   // 🔔 inicializa notificaciones una sola vez
//   useEffect(() => {
//     Notifs.initNotifications?.().catch(() => {});
//   }, []);

//   // 🔁 re-agenda recordatorios abiertos con remind_at_ms futuro (si la función existe)
//   useEffect(() => {
//     if (typeof Notifs.reensurePendingReminders !== "function") {
//       console.log("reensurePendingReminders no disponible (web/caché).");
//       return;
//     }
//     Notifs.reensurePendingReminders(async () => {
//       const list = await listOpenActivitiesWithReminder(Date.now());
//       return list.map((a) => ({
//         id: a.id,
//         title: a.title,
//         notes: a.notes ?? null,
//         remindAtMs: a.remindAtMs,
//       }));
//     }).catch(() => {});
//   }, []);

//   // Boot inicial
//   useEffect(() => {
//     let cancelled = false;
//     (async () => {
//       try {
//         const hasToken = await isAuthenticated();
//         if (hasToken) {
//           const info = await apiMe().catch(async (err) => {
//             // Si falla /me, limpiamos token corrupto y forzamos login
//             console.log("⚠️ Error al verificar sesión, limpiando token...", err?.message);
//             await clearToken();
//             await clearActiveTenant();
//             return null;
//           });
          
//           if (info?.active_tenant) {
//             await setActiveTenant(info.active_tenant);
//             console.log("✅ Tenant sincronizado del backend:", info.active_tenant);
//             setAuthed(true);
//           } else if (AUTO_LOGIN) {
//             // Si /me no devuelve tenant, hacer auto-login
//             console.log("🔄 /me sin tenant, haciendo auto-login...");
//             const data = await apiLogin({ email: "admin@demo.local", password: "demo" }).catch(() => null);
//             if (data?.active_tenant) {
//               await setActiveTenant(data.active_tenant);
//               console.log("✅ Tenant guardado tras auto-login:", data.active_tenant);
//             }
//             setAuthed(Boolean(data));
//           } else {
//             setAuthed(Boolean(info));
//           }
//         } else if (AUTO_LOGIN) {
//           console.log("🔄 AUTO_LOGIN activado, iniciando sesión demo...");
//           const data = await apiLogin({ email: "admin@demo.local", password: "demo" }).catch(() => null);
//           if (data?.active_tenant) {
//             await setActiveTenant(data.active_tenant);
//             console.log("✅ Tenant guardado tras auto-login:", data.active_tenant);
//           }
//           setAuthed(Boolean(data));
//         } else {
//           console.log("❌ No hay token y AUTO_LOGIN desactivado");
//           setAuthed(false);
//         }
//       } finally {
//         if (!cancelled) setAuthReady(true);
//       }
//     })();
//     return () => {
//       cancelled = true;
//     };
//   }, []);

//   // Mantener el pill del header sincronizado con el tenant guardado
//   useEffect(() => {
//     let ignore = false;
//     (async () => {
//       // Solo obtener tenant si el usuario está autenticado
//       const has = await isAuthenticated();
//       if (!has) {
//         if (!ignore) setActiveTenantState(null);
//         return;
//       }
      
//       const t = await getActiveTenantDetails();
//       if (!ignore) setActiveTenantState(t || null);
//     })();
//     return () => {
//       ignore = true;
//     };
//   }, [pathname]); // refresca cuando navegas (ej: después de cambiar en /more)

//   // Guard al navegar
//   useEffect(() => {
//     if (!authReady) return;
//     (async () => {
//       const has = await isAuthenticated();
//       if (!has && !inAuthFlow) router.replace("/auth/login");
//       if (has && inAuthFlow) router.replace("/");
//     })();
//   }, [authReady, inAuthFlow, pathname]);

//   if (!authReady) {
//     return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />;
//   }

//   return (
//     <QueryClientProvider client={queryClient}>
//       <ToastProvider>
//         <StatusBar style="light" />

//         <View style={styles.appContainer}>
//           {/* 🔧 Aseguramos que /calendar/google tenga header y título */}
//           <Stack
//             screenOptions={{
//               contentStyle: {
//                 backgroundColor: COLORS.bg,
//                 paddingBottom: inAuthFlow ? 0 : TAB_HEIGHT + Math.max(insets.bottom, 8),
//               },
//               headerStyle: { backgroundColor: COLORS.bg },
//               headerTitleStyle: { color: COLORS.text, fontWeight: "800" },
//               headerTintColor: COLORS.text,
//               headerShadowVisible: false,
//               headerRight: () => (inAuthFlow ? null : <TenantPill value={activeTenant} />),
//             }}
//           >
//             <Stack.Screen name="index" options={{ title: "Inicio" }} />
//             <Stack.Screen name="calendar/google" options={{ title: "Google Calendar" }} />
//           </Stack>

//           {!inAuthFlow && <BottomBar bottomInset={insets.bottom} />}
//         </View>
//       </ToastProvider>
//     </QueryClientProvider>
//   );
// }

// function BottomBar({ bottomInset }: { bottomInset: number }) {
//   const pathname = usePathname();

//   const items = [
//     { href: "/",                 label: "Resumen",   icon: "home" as const },
//     { href: "/contacts",         label: "Contactos", icon: "users" as const },
//     { href: "/deals",            label: "Oportun.",  icon: "briefcase" as const },
//     { href: "/tasks",            label: "Activ.",    icon: "check-square" as const },
//     { href: "/calendar",         label: "Calend.",   icon: "calendar" as const }, // 👈 añadido
//     { href: "/more",             label: "Más",       icon: "grid" as const },
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
//   tabItemActive: {
//     backgroundColor: "rgba(124,58,237,0.12)",
//     borderWidth: 1,
//     borderColor: "rgba(124,58,237,0.35)",
//   },
//   tabLabel: {
//     fontSize: 11,
//     fontWeight: "800",
//     letterSpacing: 0.2,
//   },
// });
