// app/_layout.tsx
import { Feather } from "@expo/vector-icons";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
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
  me as apiMe,
  clearActiveTenant,
  clearToken,
  getActiveTenant,
  getToken,
  isAuthenticated,
  setActiveTenant,
} from "@/src/api/auth";
import { ToastProvider } from "@/src/ui/Toast";

import { listOpenActivitiesWithReminder } from "@/src/api/activities";
import * as Notifs from "@/src/utils/notifications";

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
    if (typeof url === "string") {
      const m = url.match(HOST_RE);
      if (m) {
        const originalHost = m[1];
        const originalPort = m[2] || "";
        const restPath = m[3] || "/";
        if (BAD_HOSTNAMES.includes(originalHost)) {
          const schema = url.startsWith("https://") ? "https" : "http";
          const rewritten = `${schema}://${lanHost}${originalPort}${restPath}`;
          input =
            typeof input === "string"
              ? rewritten
              : new Request(rewritten, input);
        }
      }
    }
    return origFetch(input, init);
  }) as any;
}

type MeInfo = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
};

type TenantInfo = {
  id: string;
  name?: string;
};

/** ===== JWT decode (sin libs) ===== */
function base64UrlToString(input: string) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 ? "=".repeat(4 - (base64.length % 4)) : "";
  const b64 = base64 + pad;

  // web
  // @ts-ignore
  if (typeof globalThis.atob === "function") {
    // @ts-ignore
    return globalThis.atob(b64);
  }

  // RN / node-like
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Buffer } = require("buffer");
  return Buffer.from(b64, "base64").toString("utf8");
}

function decodeJwt(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const json = base64UrlToString(parts[1]);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function TenantPill({ me, tenant }: { me: any; tenant: any }) {
  const userLabel = me?.name || me?.email || "Usuario";
  const wsLabel = tenant?.name || tenant?.id || "Workspace";
  const roleLabel = (me?.role || "").toString().toLowerCase();

  return (
    <Pressable
      onPress={() => router.push("/more")}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "rgba(124,58,237,0.12)",
        borderWidth: 1,
        borderColor: "rgba(124,58,237,0.45)",
        maxWidth: 320,
      }}
    >
      <Feather name="user" size={16} color="#7c3aed" />
      <View style={{ marginLeft: 8, flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ color: "#e8ecf1", fontWeight: "700", fontSize: 12 }}
        >
          {userLabel}
        </Text>
        <Text numberOfLines={1} style={{ color: "#7c3aed", fontSize: 11 }}>
          {wsLabel}
          {roleLabel ? ` · ${roleLabel}` : ""}
        </Text>
      </View>
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
  const [me, setMe] = useState<MeInfo | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);

  // 🔔 init notificaciones
  useEffect(() => {
    Notifs.initNotifications?.().catch(() => {});
  }, []);

  // 🔁 re-agenda reminders
  useEffect(() => {
    if (typeof Notifs.reensurePendingReminders !== "function") return;

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

  /** ✅ BOOT: pinta SIEMPRE (JWT) + refresca con /auth/me */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const has = await isAuthenticated();
        if (!has) {
          if (!inAuthFlow) router.replace("/auth/login");
          return;
        }

        // 1) Pintado inmediato desde JWT (no depende del backend)
        const token = await getToken();
        if (token) {
          const decoded = decodeJwt(token);
          const jwtEmail = decoded?.email;
          const jwtRole = decoded?.role;
          const jwtTenant = decoded?.active_tenant;

          const storedTenant = await getActiveTenant();
          const effectiveTenant = jwtTenant || storedTenant;

          if (!cancelled) {
            setMe({ email: jwtEmail, role: jwtRole });
            setTenant(
              effectiveTenant ? { id: effectiveTenant, name: effectiveTenant } : null
            );
          }

          if (effectiveTenant && effectiveTenant !== storedTenant) {
            await setActiveTenant(effectiveTenant);
          }
        }

        // 2) Refresca con backend para nombre real y tenant.name
        const info = await apiMe().catch((e) => {
          console.log("ME ERROR (boot) =>", e?.message || e);
          return null;
        });

        if (!info) {
          await clearToken().catch(() => {});
          await clearActiveTenant().catch(() => {});
          if (!inAuthFlow) router.replace("/auth/login");
          return;
        }

        const roleFromServer = (info as any)?.role;

        if (!cancelled) {
          setMe({ ...(info.user || {}), role: roleFromServer });
          setTenant(info.tenant || null);
        }

        if ((info as any)?.active_tenant) {
          await setActiveTenant((info as any).active_tenant);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ✅ Guard al navegar */
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
                paddingBottom: inAuthFlow
                  ? 0
                  : TAB_HEIGHT + Math.max(insets.bottom, 8),
              },
              headerStyle: { backgroundColor: COLORS.bg },
              headerTitleStyle: { color: COLORS.text, fontWeight: "800" },
              headerTintColor: COLORS.text,
              headerShadowVisible: false,
              headerRight: () =>
                inAuthFlow ? null : (
                  <View style={{ paddingRight: 8, maxWidth: 360 }}>
                    <TenantPill me={me} tenant={tenant} />
                  </View>
                ),
            }}
          >
            <Stack.Screen name="index" options={{ title: "Inicio" }} />
            <Stack.Screen
              name="calendar/google"
              options={{ title: "Google Calendar" }}
            />
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
    { href: "/", label: "Resumen", icon: "home" as const },
    { href: "/contacts", label: "Contactos", icon: "users" as const },
    { href: "/deals", label: "Oportun.", icon: "briefcase" as const },
    { href: "/tasks", label: "Activ.", icon: "check-square" as const },
    { href: "/calendar", label: "Calend.", icon: "calendar" as const },
    { href: "/more", label: "Más", icon: "grid" as const },
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
            android_ripple={{
              color: "rgba(255,255,255,0.06)",
              borderless: false,
            }}
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
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
  },
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

