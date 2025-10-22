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

import {
  login as apiLogin,
  me as apiMe,
  isAuthenticated,
  setActiveTenant,
} from "@/src/api/auth";
import { ToastProvider } from "@/src/ui/Toast";
// ⬇️ PON ESTO ARRIBA DEL COMPONENTE, DESPUÉS DE LOS IMPORTS
// justo después de los imports, antes del componente:
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
const AUTO_LOGIN = (process.env.EXPO_PUBLIC_AUTO_LOGIN === "1"); // opcional

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

export default function RootLayout() {
  useAppFocusSync();
  setupIOSDevFetchShim();

  const pathname = usePathname();
  const inAuthFlow = pathname?.startsWith("/auth");
  const insets = useSafeAreaInsets(); // ✅ calcular una sola vez

  const [authReady, setAuthReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  // Boot inicial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hasToken = await isAuthenticated();
        if (hasToken) {
          const info = await apiMe().catch(() => null);
          if (info?.tenant) await setActiveTenant(info.tenant);
          setAuthed(Boolean(info));
        } else if (AUTO_LOGIN) {
          const data = await apiLogin({ email: "admin@demo.local", password: "demo" }).catch(() => null);
          if (data?.active_tenant) await setActiveTenant(data.active_tenant);
          setAuthed(Boolean(data));
        } else {
          setAuthed(false);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Guard al navegar (incluye efecto después de logout)
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
          <Stack
            screenOptions={{
              contentStyle: {
                backgroundColor: COLORS.bg,
                paddingBottom: inAuthFlow ? 0 : TAB_HEIGHT + Math.max(insets.bottom, 8), // ✅ usa insets ya calculado
              },
              headerStyle: { backgroundColor: COLORS.bg },
              headerTitleStyle: { color: COLORS.text, fontWeight: "800" },
              headerTintColor: COLORS.text,
              headerShadowVisible: false,
            }}
          />

          {!inAuthFlow && <BottomBar bottomInset={insets.bottom} />} {/* ✅ usa el mismo insets */}
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
