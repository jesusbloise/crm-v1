// app/profile/index.tsx
import { authFetch, authHeaders, getActiveTenant } from "@/src/api/auth";
import { getBaseURL } from "@/src/config/baseUrl";
import * as ImagePicker from "expo-image-picker";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

const BG = "#0b0c10",
  CARD = "#14151a",
  BORDER = "#272a33",
  TEXT = "#e8ecf1",
  SUBTLE = "#a9b0bd",
  ACCENT = "#7c3aed",
  OK = "#10b981",
  DANGER = "#ef4444";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || getBaseURL();

type Profile = {
  id: string;
  name: string | null;
  email: string;
  avatar_url?: string | null;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  company?: string | null;
  website?: string | null;
  twitter?: string | null;
  linkedin?: string | null;
  github?: string | null;
  phone?: string | null;
  timezone?: string | null;
  last_login_at?: number | null;
  created_at?: number;
  updated_at?: number;
  workspaces_count?: number;
  owner_count?: number;
};

type TenantMember = {
  id: string;
  name: string | null;
  email: string;
  avatar_url?: string | null;
  headline?: string | null;
  role: "owner" | "admin" | "member";
  member_since?: number;
  member_updated_at?: number;
};

type TenantMembersPayload = {
  tenant: { id: string; name: string; created_by?: string | null; created_at: number };
  items: TenantMember[];
};

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"profile" | "password" | null>(null);
  const [p, setP] = useState<Profile | null>(null);
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");

  // Workspace actual
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [membersData, setMembersData] = useState<TenantMembersPayload | null>(null);
  const [refreshingMembers, setRefreshingMembers] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await authFetch<Profile>("/me/profile");
        setP(data);
      } catch (e: any) {
        Alert.alert("No se pudo cargar tu perfil", e?.message || "Intenta de nuevo.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const t = await getActiveTenant();
      setActiveTenantId(t || null);
      if (t) {
        await loadMembers(t);
      }
    })();
  }, []);

  const loadMembers = async (tenantId: string) => {
    try {
      setRefreshingMembers(true);
      const data = await authFetch<TenantMembersPayload>(`/tenants/${tenantId}/members`);
      setMembersData(data);
    } catch (e: any) {
      // Si no es miembro, backend devuelve forbidden_tenant
      setMembersData(null);
      const msg = e?.message || "";
      if (!/forbidden_tenant/i.test(msg)) {
        console.warn("members fetch:", msg);
      }
    } finally {
      setRefreshingMembers(false);
    }
  };

  const onChange = (k: keyof Profile, v: string) => {
    setP((prev) => (prev ? { ...prev, [k]: v } : prev));
  };

  const onSaveProfile = async () => {
    if (!p) return;
    setSaving("profile");
    try {
      const body: Partial<Profile> = {
        name: p.name ?? "",
        email: p.email,
        avatar_url: p.avatar_url ?? "",
        headline: p.headline ?? "",
        bio: p.bio ?? "",
        location: p.location ?? "",
        company: p.company ?? "",
        website: p.website ?? "",
        twitter: p.twitter ?? "",
        linkedin: p.linkedin ?? "",
        github: p.github ?? "",
        phone: p.phone ?? "",
        timezone: p.timezone ?? "",
      };
      const res = await authFetch<{ ok: boolean; user: Profile }>("/me/profile", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setP(res.user);
      Alert.alert("Listo", "Perfil actualizado.");
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("email_in_use")) {
        Alert.alert("Email en uso", "Ese correo ya está registrado por otro usuario.");
      } else if (msg.includes("invalid_email")) {
        Alert.alert("Correo inválido", "Verifica el formato del correo.");
      } else {
        Alert.alert("No se pudo guardar", msg || "Intenta de nuevo.");
      }
    } finally {
      setSaving(null);
    }
  };

  const onChangePassword = async () => {
    if (!pwdNew || pwdNew.length < 6) {
      Alert.alert("Contraseña débil", "Usa al menos 6 caracteres.");
      return;
    }
    setSaving("password");
    try {
      await authFetch<{ ok: true }>("/me/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: pwdCurrent || undefined,
          new_password: pwdNew,
        }),
      });
      setPwdCurrent("");
      setPwdNew("");
      Alert.alert("Listo", "Contraseña actualizada.");
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("invalid_current_password")) {
        Alert.alert("Actual incorrecta", "Tu contraseña actual no coincide.");
      } else if (msg.includes("current_password_required")) {
        Alert.alert("Requiere contraseña actual", "Ingresa tu contraseña actual.");
      } else {
        Alert.alert("No se pudo cambiar", msg || "Intenta otra vez.");
      }
    } finally {
      setSaving(null);
    }
  };

  // ===== Subida de avatar (iOS/Android/Web) =====
  const pickAndUploadAvatar = async () => {
    try {
      // permisos solo en nativo
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== "granted") {
          Alert.alert("Permiso requerido", "Necesitamos acceso a tus fotos para cambiar el avatar.");
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      const nameGuess =
        asset.fileName || `avatar_${Date.now()}.${(asset.mimeType || "image/jpeg").split("/").pop()}`;
      const typeGuess = asset.mimeType || "image/jpeg";

      const form = new FormData();

      if (Platform.OS === "web") {
        const blob = await (await fetch(uri)).blob();
        form.append("avatar", blob, nameGuess);
      } else {
        form.append("avatar", { uri, name: nameGuess, type: typeGuess } as any);
      }

      const headers = await authHeaders();
      // dejar que fetch ponga multipart boundary
      (headers as any)["Content-Type"] && delete (headers as any)["Content-Type"];

      const res = await fetch(`${API_BASE}/me/avatar`, {
        method: "PUT",
        headers,
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo subir el avatar");

      if (data?.avatar_url) {
        setP((prev) => (prev ? { ...prev, avatar_url: data.avatar_url } : prev));
        Alert.alert("Listo", "Avatar actualizado.");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo cambiar el avatar.");
    }
  };

  // Preview del avatar (urls absolutas, data-uri o rutas relativas del backend /uploads/..)
  const avatarPreview = useMemo(() => {
    const u = p?.avatar_url?.trim();
    if (!u) return null;
    if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:")) return u;
    if (u.startsWith("/")) return `${API_BASE}${u}`;
    return null;
  }, [p?.avatar_url]);

  // Derivar "creado por" desde membersData
  const createdByUser = useMemo(() => {
    if (!membersData?.tenant?.created_by || !membersData?.items) return null;
    return membersData.items.find((m) => m.id === membersData.tenant.created_by) || null;
  }, [membersData]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: "Perfil" }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
      </View>
    );
  }

  if (!p) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: "Perfil" }} />
        <Text style={{ color: TEXT }}>Sin datos de perfil.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "Perfil" }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            tintColor={TEXT}
            refreshing={refreshingMembers}
            onRefresh={() => activeTenantId && loadMembers(activeTenantId)}
          />
        }
      >
        {/* Avatar */}
        <Pressable onPress={pickAndUploadAvatar} style={{ alignSelf: "center", marginBottom: 12 }}>
          <View
            style={{
              height: 80,
              width: 80,
              borderRadius: 999,
              backgroundColor: "#0f1015",
              borderWidth: 1,
              borderColor: BORDER,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {avatarPreview ? (
              <Image source={{ uri: avatarPreview }} style={{ width: "100%", height: "100%" }} />
            ) : (
              <Text style={{ color: SUBTLE, fontWeight: "900", fontSize: 26 }}>
                {(p.name?.[0] || p.email?.[0] || "?").toUpperCase()}
              </Text>
            )}
          </View>
          <Text style={{ color: SUBTLE, fontSize: 11, marginTop: 6, textAlign: "center" }}>
            Cambiar foto
          </Text>
        </Pressable>

        {/* Datos básicos */}
        <View style={styles.card}>
          <Text style={styles.section}>Datos básicos</Text>
          <Field label="Nombre" value={p.name ?? ""} onChangeText={(v) => onChange("name", v)} />
          <Field
            label="Correo"
            value={p.email}
            onChangeText={(v) => onChange("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Avatar URL"
            value={p.avatar_url ?? ""}
            onChangeText={(v) => onChange("avatar_url", v)}
            autoCapitalize="none"
          />
          <Field label="Headline" value={p.headline ?? ""} onChangeText={(v) => onChange("headline", v)} />
          <Multiline label="Bio" value={p.bio ?? ""} onChangeText={(v) => onChange("bio", v)} />
          <Field label="Ubicación" value={p.location ?? ""} onChangeText={(v) => onChange("location", v)} />
          <Field label="Empresa" value={p.company ?? ""} onChangeText={(v) => onChange("company", v)} />
          <Field label="Website" value={p.website ?? ""} onChangeText={(v) => onChange("website", v)} autoCapitalize="none" />
          <Field label="Twitter" value={p.twitter ?? ""} onChangeText={(v) => onChange("twitter", v)} autoCapitalize="none" />
          <Field label="LinkedIn" value={p.linkedin ?? ""} onChangeText={(v) => onChange("linkedin", v)} autoCapitalize="none" />
          <Field label="GitHub" value={p.github ?? ""} onChangeText={(v) => onChange("github", v)} autoCapitalize="none" />
          <Field label="Teléfono" value={p.phone ?? ""} onChangeText={(v) => onChange("phone", v)} keyboardType="phone-pad" />
          <Field label="Zona horaria" value={p.timezone ?? ""} onChangeText={(v) => onChange("timezone", v)} autoCapitalize="none" />

          <Pressable onPress={onSaveProfile} disabled={saving === "profile"} style={[styles.primaryBtn, saving === "profile" && { opacity: 0.6 }]}>
            <Text style={styles.primaryTxt}>{saving === "profile" ? "Guardando…" : "Guardar cambios"}</Text>
          </Pressable>
        </View>

        {/* Seguridad */}
        <View style={styles.card}>
          <Text style={styles.section}>Seguridad</Text>
          <Field
            label="Contraseña actual"
            value={pwdCurrent}
            onChangeText={setPwdCurrent}
            secureTextEntry
            placeholder="(requerida si ya tienes contraseña)"
          />
          <Field label="Nueva contraseña" value={pwdNew} onChangeText={setPwdNew} secureTextEntry placeholder="mínimo 6 caracteres" />
          <Pressable onPress={onChangePassword} disabled={saving === "password"} style={[styles.dangerBtn, saving === "password" && { opacity: 0.6 }]}>
            <Text style={styles.dangerTxt}>{saving === "password" ? "Actualizando…" : "Cambiar contraseña"}</Text>
          </Pressable>
        </View>

        {/* Workspace actual */}
        <View style={styles.card}>
          <Text style={styles.section}>Workspace actual</Text>
          {!activeTenantId ? (
            <Text style={{ color: SUBTLE }}>No hay workspace activo.</Text>
          ) : membersData ? (
            <>
              <Text style={{ color: TEXT, fontWeight: "900" }}>
                {membersData.tenant.name}{" "}
                <Text style={{ color: SUBTLE, fontWeight: "400" }}>
                  (ID: {membersData.tenant.id})
                </Text>
              </Text>
              <View style={{ height: 6 }} />
              <Text style={{ color: SUBTLE }}>
                Miembros:{" "}
                <Text style={{ color: TEXT, fontWeight: "800" }}>
                  {membersData.items.length}
                </Text>
              </Text>
              <View style={{ height: 8 }} />

              {/* Creado por */}
              <View style={[styles.memberRow, { backgroundColor: "#12131a" }]}>
                <View style={styles.avatar}>
                  {createdByUser?.avatar_url ? (
                    <Image source={{ uri: createdByUser.avatar_url }} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Text style={styles.avatarInitial}>
                      {(createdByUser?.name?.[0] || createdByUser?.email?.[0] || "?").toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{createdByUser?.name || "Creador"}</Text>
                  <Text style={styles.memberEmail}>{createdByUser?.email || membersData.tenant.created_by}</Text>
                </View>
                <Text style={[styles.rolePill, { backgroundColor: "#7c3aed33", borderColor: ACCENT }]}>Owner</Text>
              </View>

              {/* Lista de miembros */}
              <View style={{ marginTop: 10, gap: 8 }}>
                {membersData.items.map((m) => {
                  const isCreator = m.id === membersData.tenant.created_by;
                  return (
                    <View key={m.id} style={styles.memberRow}>
                      <View style={styles.avatar}>
                        {m.avatar_url ? (
                          <Image source={{ uri: m.avatar_url }} style={{ width: "100%", height: "100%" }} />
                        ) : (
                          <Text style={styles.avatarInitial}>
                            {(m.name?.[0] || m.email?.[0] || "?").toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>{m.name || "(sin nombre)"}</Text>
                        <Text style={styles.memberEmail}>{m.email}</Text>
                      </View>
                      <Text
                        style={[
                          styles.rolePill,
                          m.role === "owner"
                            ? { backgroundColor: "#7c3aed33", borderColor: ACCENT }
                            : m.role === "admin"
                            ? { backgroundColor: "#22d3ee33", borderColor: "#22d3ee" }
                            : { backgroundColor: "#10b98133", borderColor: OK },
                        ]}
                      >
                        {isCreator ? "owner • creador" : m.role}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={{ color: SUBTLE }}>No se pudo cargar la lista de miembros (¿no perteneces a este workspace?).</Text>
          )}
        </View>

        {/* Metadata */}
        <View style={styles.footerInfo}>
          <Text style={styles.meta}>Creado: {p.created_at ? new Date(p.created_at).toLocaleString() : "—"}</Text>
          <Text style={styles.meta}>Actualizado: {p.updated_at ? new Date(p.updated_at).toLocaleString() : "—"}</Text>
          <Text style={styles.meta}>Último acceso: {p.last_login_at ? new Date(p.last_login_at).toLocaleString() : "—"}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------- UI helpers ---------- */

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
  secureTextEntry?: boolean;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={SUBTLE}
        style={styles.input}
        keyboardType={props.keyboardType ?? "default"}
        secureTextEntry={props.secureTextEntry}
        autoCapitalize={props.autoCapitalize ?? "sentences"}
        autoCorrect={false}
      />
    </View>
  );
}

function Multiline(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={SUBTLE}
        style={[styles.input, { height: 96, textAlignVertical: "top" }]}
        multiline
        numberOfLines={4}
        autoCorrect={false}
      />
    </View>
  );
}

/* ---------- styles ---------- */

const shadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 10 },
  web: { boxShadow: "0 10px 30px rgba(0,0,0,0.35)" } as any,
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  card: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    ...shadow,
  },
  section: { color: TEXT, fontWeight: "900", marginBottom: 10, fontSize: 16 },
  label: { color: TEXT, fontWeight: "800", marginBottom: 6 },
  input: {
    backgroundColor: "#0f1015",
    color: TEXT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 8, default: 10 }),
  },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryTxt: { color: "#fff", fontWeight: "900" },
  dangerBtn: {
    marginTop: 8,
    backgroundColor: DANGER,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  dangerTxt: { color: "#fff", fontWeight: "900" },

  footerInfo: { gap: 4, marginBottom: 24, alignItems: "flex-start" },
  meta: { color: SUBTLE, fontSize: 12 },

  memberRow: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#0f1015",
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    height: 36,
    width: 36,
    borderRadius: 999,
    backgroundColor: "#151622",
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: SUBTLE, fontWeight: "900" },
  memberName: { color: TEXT, fontWeight: "800" },
  memberEmail: { color: SUBTLE, fontSize: 12 },
  rolePill: {
    color: TEXT,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    fontWeight: "900",
  },
});


// // app/profile/index.tsx
// import { authFetch, authHeaders, getActiveTenant } from "@/src/api/auth";
// import * as ImagePicker from "expo-image-picker";
// import { Stack } from "expo-router";
// import { useEffect, useMemo, useState } from "react";
// import {
//     ActivityIndicator,
//     Alert,
//     Image,
//     Platform,
//     Pressable,
//     RefreshControl,
//     ScrollView,
//     StyleSheet,
//     Text,
//     TextInput,
//     View,
// } from "react-native";


// const BG = "#0b0c10",
//   CARD = "#14151a",
//   BORDER = "#272a33",
//   TEXT = "#e8ecf1",
//   SUBTLE = "#a9b0bd",
//   ACCENT = "#7c3aed",
//   OK = "#10b981",
//   DANGER = "#ef4444";

// type Profile = {
//   id: string;
//   name: string | null;
//   email: string;
//   avatar_url?: string | null;
//   headline?: string | null;
//   bio?: string | null;
//   location?: string | null;
//   company?: string | null;
//   website?: string | null;
//   twitter?: string | null;
//   linkedin?: string | null;
//   github?: string | null;
//   phone?: string | null;
//   timezone?: string | null;
//   last_login_at?: number | null;
//   created_at?: number;
//   updated_at?: number;
//   workspaces_count?: number;
//   owner_count?: number;
// };

// type TenantMember = {
//   id: string;
//   name: string | null;
//   email: string;
//   avatar_url?: string | null;
//   headline?: string | null;
//   role: "owner" | "admin" | "member";
//   member_since?: number;
//   member_updated_at?: number;
// };

// type TenantMembersPayload = {
//   tenant: { id: string; name: string; created_by?: string | null; created_at: number };
//   items: TenantMember[];
// };

// export default function ProfileScreen() {
//   const [loading, setLoading] = useState(true);
//   const [saving, setSaving] = useState<"profile" | "password" | null>(null);
//   const [p, setP] = useState<Profile | null>(null);
//   const [pwdCurrent, setPwdCurrent] = useState("");
//   const [pwdNew, setPwdNew] = useState("");

//   // Workspace actual
//   const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
//   const [membersData, setMembersData] = useState<TenantMembersPayload | null>(null);
//   const [refreshingMembers, setRefreshingMembers] = useState(false);

//   useEffect(() => {
//     (async () => {
//       try {
//         const data = await authFetch<Profile>("/me/profile");
//         setP(data);
//       } catch (e: any) {
//         Alert.alert("No se pudo cargar tu perfil", e?.message || "Intenta de nuevo.");
//       } finally {
//         setLoading(false);
//       }
//     })();
//   }, []);

//   useEffect(() => {
//     (async () => {
//       const t = await getActiveTenant();
//       setActiveTenantId(t || null);
//       if (t) {
//         await loadMembers(t);
//       }
//     })();
//   }, []);


//   const loadMembers = async (tenantId: string) => {
//     try {
//       setRefreshingMembers(true);
//       const data = await authFetch<TenantMembersPayload>(`/tenants/${tenantId}/members`);
//       setMembersData(data);
//     } catch (e: any) {
//       // Si no es miembro, backend devuelve forbidden_tenant
//       setMembersData(null);
//       const msg = e?.message || "";
//       if (!/forbidden_tenant/i.test(msg)) {
//         console.warn("members fetch:", msg);
//       }
//     } finally {
//       setRefreshingMembers(false);
//     }
//   };

//   const onChange = (k: keyof Profile, v: string) => {
//     setP((prev) => (prev ? { ...prev, [k]: v } : prev));
//   };

//   const onSaveProfile = async () => {
//     if (!p) return;
//     setSaving("profile");
//     try {
//       const body: Partial<Profile> = {
//         name: p.name ?? "",
//         email: p.email,
//         avatar_url: p.avatar_url ?? "",
//         headline: p.headline ?? "",
//         bio: p.bio ?? "",
//         location: p.location ?? "",
//         company: p.company ?? "",
//         website: p.website ?? "",
//         twitter: p.twitter ?? "",
//         linkedin: p.linkedin ?? "",
//         github: p.github ?? "",
//         phone: p.phone ?? "",
//         timezone: p.timezone ?? "",
//       };
//       const res = await authFetch<{ ok: boolean; user: Profile }>("/me/profile", {
//         method: "PUT",
//         body: JSON.stringify(body),
//       });
//       setP(res.user);
//       Alert.alert("Listo", "Perfil actualizado.");
//     } catch (e: any) {
//       const msg = e?.message || "";
//       if (msg.includes("email_in_use")) {
//         Alert.alert("Email en uso", "Ese correo ya está registrado por otro usuario.");
//       } else if (msg.includes("invalid_email")) {
//         Alert.alert("Correo inválido", "Verifica el formato del correo.");
//       } else {
//         Alert.alert("No se pudo guardar", msg || "Intenta de nuevo.");
//       }
//     } finally {
//       setSaving(null);
//     }
//   };

//   const onChangePassword = async () => {
//     if (!pwdNew || pwdNew.length < 6) {
//       Alert.alert("Contraseña débil", "Usa al menos 6 caracteres.");
//       return;
//     }
//     setSaving("password");
//     try {
//       await authFetch<{ ok: true }>("/me/password", {
//         method: "PUT",
//         body: JSON.stringify({
//           current_password: pwdCurrent || undefined,
//           new_password: pwdNew,
//         }),
//       });
//       setPwdCurrent("");
//       setPwdNew("");
//       Alert.alert("Listo", "Contraseña actualizada.");
//     } catch (e: any) {
//       const msg = e?.message || "";
//       if (msg.includes("invalid_current_password")) {
//         Alert.alert("Actual incorrecta", "Tu contraseña actual no coincide.");
//       } else if (msg.includes("current_password_required")) {
//         Alert.alert("Requiere contraseña actual", "Ingresa tu contraseña actual.");
//       } else {
//         Alert.alert("No se pudo cambiar", msg || "Intenta otra vez.");
//       }
//     } finally {
//       setSaving(null);
//     }
//   };
//   const pickAndUploadAvatar = async () => {
//   try {
//     // 1) Permisos
//     const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
//     if (perm.status !== "granted") {
//       Alert.alert("Permiso requerido", "Necesitamos acceso a tus fotos para cambiar el avatar.");
//       return;
//     }

//     // 2) Elegir imagen
//     const result = await ImagePicker.launchImageLibraryAsync({
//       mediaTypes: ImagePicker.MediaTypeOptions.Images,
//       allowsEditing: true,
//       aspect: [1, 1], // recorte cuadrado
//       quality: 0.9,
//     });
//     if (result.canceled || !result.assets?.length) return;

//     const asset = result.assets[0];
//     const uri = asset.uri;
//     const nameGuess =
//       asset.fileName || `avatar_${Date.now()}.${(asset.mimeType || "image/jpeg").split("/").pop()}`;
//     const typeGuess = asset.mimeType || "image/jpeg";

//     // 3) Subir (multipart)
//     const form = new FormData();
//     form.append("avatar", {
//       // @ts-ignore RN FormData
//       uri,
//       name: nameGuess,
//       type: typeGuess,
//     });

//     // headers con auth, pero sin Content-Type (lo define fetch con boundary)
//     const headers = await authHeaders();
//     // @ts-ignore
//     delete headers["Content-Type"];

//     const res = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL || ""}/me/avatar`, {
//       method: "PUT",
//       headers,
//       body: form,
//     });

//     const data = await res.json().catch(() => ({}));
//     if (!res.ok) throw new Error(data?.error || "No se pudo subir el avatar");

//     // 4) Refrescar UI
//     if (data?.avatar_url) {
//       setP((prev) => (prev ? { ...prev, avatar_url: data.avatar_url } : prev));
//       Alert.alert("Listo", "Avatar actualizado.");
//     }
//   } catch (e: any) {
//     Alert.alert("Error", e?.message || "No se pudo cambiar el avatar.");
//   }
// };


//   const avatarPreview = useMemo(() => {
//     const u = p?.avatar_url?.trim();
//     if (!u) return null;
//     if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:")) return u;
//     return null; // solo previsualizamos URLs absolutas o data-uri
//   }, [p?.avatar_url]);

//   // Derivar "creado por" desde membersData
//   const createdByUser = useMemo(() => {
//     if (!membersData?.tenant?.created_by || !membersData?.items) return null;
//     return membersData.items.find((m) => m.id === membersData.tenant.created_by) || null;
//   }, [membersData]);

//   if (loading) {
//     return (
//       <View style={styles.screen}>
//         <Stack.Screen options={{ title: "Perfil" }} />
//         <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
//           <ActivityIndicator />
//         </View>
//       </View>
//     );
//   }

//   if (!p) {
//     return (
//       <View style={styles.screen}>
//         <Stack.Screen options={{ title: "Perfil" }} />
//         <Text style={{ color: TEXT }}>Sin datos de perfil.</Text>
//       </View>
//     );
//   }

//   return (
//     <View style={styles.screen}>
//       <Stack.Screen options={{ title: "Perfil" }} />
//       <ScrollView
//         contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
//         keyboardShouldPersistTaps="handled"
//         refreshControl={
//           <RefreshControl
//             tintColor={TEXT}
//             refreshing={refreshingMembers}
//             onRefresh={() => activeTenantId && loadMembers(activeTenantId)}
//           />
//         }
//       >
//         <Pressable onPress={pickAndUploadAvatar}>
//   <View
//     style={{
//       height: 64,
//       width: 64,
//       borderRadius: 999,
//       backgroundColor: "#0f1015",
//       borderWidth: 1,
//       borderColor: BORDER,
//       overflow: "hidden",
//       alignItems: "center",
//       justifyContent: "center",
//     }}
//   >
//     {avatarPreview ? (
//       <Image source={{ uri: avatarPreview }} style={{ width: "100%", height: "100%" }} />
//     ) : (
//       <Text style={{ color: SUBTLE, fontWeight: "900", fontSize: 20 }}>
//         {(p.name?.[0] || p.email?.[0] || "?").toUpperCase()}
//       </Text>
//     )}
//   </View>
//   <Text style={{ color: SUBTLE, fontSize: 11, marginTop: 4, textAlign: "center" }}>
//     Cambiar foto
//   </Text>
// </Pressable>

//         {/* Header
//         <View style={[styles.card, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
//           <View
//             style={{
//               height: 64,
//               width: 64,
//               borderRadius: 999,
//               backgroundColor: "#0f1015",
//               borderWidth: 1,
//               borderColor: BORDER,
//               overflow: "hidden",
//               alignItems: "center",
//               justifyContent: "center",
//             }}
//           >
//             {avatarPreview ? (
//               <Image source={{ uri: avatarPreview }} style={{ width: "100%", height: "100%" }} />
//             ) : (
//               <Text style={{ color: SUBTLE, fontWeight: "900", fontSize: 20 }}>
//                 {(p.name?.[0] || p.email?.[0] || "?").toUpperCase()}
//               </Text>
//             )}
//           </View>
//           <View style={{ flex: 1 }}>
//             <Text style={styles.title}>{p.name || "Sin nombre"}</Text>
//             <Text style={styles.mono}>{p.email}</Text>
//             <Text style={{ color: SUBTLE, marginTop: 4 }}>
//               Workspaces: <Text style={{ color: TEXT, fontWeight: "900" }}>{p.workspaces_count ?? 0}</Text>
//               {"   "}Owner: <Text style={{ color: TEXT, fontWeight: "900" }}>{p.owner_count ?? 0}</Text>
//             </Text>
//           </View>
//         </View> */}

//         {/* Datos básicos */}
//         <View style={styles.card}>
//           <Text style={styles.section}>Datos básicos</Text>
//           <Field label="Nombre" value={p.name ?? ""} onChangeText={(v) => onChange("name", v)} />
//           <Field label="Correo" value={p.email} onChangeText={(v) => onChange("email", v)} keyboardType="email-address" />
//           <Field label="Avatar URL" value={p.avatar_url ?? ""} onChangeText={(v) => onChange("avatar_url", v)} />
//           <Field label="Headline" value={p.headline ?? ""} onChangeText={(v) => onChange("headline", v)} />
//           <Multiline label="Bio" value={p.bio ?? ""} onChangeText={(v) => onChange("bio", v)} />
//           <Field label="Ubicación" value={p.location ?? ""} onChangeText={(v) => onChange("location", v)} />
//           <Field label="Empresa" value={p.company ?? ""} onChangeText={(v) => onChange("company", v)} />
//           <Field label="Website" value={p.website ?? ""} onChangeText={(v) => onChange("website", v)} autoCapitalize="none" />
//           <Field label="Twitter" value={p.twitter ?? ""} onChangeText={(v) => onChange("twitter", v)} autoCapitalize="none" />
//           <Field label="LinkedIn" value={p.linkedin ?? ""} onChangeText={(v) => onChange("linkedin", v)} autoCapitalize="none" />
//           <Field label="GitHub" value={p.github ?? ""} onChangeText={(v) => onChange("github", v)} autoCapitalize="none" />
//           <Field label="Teléfono" value={p.phone ?? ""} onChangeText={(v) => onChange("phone", v)} keyboardType="phone-pad" />
//           <Field label="Zona horaria" value={p.timezone ?? ""} onChangeText={(v) => onChange("timezone", v)} autoCapitalize="none" />

//           <Pressable
//             onPress={onSaveProfile}
//             disabled={saving === "profile"}
//             style={[styles.primaryBtn, saving === "profile" && { opacity: 0.6 }]}
//           >
//             <Text style={styles.primaryTxt}>
//               {saving === "profile" ? "Guardando…" : "Guardar cambios"}
//             </Text>
//           </Pressable>
//         </View>

//         {/* Seguridad */}
//         <View style={styles.card}>
//           <Text style={styles.section}>Seguridad</Text>
//           <Field
//             label="Contraseña actual"
//             value={pwdCurrent}
//             onChangeText={setPwdCurrent}
//             secureTextEntry
//             placeholder="(requerida si ya tienes contraseña)"
//           />
//           <Field
//             label="Nueva contraseña"
//             value={pwdNew}
//             onChangeText={setPwdNew}
//             secureTextEntry
//             placeholder="mínimo 6 caracteres"
//           />
//           <Pressable
//             onPress={onChangePassword}
//             disabled={saving === "password"}
//             style={[styles.dangerBtn, saving === "password" && { opacity: 0.6 }]}
//           >
//             <Text style={styles.dangerTxt}>
//               {saving === "password" ? "Actualizando…" : "Cambiar contraseña"}
//             </Text>
//           </Pressable>
//         </View>

//         {/* Workspace actual */}
//         <View style={styles.card}>
//           <Text style={styles.section}>Workspace actual</Text>
//           {!activeTenantId ? (
//             <Text style={{ color: SUBTLE }}>No hay workspace activo.</Text>
//           ) : membersData ? (
//             <>
//               <Text style={{ color: TEXT, fontWeight: "900" }}>
//                 {membersData.tenant.name}{" "}
//                 <Text style={{ color: SUBTLE, fontWeight: "400" }}>
//                   (ID: {membersData.tenant.id})
//                 </Text>
//               </Text>
//               <View style={{ height: 6 }} />
//               <Text style={{ color: SUBTLE }}>
//                 Miembros:{" "}
//                 <Text style={{ color: TEXT, fontWeight: "800" }}>
//                   {membersData.items.length}
//                 </Text>
//               </Text>
//               <View style={{ height: 8 }} />

//               {/* Creado por */}
//               <View style={[styles.memberRow, { backgroundColor: "#12131a" }]}>
//                 <View style={styles.avatar}>
//                   {createdByUser?.avatar_url ? (
//                     <Image source={{ uri: createdByUser.avatar_url }} style={{ width: "100%", height: "100%" }} />
//                   ) : (
//                     <Text style={styles.avatarInitial}>
//                       {(createdByUser?.name?.[0] || createdByUser?.email?.[0] || "?").toUpperCase()}
//                     </Text>
//                   )}
//                 </View>
//                 <View style={{ flex: 1 }}>
//                   <Text style={styles.memberName}>
//                     {createdByUser?.name || "Creador"}
//                   </Text>
//                   <Text style={styles.memberEmail}>{createdByUser?.email || membersData.tenant.created_by}</Text>
//                 </View>
//                 <Text style={[styles.rolePill, { backgroundColor: "#7c3aed33", borderColor: ACCENT }]}>
//                   Owner
//                 </Text>
//               </View>

//               {/* Lista de miembros */}
//               <View style={{ marginTop: 10, gap: 8 }}>
//                 {membersData.items.map((m) => {
//                   const isCreator = m.id === membersData.tenant.created_by;
//                   return (
//                     <View key={m.id} style={styles.memberRow}>
//                       <View style={styles.avatar}>
//                         {m.avatar_url ? (
//                           <Image source={{ uri: m.avatar_url }} style={{ width: "100%", height: "100%" }} />
//                         ) : (
//                           <Text style={styles.avatarInitial}>
//                             {(m.name?.[0] || m.email?.[0] || "?").toUpperCase()}
//                           </Text>
//                         )}
//                       </View>
//                       <View style={{ flex: 1 }}>
//                         <Text style={styles.memberName}>{m.name || "(sin nombre)"}</Text>
//                         <Text style={styles.memberEmail}>{m.email}</Text>
//                       </View>
//                       <Text
//                         style={[
//                           styles.rolePill,
//                           m.role === "owner"
//                             ? { backgroundColor: "#7c3aed33", borderColor: ACCENT }
//                             : m.role === "admin"
//                             ? { backgroundColor: "#22d3ee33", borderColor: "#22d3ee" }
//                             : { backgroundColor: "#10b98133", borderColor: OK },
//                         ]}
//                       >
//                         {isCreator ? "owner • creador" : m.role}
//                       </Text>
//                     </View>
//                   );
//                 })}
//               </View>
//             </>
//           ) : (
//             <Text style={{ color: SUBTLE }}>
//               No se pudo cargar la lista de miembros (¿no perteneces a este workspace?).
//             </Text>
//           )}
//         </View>

//         {/* Metadata */}
//         <View style={styles.footerInfo}>
//           <Text style={styles.meta}>
//             Creado: {p.created_at ? new Date(p.created_at).toLocaleString() : "—"}
//           </Text>
//           <Text style={styles.meta}>
//             Actualizado: {p.updated_at ? new Date(p.updated_at).toLocaleString() : "—"}
//           </Text>
//           <Text style={styles.meta}>
//             Último acceso: {p.last_login_at ? new Date(p.last_login_at).toLocaleString() : "—"}
//           </Text>
//         </View>
//       </ScrollView>
//     </View>
//   );
// }

// /* ---------- UI helpers ---------- */

// function Field(props: {
//   label: string;
//   value: string;
//   onChangeText: (v: string) => void;
//   keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
//   secureTextEntry?: boolean;
//   placeholder?: string;
//   autoCapitalize?: "none" | "sentences" | "words" | "characters";
// }) {
//   return (
//     <View style={{ marginBottom: 12 }}>
//       <Text style={styles.label}>{props.label}</Text>
//       <TextInput
//         value={props.value}
//         onChangeText={props.onChangeText}
//         placeholder={props.placeholder}
//         placeholderTextColor={SUBTLE}
//         style={styles.input}
//         keyboardType={props.keyboardType ?? "default"}
//         secureTextEntry={props.secureTextEntry}
//         autoCapitalize={props.autoCapitalize ?? "sentences"}
//         autoCorrect={false}
//       />
//     </View>
//   );
// }

// function Multiline(props: {
//   label: string;
//   value: string;
//   onChangeText: (v: string) => void;
//   placeholder?: string;
// }) {
//   return (
//     <View style={{ marginBottom: 12 }}>
//       <Text style={styles.label}>{props.label}</Text>
//       <TextInput
//         value={props.value}
//         onChangeText={props.onChangeText}
//         placeholder={props.placeholder}
//         placeholderTextColor={SUBTLE}
//         style={[styles.input, { height: 96, textAlignVertical: "top" }]}
//         multiline
//         numberOfLines={4}
//         autoCorrect={false}
//       />
//     </View>
//   );
// }

// /* ---------- styles ---------- */

// const shadow = Platform.select({
//   ios: { shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
//   android: { elevation: 10 },
//   web: { boxShadow: "0 10px 30px rgba(0,0,0,0.35)" } as any,
// });

// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG },
//   card: {
//     backgroundColor: CARD,
//     borderColor: BORDER,
//     borderWidth: 1,
//     borderRadius: 14,
//     padding: 14,
//     marginBottom: 16,
//     ...shadow,
//   },
//   title: { color: TEXT, fontSize: 18, fontWeight: "900" },
//   section: { color: TEXT, fontWeight: "900", marginBottom: 10, fontSize: 16 },
//   label: { color: TEXT, fontWeight: "800", marginBottom: 6 },
//   input: {
//     backgroundColor: "#0f1015",
//     color: TEXT,
//     borderRadius: 10,
//     borderWidth: 1,
//     borderColor: BORDER,
//     paddingHorizontal: 12,
//     paddingVertical: Platform.select({ ios: 12, android: 8, default: 10 }),
//   },
//   mono: { color: SUBTLE, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) as any },
//   primaryBtn: {
//     marginTop: 8,
//     backgroundColor: ACCENT,
//     borderRadius: 12,
//     paddingVertical: 12,
//     alignItems: "center",
//   },
//   primaryTxt: { color: "#fff", fontWeight: "900" },
//   dangerBtn: {
//     marginTop: 8,
//     backgroundColor: DANGER,
//     borderRadius: 12,
//     paddingVertical: 12,
//     alignItems: "center",
//   },
//   dangerTxt: { color: "#fff", fontWeight: "900" },

//   footerInfo: { gap: 4, marginBottom: 24, alignItems: "flex-start" },
//   meta: { color: SUBTLE, fontSize: 12 },

//   memberRow: {
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: "#0f1015",
//     borderRadius: 12,
//     padding: 10,
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 10,
//   },
//   avatar: {
//     height: 36,
//     width: 36,
//     borderRadius: 999,
//     backgroundColor: "#151622",
//     borderWidth: 1,
//     borderColor: BORDER,
//     overflow: "hidden",
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   avatarInitial: { color: SUBTLE, fontWeight: "900" },
//   memberName: { color: TEXT, fontWeight: "800" },
//   memberEmail: { color: SUBTLE, fontSize: 12 },
//   rolePill: {
//     color: TEXT,
//     borderWidth: 1,
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     borderRadius: 999,
//     overflow: "hidden",
//     fontWeight: "900",
//   },
// });

