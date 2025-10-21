// app/more/index.tsx
import {
  authFetch,
  getActiveTenant,
  logout,
  setActiveTenant,
} from "@/src/api/auth";
import { Stack, router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const BG = "#0b0c10",
  CARD = "#14151a",
  BORDER = "#272a33",
  TEXT = "#e8ecf1",
  SUBTLE = "#a9b0bd",
  ACCENT = "#7c3aed";

type TenantItem = { id: string; name?: string; role?: string };

export default function More() {
  const [tenant, setTenant] = useState<string>("demo");
  const [tenants, setTenants] = useState<TenantItem[]>([{ id: "demo", name: "Demo" }]);
  const [busy, setBusy] = useState<"switch" | "logout" | null>(null);

  // Cargar tenant activo y lista de tenants del usuario
  useEffect(() => {
    (async () => {
      const t = await getActiveTenant();
      setTenant(t);

      try {
        const data = await authFetch<{ items: TenantItem[] }>("/tenants", { method: "GET" });
        if (data?.items?.length) setTenants(data.items);
      } catch {
        // si falla (por permisos o seed), nos quedamos con el fallback
      }
    })();
  }, []);

  const choose = async (t: string) => {
    if (t === tenant || busy) return;       // nada que hacer
    setBusy("switch");
    const prev = tenant;
    setTenant(t);                           // optimistic

    try {
      await authFetch("/tenants/switch", {
        method: "POST",
        body: JSON.stringify({ tenant_id: t }),
      });
      await setActiveTenant(t);             // persistir para próximas requests
    } catch {
      setTenant(prev);                      // rollback si backend niega
    } finally {
      setBusy(null);
    }
  };

  const onLogout = async () => {
    if (busy) return;
    setBusy("logout");
    try {
      await logout();                       // limpia token + tenant
      router.replace("/auth/login");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "Más" }} />

      <Text style={styles.title}>Empresa activa</Text>

      <View style={styles.row}>
        {tenants.map((it) => {
          const active = tenant === it.id;
          return (
            <Pressable
              key={it.id}
              onPress={() => choose(it.id)}
              disabled={busy === "switch"}
              style={[styles.chip, active && styles.chipActive, busy === "switch" && { opacity: 0.6 }]}
              android_ripple={{ color: "rgba(255,255,255,0.08)" }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {it.name || it.id}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.hint}>
        Todas las listas y detalles se filtran por esta empresa.
      </Text>

      <View style={{ height: 24 }} />

      <Pressable onPress={onLogout} disabled={busy === "logout"} style={[styles.logoutBtn, busy === "logout" && { opacity: 0.6 }]}>
        <Text style={styles.logoutTxt}>{busy === "logout" ? "Saliendo…" : "Cerrar sesión"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16 },
  title: { color: TEXT, fontSize: 18, fontWeight: "900", marginBottom: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { color: TEXT, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  hint: { color: SUBTLE, marginTop: 12 },

  logoutBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#ef4444",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  logoutTxt: { color: "white", fontWeight: "800" },
});
