// app/_layout.tsx
import { listOpenActivitiesWithReminder } from "@/src/api/activities";
import {
  me as apiMe,
  clearActiveTenant,
  clearToken,
  fetchTenants,
  getActiveTenant,
  getToken,
  isAuthenticated,
  setActiveTenant,
  subscribeActiveTenant,
} from "@/src/api/auth";
import { ToastProvider } from "@/src/ui/Toast";
import * as Notifs from "@/src/utils/notifications";
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
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
if (__DEV__) {
  require("../src/utils/iosTextDetect");
}
const WEB = {
  background: "#f5f6fa",
  surface: "#ffffff",
  text: "#202536",
  muted: "#737b8e",
  border: "#e7e9f0",
  accent: "#7551c8",
  accentSoft: "#f0ebfb",
};
const TAB_HEIGHT = 64;
const SIDEBAR_WIDTH = 224;
const queryClient = new QueryClient();
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
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
};
const DESKTOP_ITEMS: NavItem[] = [
  // { href: "/", label: "Resumen", icon: "home" },
  { href: "/contacts", label: "Contactos", icon: "users" },
  // { href: "/accounts", label: "Cuentas", icon: "folder" },
  // { href: "/leads", label: "Leads", icon: "user-plus" },
  { href: "/deals", label: "Oportunidades", icon: "briefcase" },
  { href: "/tasks", label: "Actividades", icon: "check-square" },
  { href: "/calendar", label: "Calendario", icon: "calendar" },
];
function routeIsActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname === "";
  return pathname === href || pathname.startsWith(`${href}/`);
}
function pageTitle(pathname: string) {
  if (pathname === "/contacts/new") return "Nuevo contacto";
  if (pathname === "/contacts/all") return "Listado de contactos";
  if (pathname.startsWith("/contacts/")) return "Detalle de contacto";
  if (pathname === "/accounts/new") return "Nueva cuenta";
  if (pathname.startsWith("/accounts/")) return "Detalle de cuenta";
  if (pathname === "/leads/new") return "Nuevo lead";
  if (pathname.startsWith("/leads/")) return "Detalle de lead";
  if (pathname === "/deals/new") return "Nueva oportunidad";
  if (pathname.startsWith("/deals/")) return "Detalle de oportunidad";
  if (pathname === "/tasks/new") return "Nueva actividad";
  if (pathname.startsWith("/tasks/")) return "Detalle de actividad";
  if (pathname === "/calendar/google") return "Google Calendar";
  if (pathname === "/calendar/ics") return "Calendario ICS";
  if (pathname === "/profile") return "Mi perfil";
  if (pathname.startsWith("/more")) return "Configuración";
  return (
    DESKTOP_ITEMS.find((item) =>
      routeIsActive(pathname, item.href)
    )?.label || "CRM"
  );
}
function userInitials(me: MeInfo | null) {
  const name = me?.name || me?.email || "Usuario";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}
function roleLabel(role?: string) {
  switch ((role || "").toLowerCase()) {
    case "owner":
      return "Propietario";
    case "admin":
      return "Administrador";
    case "member":
      return "Miembro";
    default:
      return "Usuario";
  }
}
function useAppFocusSync() {
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state) => {
        if (Platform.OS !== "web") {
          focusManager.setFocused(state === "active");
        }
      }
    );
    return () => subscription.remove();
  }, []);
}
/** Conserva el ajuste de desarrollo para iOS en LAN. */
let iosFetchShimInstalled = false;
function setupIOSDevFetchShim() {
  if (
    !__DEV__ ||
    Platform.OS !== "ios" ||
    iosFetchShimInstalled
  ) {
    return;
  }
  const originalFetch = global.fetch as typeof fetch;
  const hostUri =
    (Constants as any)?.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoGo?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost ||
    "";
  const lanHost =
    typeof hostUri === "string" ? hostUri.split(":")[0] : null;
  if (!lanHost) return;
  const badHostnames = ["localhost", "127.0.0.1"];
  const hostPattern = /^https?:\/\/([^/:]+)(:\d+)?(\/.*)?$/i;
  global.fetch = (async (
    input: any,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input?.url;
    if (typeof url === "string") {
      const match = url.match(hostPattern);
      if (match && badHostnames.includes(match[1])) {
        const schema = url.startsWith("https://") ? "https" : "http";
        const rewritten =
          `${schema}://${lanHost}${match[2] || ""}${match[3] || "/"}`;
        input =
          typeof input === "string"
            ? rewritten
            : new Request(rewritten, input);
      }
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  iosFetchShimInstalled = true;
}
/** JWT decode para presentación inicial. */
function base64UrlToString(input: string) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    base64.length % 4 ? "=".repeat(4 - (base64.length % 4)) : "";
  const value = base64 + padding;
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value);
  }
  const { Buffer } = require("buffer");
  return Buffer.from(value, "base64").toString("utf8");
}
function decodeJwt(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(base64UrlToString(parts[1]));
  } catch {
    return null;
  }
}
/** Indicador que conserva la cabecera móvil. */
function TenantPill({
  me,
  tenant,
}: {
  me: MeInfo | null;
  tenant: TenantInfo | null;
}) {
  const userLabel = me?.name || me?.email || "Usuario";
  const workspaceLabel = tenant?.name || tenant?.id || "Workspace";
  const role = roleLabel(me?.role);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Abrir usuario y workspace"
      onPress={() => router.push("/more")}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 9,
        backgroundColor: "#f0ebfb",
        borderWidth: 1,
        borderColor: "#daceef",
        maxWidth: 220,
        flexShrink: 1,
      }}
    >
      <Feather name="user" size={16} color="#7551c8" />
      <View style={{ flexShrink: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{
            color: "#202536",
            fontWeight: "600",
            fontSize: 12,
          }}
        >
          {userLabel}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: "#7551c8",
            fontSize: 10,
          }}
        >
          {workspaceLabel} · {role}
        </Text>
      </View>
    </Pressable>
  );
}
function DesktopSidebar({
  pathname,
  me,
  tenant,
}: {
  pathname: string;
  me: MeInfo | null;
  tenant: TenantInfo | null;
}) {
  const workspaceLabel =
    tenant?.name || tenant?.id || "Workspace";
  const renderItem = (item: NavItem) => {
    const active = routeIsActive(pathname, item.href);
    return (
      <Pressable
        key={item.href}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: active }}
        onPress={() => router.push(item.href as any)}
        style={({ pressed, hovered }) => [
          styles.sideItem,
          active && styles.sideItemActive,
          (pressed || hovered) && !active && styles.sideItemHover,
        ]}
      >
        <Feather
          name={item.icon}
          size={18}
          color={active ? WEB.accent : WEB.muted}
        />
        <Text
          style={[
            styles.sideItemText,
            active && styles.sideItemTextActive,
          ]}
        >
          {item.label}
        </Text>
        {active && <View style={styles.activeDot} />}
      </Pressable>
    );
  };
  return (
    <View style={styles.sidebar}>
      <Pressable
        accessibilityRole="button"
        // accessibilityLabel="Ir al resumen"
        // onPress={() => router.push("/")}
        accessibilityLabel="Ir a actividades"
        onPress={() => router.push("/tasks")}
        style={styles.brand}
      >
        <View style={styles.brandIcon}>
          <Feather name="layers" size={22} color="#fff" />
        </View>
        <View>
          <Text style={styles.brandName}>CRM</Text>
          <Text style={styles.brandSubtitle}>Gestión comercial</Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Administrar workspace"
        onPress={() => router.push("/more")}
        style={({ pressed, hovered }) => [
          styles.workspaceCard,
          (pressed || hovered) && styles.sideItemHover,
        ]}
      >
        <View style={styles.workspaceIcon}>
          <Feather name="briefcase" size={17} color={WEB.accent} />
        </View>
        <View style={styles.workspaceText}>
          <Text style={styles.workspaceCaption}>WORKSPACE ACTIVO</Text>
          <Text numberOfLines={1} style={styles.workspaceName}>
            {workspaceLabel}
          </Text>
        </View>
        <Feather name="chevron-down" size={15} color={WEB.muted} />
      </Pressable>
      <ScrollView
        style={styles.sidebarScroll}
        contentContainerStyle={styles.sidebarScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.navigationCaption}>ESPACIO DE TRABAJO</Text>
        {DESKTOP_ITEMS.map(renderItem)}
        <View style={styles.navigationDivider} />
        <Text style={styles.navigationCaption}>PREFERENCIAS</Text>
        {renderItem({
          href: "/profile",
          label: "Mi perfil",
          icon: "user",
        })}
        {renderItem({
          href: "/more",
          label: "Configuración",
          icon: "settings",
        })}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir mi perfil"
        onPress={() => router.push("/profile")}
        style={styles.sidebarUser}
      >
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>{userInitials(me)}</Text>
        </View>
        <View style={styles.workspaceText}>
          <Text numberOfLines={1} style={styles.userName}>
            {me?.name || me?.email || "Usuario"}
          </Text>
          <Text style={styles.userRole}>{roleLabel(me?.role)}</Text>
        </View>
        <Feather name="chevron-right" size={15} color={WEB.muted} />
      </Pressable>
    </View>
  );
}
function DesktopHeader({ pathname }: { pathname: string }) {
  const topLevelRoutes = [
    "/",
    "/contacts",
    "/accounts",
    "/leads",
    "/deals",
    "/tasks",
    "/calendar",
    "/more",
    "/profile",
  ];
  const showBack = !topLevelRoutes.includes(pathname);
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    const section = DESKTOP_ITEMS.find(
      (item) =>
        item.href !== "/" &&
        routeIsActive(pathname, item.href)
    );
    router.replace((section?.href || "/") as any);
  };
  return (
    <View style={styles.desktopHeader}>
      <View style={styles.desktopHeaderLeft}>
        {showBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={goBack}
            style={({ pressed, hovered }) => [
              styles.backButton,
              (pressed || hovered) && styles.sideItemHover,
            ]}
          >
            <Feather name="arrow-left" size={18} color={WEB.text} />
          </Pressable>
        )}
        <Text numberOfLines={1} style={styles.desktopPageTitle}>
          {pageTitle(pathname)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir configuración del workspace"
        onPress={() => router.push("/more")}
        style={styles.headerSettings}
      >
        <Feather name="settings" size={16} color={WEB.muted} />
        <Text style={styles.headerSettingsText}>Configuración</Text>
      </Pressable>
    </View>
  );
}
function CompactSidebar({ pathname, me }: { pathname: string; me: MeInfo | null }) {
  const items: NavItem[] = [
    ...DESKTOP_ITEMS,
    { href: "/more", label: "Configuración", icon: "settings" },
  ];
  return (
    <View style={styles.compactSidebar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ir a actividades"
        onPress={() => router.push("/tasks")}
        style={[styles.brandIcon, { marginTop: 18, marginBottom: 26 }]}
      >
        <Feather name="layers" size={22} color="#fff" />
      </Pressable>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {items.map((item) => {
          const active = routeIsActive(pathname, item.href);
          return (
            <Pressable
              key={item.href}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              onPress={() => router.push(item.href as any)}
              style={[styles.compactItem, active && styles.sideItemActive]}
            >
              <Feather name={item.icon} size={21} color={active ? WEB.accent : WEB.muted} />
              <Text style={[styles.compactLabel, active && { color: WEB.accent }]}>
                {item.href === "/more" ? "Ajustes" : item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir mi perfil"
        onPress={() => router.push("/profile")}
        style={[styles.userAvatar, { marginVertical: 16 }]}
      >
        <Text style={styles.userAvatarText}>{userInitials(me)}</Text>
      </Pressable>
    </View>
  );
}

function MobileHeader({ pathname, me, tenant, topInset }: {
  pathname: string;
  me: MeInfo | null;
  tenant: TenantInfo | null;
  topInset: number;
}) {
  const topLevel = ["/", "/contacts", "/deals", "/tasks", "/calendar", "/more", "/profile", "/accounts", "/leads"].includes(pathname);
  return (
    <View style={[styles.mobileHeader, { paddingTop: topInset + 10 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        {!topLevel && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            hitSlop={6}
            style={styles.backButton}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else {
                const section = DESKTOP_ITEMS.find((item) => routeIsActive(pathname, item.href));
                router.replace((section?.href || "/tasks") as any);
              }
            }}
          >
            <Feather name="arrow-left" size={20} color={WEB.text} />
          </Pressable>
        )}
        {topLevel && (
          <View style={[styles.brandIcon, { width: 34, height: 34, borderRadius: 10 }]}>
            <Feather name="layers" size={20} color="#fff" />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text numberOfLines={1} style={{ color: WEB.text, fontSize: 14, fontWeight: "700" }}>
            {topLevel ? "CRM" : pageTitle(pathname)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir configuración del workspace"
            onPress={() => router.push("/more")}
            hitSlop={5}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Text numberOfLines={1} style={{ color: WEB.muted, fontSize: 11, flexShrink: 1 }}>
              {tenant?.name || tenant?.id || "Workspace"}
            </Text>
            <Feather name="chevron-down" size={12} color={WEB.muted} />
          </Pressable>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir perfil de ${me?.name || me?.email || "usuario"}`}
        onPress={() => router.push("/profile")}
        style={styles.userAvatar}
      >
        <Text style={styles.userAvatarText}>{userInitials(me)}</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  useAppFocusSync();
  const pathname = usePathname();
  const inAuthFlow = pathname.startsWith("/auth");
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop =
    Platform.OS === "web" && width >= 1100 && !inAuthFlow;
  const compact = Platform.OS === "web" && width >= 760 && width < 1100 && !inAuthFlow;
  const sideNavigation = desktop || compact;
  const [authReady, setAuthReady] = useState(false);
  const [me, setMe] = useState<MeInfo | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
    // Mantener la barra sincronizada con el workspace guardado.
  useEffect(() => {
    let disposed = false;
    let revision = 0;

    const unsubscribe = subscribeActiveTenant((tenantId) => {
      const currentRevision = ++revision;

      if (!tenantId) {
        setTenant(null);
        setMe(null);
        return;
      }

      // Retirar inmediatamente el nombre del workspace anterior.
      setTenant({ id: tenantId, name: tenantId });

      async function refreshWorkspace() {
        try {
          await queryClient.cancelQueries();

          const [info, workspaces] = await Promise.all([
            apiMe(),
            fetchTenants(),
          ]);

          const activeTenant = await getActiveTenant();

          if (
            disposed ||
            currentRevision !== revision ||
            activeTenant !== tenantId
          ) {
            return;
          }

          const workspace = workspaces.items?.find(
            (item) => item.id === tenantId
          );

          const serverTenant =
            info.tenant?.id === tenantId
              ? info.tenant
              : null;

          setTenant({
            id: tenantId,
            name:
              serverTenant?.name ||
              workspace?.name ||
              tenantId,
          });

          setMe({
            ...(info.user || {}),
            role: info.role || workspace?.role,
          });

          // Volver a consultar los datos usando el nuevo workspace.
          await queryClient.invalidateQueries({
            refetchType: "active",
          });
        } catch {
          if (
            disposed ||
            currentRevision !== revision
          ) {
            return;
          }

          console.warn(
            "No se pudo actualizar la información del workspace."
          );
        }
      }

      void refreshWorkspace();
    });

    return () => {
      disposed = true;
      revision += 1;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setupIOSDevFetchShim();
  }, []);
  // Conserva la inicialización existente de notificaciones.
  useEffect(() => {
    Notifs.initNotifications?.().catch(() => {});
  }, []);
  // Conserva la sincronización existente de recordatorios.
  useEffect(() => {
    if (typeof Notifs.reensurePendingReminders !== "function") return;
    Notifs.reensurePendingReminders(async () => {
      const list = await listOpenActivitiesWithReminder(Date.now());
      return list.map((activity) => ({
        id: activity.id,
        title: activity.title,
        notes: activity.notes ?? null,
        remindAtMs: activity.remindAtMs,
      }));
    }).catch(() => {});
  }, []);
  // Presentación inicial desde JWT y actualización desde backend.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hasSession = await isAuthenticated();
        if (!hasSession) {
          if (!inAuthFlow) router.replace("/auth/login");
          return;
        }
        const token = await getToken();
        if (token) {
          const decoded = decodeJwt(token);
          const jwtEmail = decoded?.email;
          const jwtRole = decoded?.role;
          const jwtTenant = decoded?.active_tenant;
          const storedTenant = await getActiveTenant();
          const effectiveTenant = storedTenant || jwtTenant;
          if (!cancelled) {
            setMe({ email: jwtEmail, role: jwtRole });
            setTenant(
              effectiveTenant
                ? { id: effectiveTenant, name: effectiveTenant }
                : null
            );
          }
          if (effectiveTenant && effectiveTenant !== storedTenant) {
            await setActiveTenant(effectiveTenant);
          }
        }
        const info = await apiMe().catch((error) => {
          console.log(
            "ME ERROR (boot) =>",
            error?.message || error
          );
          return null;
        });
        if (!info) {
          await clearToken().catch(() => {});
          await clearActiveTenant().catch(() => {});
          if (!inAuthFlow) router.replace("/auth/login");
          return;
        }
        const roleFromServer = info.role;
        if (!cancelled) {
          setMe({
            ...(info.user || {}),
            role: roleFromServer,
          });
          setTenant(info.tenant || null);
        }
        if (info.active_tenant) {
          await setActiveTenant(info.active_tenant);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Conserva el bootstrap de una ejecución del layout actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Conserva el control de navegación según sesión.
  useEffect(() => {
    if (!authReady) return;
    (async () => {
      const hasSession = await isAuthenticated();
      if (!hasSession && !inAuthFlow) {
        router.replace("/auth/login");
      }
      if (hasSession && inAuthFlow) {
        router.replace("/");
      }
    })();
  }, [authReady, inAuthFlow, pathname]);
  if (!authReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: WEB.background,
        }}
      />
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <StatusBar style="dark" />
        <View
          style={[
            styles.appContainer,
            sideNavigation && styles.desktopContainer,
          ]}
        >
          {desktop && (
            <DesktopSidebar
              key="desktop-sidebar"
              pathname={pathname}
              me={me}
              tenant={tenant}
            />
          )}
          {compact && <CompactSidebar pathname={pathname} me={me} />}
          <View
            key={`main-content:${tenant?.id || "sin-workspace"}`}
            style={styles.mainContent}
          >
            {sideNavigation && <DesktopHeader pathname={pathname} />}
            {!inAuthFlow && !sideNavigation && (
              <MobileHeader pathname={pathname} me={me} tenant={tenant} topInset={insets.top} />
            )}
            <Stack
              screenOptions={{
                headerShown: inAuthFlow,
                contentStyle: {
                  backgroundColor: WEB.background,
                  paddingBottom: 0,
                },
                headerStyle: {
                  backgroundColor: WEB.surface,
                },
                headerTitleStyle: {
                  color: WEB.text,
                  fontWeight: "800",
                },
                headerTintColor: WEB.text,
                headerShadowVisible: false,
                headerRight: () =>
                  inAuthFlow ? null : (
                    <View
                      style={{
                        paddingRight: 8,
                        maxWidth: 360,
                      }}
                    >
                      <TenantPill me={me} tenant={tenant} />
                    </View>
                  ),
              }}
            >
              <Stack.Screen
                name="index"
                options={{ title: "Inicio" }}
              />
              <Stack.Screen
                name="calendar/google"
                options={{ title: "Google Calendar" }}
              />
            </Stack>
            {!inAuthFlow && !sideNavigation && (
              <BottomBar bottomInset={insets.bottom} />
            )}
          </View>
        </View>
      </ToastProvider>
    </QueryClientProvider>
  );
}
function BottomBar({ bottomInset }: { bottomInset: number }) {
  const pathname = usePathname();
const items: NavItem[] = [
  { href: "/contacts", label: "Contactos", icon: "users" },
  { href: "/deals", label: "Oportunidades", icon: "briefcase" },
  { href: "/tasks", label: "Actividades", icon: "check-square" },
  { href: "/calendar", label: "Calendario", icon: "calendar" },
  { href: "/more", label: "Más", icon: "grid" },
];
  // const items: NavItem[] = [
  //   { href: "/", label: "Resumen", icon: "home" },
  //   { href: "/contacts", label: "Contactos", icon: "users" },
  //   { href: "/deals", label: "Oportunidades", icon: "briefcase" },
  //   { href: "/tasks", label: "Actividades", icon: "check-square" },
  //   { href: "/calendar", label: "Calendario", icon: "calendar" },
  //   { href: "/more", label: "Más", icon: "grid" },
  // ];
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
      {items.map((item) => {
        const active = routeIsActive(pathname, item.href);
        return (
          <Pressable
            key={item.href}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => router.push(item.href as any)}
            style={({ pressed }) => [
              styles.tabItem,
              active && styles.tabItemActive,
              pressed && !active && { opacity: 0.88 },
            ]}
            android_ripple={{
              color: "rgba(117,81,200,0.08)",
              borderless: false,
            }}
          >
            <Feather
              name={item.icon}
              size={20}
              color={active ? WEB.accent : WEB.muted}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.tabLabel,
                {
                  color: active
                    ? WEB.accent
                    : WEB.muted,
                },
              ]}
            >
              {item.label}
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
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  android: { elevation: 3 },
  web: {
    boxShadow: "0 -2px 10px rgba(32,37,54,0.04)",
  } as any,
});
const styles = StyleSheet.create({
  compactSidebar: {
    width: 88,
    backgroundColor: WEB.surface,
    borderRightWidth: 1,
    borderRightColor: WEB.border,
    alignItems: "center",
  },
  compactItem: { width: 76, minHeight: 62, alignItems: "center", justifyContent: "center", borderRadius: 10, gap: 7, paddingHorizontal: 2 },
  compactLabel: { color: WEB.muted, fontSize: 9, textAlign: "center" },
  mobileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 16,
    backgroundColor: WEB.surface,
    borderBottomWidth: 1,
    borderBottomColor: WEB.border,
    flexShrink: 0,
  },
  appContainer: {
    flex: 1,
    backgroundColor: WEB.surface,
  },
  desktopContainer: {
    flexDirection: "row",
    backgroundColor: WEB.background,
  },
  mainContent: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: WEB.surface,
    borderRightWidth: 1,
    borderRightColor: WEB.border,
  },
  brand: {
    height: 82,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  brandIcon: {
    width: 39,
    height: 39,
    borderRadius: 11,
    backgroundColor: WEB.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    color: WEB.text,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    color: WEB.muted,
    fontSize: 10,
    marginTop: 2,
  },
  workspaceCard: {
    marginHorizontal: 14,
    marginBottom: 24,
    padding: 11,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: WEB.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  workspaceIcon: {
    width: 33,
    height: 33,
    backgroundColor: WEB.accentSoft,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  workspaceCaption: {
    color: WEB.muted,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  workspaceName: {
    color: WEB.text,
    fontSize: 12,
    fontWeight: "600",
  },
  sidebarScroll: {
    flex: 1,
  },
  sidebarScrollContent: {
    paddingHorizontal: 13,
    paddingBottom: 20,
    gap: 5,
  },
  navigationCaption: {
    color: "#9299a9",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.9,
    paddingHorizontal: 11,
    marginBottom: 8,
  },
  sideItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 43,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 8,
  },
  sideItemActive: {
    backgroundColor: WEB.accentSoft,
  },
  sideItemHover: {
    backgroundColor: "#f5f6fa",
  },
  sideItemText: {
    flex: 1,
    color: WEB.muted,
    fontSize: 13,
    fontWeight: "500",
  },
  sideItemTextActive: {
    color: WEB.accent,
    fontWeight: "700",
  },
  activeDot: {
    height: 5,
    width: 5,
    borderRadius: 3,
    backgroundColor: WEB.accent,
  },
  navigationDivider: {
    height: 1,
    backgroundColor: WEB.border,
    marginHorizontal: 10,
    marginVertical: 19,
  },
  sidebarUser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: WEB.border,
  },
  userAvatar: {
    width: 35,
    height: 35,
    borderRadius: 10,
    backgroundColor: WEB.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    color: WEB.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  userName: {
    color: WEB.text,
    fontSize: 12,
    fontWeight: "600",
  },
  userRole: {
    color: WEB.muted,
    fontSize: 10,
  },
  desktopHeader: {
    height: 64,
    backgroundColor: WEB.surface,
    borderBottomWidth: 1,
    borderBottomColor: WEB.border,
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
  },
  desktopHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  desktopPageTitle: {
    color: WEB.text,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  backButton: {
    height: 32,
    width: 32,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSettings: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 7,
  },
  headerSettingsText: {
    color: WEB.muted,
    fontSize: 12,
  },
  tenantPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(124,58,237,0.12)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.45)",
    maxWidth: 320,
  },
  tenantPillContent: {
    marginLeft: 8,
    flex: 1,
  },
  tenantPillUser: {
    color: WEB.text,
    fontWeight: "700",
    fontSize: 12,
  },
  tenantPillWorkspace: {
    color: WEB.accent,
    fontSize: 11,
  },
  tabBar: {
    flexShrink: 0,
    backgroundColor: WEB.surface,
    borderTopWidth: 1,
    borderTopColor: WEB.border,
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
    marginHorizontal: 2,
    minWidth: 0,
    borderRadius: 10,
  },
  tabItemActive: {
    backgroundColor: WEB.accentSoft,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: "600",
    textAlign: "center",
  },
});
