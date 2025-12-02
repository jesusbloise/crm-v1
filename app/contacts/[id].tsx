// app/contacts/[id].tsx
import {
  createContact,
  deleteContact,
  getContact,
  updateContact,
} from "@/src/api/contacts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// 🔗 Relacionados (actividades y notas)
import RelatedActivities from "@/src/components/RelatedActivities";
import RelatedNotes from "@/src/components/RelatedNotes";

// 🔹 Miembros reales del workspace
import {
  listWorkspaceMembers,
  type WorkspaceMember,
} from "@/src/api/workspaceMembers";

// 🔹 Workspaces (los mismos que usas en Tasks)
import {
  fetchTenants,
  getActiveTenant,
  switchTenant,
} from "@/src/api/auth";

import { uid } from "@/src/utils/uid";

/* 🎨 Tema consistente */
const BG = "#0b0c10";
const CARD = "#14151a";
const FIELD = "#121318";
const BORDER = "#272a33";
const TEXT = "#e8ecf1";
const SUBTLE = "#a9b0bd";
const ACCENT = "#7c3aed"; // primario (morado)
const DANGER = "#ef4444"; // eliminar / errores

type ClientType = "productora" | "agencia" | "directo" | "";

type TenantItem = {
  id: string;
  name?: string;
};

export default function ContactDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = Array.isArray(id) ? id[0] : id;

  if (!contactId || contactId === "index") {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Detalle Contacto",
            headerStyle: { backgroundColor: BG },
            headerTintColor: TEXT,
            headerTitleStyle: { color: TEXT, fontWeight: "800" },
          }}
        />
        <View style={styles.screen}>
          <Text style={{ color: SUBTLE }}>Ruta inválida</Text>
        </View>
      </>
    );
  }

  const qc = useQueryClient();

  // Contacto
  const q = useQuery({
    queryKey: ["contact", contactId],
    queryFn: () => getContact(contactId),
  });

  // Miembros del workspace
  const qMembers = useQuery({
    queryKey: ["workspaceMembers"],
    queryFn: listWorkspaceMembers,
  });
  const members: WorkspaceMember[] = qMembers.data ?? [];

  // ---------- Estado local de edición ----------
  const [name, setName] = useState("");
  const [clientType, setClientType] = useState<ClientType>("");
  const [companyText, setCompanyText] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // ---------- Workspaces: lista + seleccionados (para clonar) ----------
  const [workspaces, setWorkspaces] = useState<TenantItem[]>([]);
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<string[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);

  // Precargar valores cuando llega el contacto
  useEffect(() => {
    if (q.data) {
      setName(q.data.name ?? "");

      const ct = (q.data as any).client_type;
      if (ct === "productora" || ct === "agencia" || ct === "directo") {
        setClientType(ct);
      } else {
        setClientType("");
      }

      setCompanyText(q.data.company ?? "");
      setPosition(q.data.position ?? "");
      setEmail(q.data.email ?? "");
      setPhone(q.data.phone ?? "");
    }
  }, [q.data]);

  // Cargar workspaces disponibles y marcar el activo por defecto
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoadingWorkspaces(true);

        const data = await fetchTenants();
        const items: TenantItem[] =
          data?.items?.map((t: any) => ({ id: t.id, name: t.name })) ?? [];
        if (!cancelled) {
          setWorkspaces(items);
        }

        // marcar workspace activo actual
        const activeFromServer = data?.active_tenant || null;
        const activeLocal = await getActiveTenant();
        const active = activeFromServer || activeLocal || null;

        if (!cancelled && active) {
          setSelectedWorkspaces([active]);
        }
      } catch (e) {
        console.warn("⚠️ Error cargando workspaces:", e);
      } finally {
        if (!cancelled) setLoadingWorkspaces(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Helper confirm
  const confirm = async (title: string, message: string): Promise<boolean> => {
    if (Platform.OS === "web") {
      return window.confirm(`${title}\n\n${message}`);
    }
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
        { text: "Confirmar", style: "destructive", onPress: () => resolve(true) },
      ]);
    });
  };

  // Guardar cambios + clonar a otros workspaces seleccionados
  const mUpd = useMutation({
    mutationFn: async () => {
      const baseData: any = {
        name: name.trim() || undefined,
        company: companyText || undefined,
        position: position || undefined,
        email: email || undefined,
        phone: phone || undefined,
        client_type: clientType || undefined,
      };

      // 1) Actualizar contacto en el workspace actual
      await updateContact(contactId, baseData);

      // 2) Clonar a otros workspaces (como en NewContact)
      //    OJO: este diseño NO sabe en qué WS ya existe; por ahora
      //    solo crea copias nuevas en los WS seleccionados distintos del activo.
      const activeTenant = await getActiveTenant();
      const targetTenants = (selectedWorkspaces.length
        ? selectedWorkspaces
        : activeTenant
        ? [activeTenant]
        : []
      ).filter((tid) => tid && tid !== activeTenant);

      for (const tenantId of targetTenants) {
        try {
          await switchTenant(tenantId);
          await createContact({
            id: uid(),
            ...baseData,
          } as any);
        } catch (e) {
          console.warn("❌ Error clonando contacto en workspace:", tenantId, e);
        }
      }

      // 3) Volver al workspace original si lo teníamos
      if (activeTenant) {
        try {
          await switchTenant(activeTenant);
        } catch (e) {
          console.warn("⚠️ No se pudo volver al workspace original:", e);
        }
      }
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contact", contactId] }),
        qc.invalidateQueries({ queryKey: ["contacts"] }),
        qc.invalidateQueries({ queryKey: ["contacts-all"] }),
      ]);
    },
  });

  const mDel = useMutation({
    mutationFn: async () => deleteContact(contactId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contacts"] });
      await qc.invalidateQueries({ queryKey: ["contacts-all"] });
      router.back();
    },
  });

  const cid = contactId as string;

  const handleSavePress = async () => {
    const ok = await confirm(
      "Guardar cambios",
      "¿Seguro quieres guardar los cambios de este contacto? (si marcaste otros workspaces se crearán copias allí)"
    );
    if (!ok) return;
    mUpd.mutate();
  };

  const handleDeletePress = async () => {
    const ok = await confirm(
      "Eliminar contacto",
      "Si confirmas se eliminará el contacto y sus actividades en este workspace. ¿Deseas continuar?"
    );
    if (!ok) return;
    mDel.mutate();
  };

  // Toggle de chips de WS
  const toggleWorkspace = (wsId: string) => {
    setSelectedWorkspaces((prev) =>
      prev.includes(wsId) ? prev.filter((x) => x !== wsId) : [...prev, wsId]
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Detalle Contacto",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: BG }}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {q.isLoading ? (
          <Text style={{ color: SUBTLE }}>Cargando...</Text>
        ) : q.isError ? (
          <>
            <Text style={{ color: "#fecaca", marginBottom: 8 }}>
              Error: {String((q.error as any)?.message || q.error)}
            </Text>
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => q.refetch()}
            >
              <Text style={styles.btnText}>Reintentar</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => router.back()}
            >
              <Text style={styles.btnText}>Volver</Text>
            </Pressable>
          </>
        ) : !q.data ? (
          <Text style={{ color: SUBTLE }}>No encontrado</Text>
        ) : (
          <>
            {/* Nombre */}
            <Text style={styles.section}>Datos del contacto</Text>
            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={[styles.input, styles.nameInput]}
              value={name}
              onChangeText={setName}
              placeholder="Nombre del contacto"
              placeholderTextColor={SUBTLE}
            />

            {/* Creador */}
            {q.data.created_by_name && (
              <View style={styles.creatorBox}>
                <Text style={styles.creatorLabel}>Creado por:</Text>
                <Text style={styles.creatorName}>{q.data.created_by_name}</Text>
                {q.data.created_by_email && (
                  <Text style={styles.creatorEmail}>
                    {q.data.created_by_email}
                  </Text>
                )}
              </View>
            )}

            {/* Cliente: Productora / Agencia / Cliente directo */}
            <Text style={styles.label}>Cliente</Text>
            <View style={styles.clientTypeRow}>
              {(["productora", "agencia", "directo"] as const).map((t) => {
                const active = clientType === t;
                const label =
                  t === "productora"
                    ? "Productora"
                    : t === "agencia"
                    ? "Agencia"
                    : "Cliente directo";

                return (
                  <Pressable
                    key={t}
                    onPress={() =>
                      setClientType((prev) => (prev === t ? "" : t))
                    }
                    style={[
                      styles.clientTypeChip,
                      active && styles.clientTypeChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.clientTypeText,
                        active && styles.clientTypeTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Empresa */}
            <Text style={styles.label}>Empresa</Text>
            <TextInput
              placeholder="Empresa"
              value={companyText}
              onChangeText={setCompanyText}
              style={styles.input}
              placeholderTextColor={SUBTLE}
            />

            {/* Cargo */}
            <Text style={styles.label}>Cargo</Text>
            <TextInput
              placeholder="Cargo"
              value={position}
              onChangeText={setPosition}
              style={styles.input}
              placeholderTextColor={SUBTLE}
            />

            {/* Email */}
            <Text style={styles.label}>Email</Text>
            <TextInput
              placeholder="usuario@dominio.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              placeholderTextColor={SUBTLE}
            />

            {/* Teléfono */}
            <Text style={styles.label}>Teléfono</Text>
            <TextInput
              placeholder="+58 412 000 0000"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={styles.input}
              placeholderTextColor={SUBTLE}
            />

            {/* 🔹 Workspaces donde quieres ver este contacto */}
            <Text style={styles.label}>Workspaces</Text>
            {loadingWorkspaces ? (
              <Text style={styles.subtle}>Cargando workspaces…</Text>
            ) : workspaces.length === 0 ? (
              <Text style={styles.subtle}>
                No tienes workspaces creados todavía.
              </Text>
            ) : (
              <View style={styles.wsRow}>
                {workspaces.map((ws) => {
                  const active = selectedWorkspaces.includes(ws.id);
                  return (
                    <Pressable
                      key={ws.id}
                      onPress={() => toggleWorkspace(ws.id)}
                      style={[
                        styles.wsChip,
                        active && styles.wsChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.wsChipText,
                          active && styles.wsChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {ws.name || ws.id}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Relacionados */}
            <Text style={styles.section}>Actividades</Text>
            <RelatedActivities filters={{ contact_id: cid }} members={members} />

            <Text style={styles.section}>Notas</Text>
            <RelatedNotes filters={{ contact_id: cid }} />

            {/* Acciones */}
            <Pressable
              style={[
                styles.btn,
                styles.btnPrimary,
                (mUpd.isPending || mDel.isPending) && { opacity: 0.9 },
              ]}
              onPress={handleSavePress}
              disabled={mUpd.isPending || mDel.isPending}
            >
              <Text style={styles.btnText}>
                {mUpd.isPending ? "Guardando..." : "Guardar cambios"}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.btn,
                styles.btnDanger,
                (mUpd.isPending || mDel.isPending) && { opacity: 0.9 },
              ]}
              onPress={handleDeletePress}
              disabled={mDel.isPending || mUpd.isPending}
            >
              <Text style={styles.btnText}>
                {mDel.isPending ? "Eliminando..." : "Eliminar"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 8 },

  container: {
    padding: 12,
    paddingBottom: 120,
    gap: 8,
  },

  subtle: { color: SUBTLE },

  // Creador
  creatorBox: {
    backgroundColor: "rgba(34, 211, 238, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(34, 211, 238, 0.2)",
    borderRadius: 10,
    padding: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  creatorLabel: {
    color: "#22d3ee",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  creatorName: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "800",
  },
  creatorEmail: {
    color: SUBTLE,
    fontSize: 11,
    marginTop: 1,
  },

  label: {
    color: TEXT,
    fontWeight: "800",
    marginTop: 4,
  },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
    fontSize: 13,
  },
  nameInput: {
    fontSize: 17,
    fontWeight: "900",
  },

  section: {
    marginTop: 8,
    fontWeight: "900",
    fontSize: 15,
    color: TEXT,
  },

  // Cliente: productora / agencia / directo
  clientTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  clientTypeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },
  clientTypeChipActive: {
    borderColor: ACCENT,
    backgroundColor: "rgba(124,58,237,0.25)",
  },
  clientTypeText: {
    color: SUBTLE,
    fontWeight: "700",
    fontSize: 11,
  },
  clientTypeTextActive: {
    color: "#fff",
  },

  // Workspaces chips
  wsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  wsChip: {
    minWidth: 110,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  wsChipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  wsChipText: {
    color: TEXT,
    fontWeight: "800",
    fontSize: 12,
  },
  wsChipTextActive: {
    color: "#fff",
  },

  btn: { marginTop: 10, padding: 11, borderRadius: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "900" },
  btnPrimary: {
    backgroundColor: ACCENT,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  btnDanger: { backgroundColor: DANGER },
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
});


// // app/contacts/[id].tsx
// import { deleteContact, getContact, updateContact } from "@/src/api/contacts";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { Stack, router, useLocalSearchParams } from "expo-router";
// import { useEffect, useState } from "react";
// import {
//   Alert,
//   Platform,
//   Pressable,
//   ScrollView,
//   StyleSheet,
//   Text,
//   TextInput,
//   View,
// } from "react-native";

// // 🔗 Relacionados (actividades y notas)
// import RelatedActivities from "@/src/components/RelatedActivities";
// import RelatedNotes from "@/src/components/RelatedNotes";

// // 🔹 Miembros reales del workspace
// import {
//   listWorkspaceMembers,
//   type WorkspaceMember,
// } from "@/src/api/workspaceMembers";

// /* 🎨 Tema consistente */
// const BG = "#0b0c10";
// const CARD = "#14151a";
// const FIELD = "#121318";
// const BORDER = "#272a33";
// const TEXT = "#e8ecf1";
// const SUBTLE = "#a9b0bd";
// const ACCENT = "#7c3aed"; // primario (morado)
// const DANGER = "#ef4444"; // eliminar / errores

// export default function ContactDetail() {
//   const { id } = useLocalSearchParams<{ id?: string | string[] }>();
//   const contactId = Array.isArray(id) ? id[0] : id;

//   if (!contactId || contactId === "index") {
//     return (
//       <>
//         <Stack.Screen
//           options={{
//             title: "Detalle Contacto",
//             headerStyle: { backgroundColor: BG },
//             headerTintColor: TEXT,
//             headerTitleStyle: { color: TEXT, fontWeight: "800" },
//           }}
//         />
//         <View style={styles.screen}>
//           <Text style={{ color: SUBTLE }}>Ruta inválida</Text>
//         </View>
//       </>
//     );
//   }

//   const qc = useQueryClient();

//   // Contacto
//   const q = useQuery({
//     queryKey: ["contact", contactId],
//     queryFn: () => getContact(contactId),
//   });

//   // Miembros del workspace
//   const qMembers = useQuery({
//     queryKey: ["workspaceMembers"],
//     queryFn: listWorkspaceMembers,
//   });
//   const members: WorkspaceMember[] = qMembers.data ?? [];

//   // Estado local de edición
//   const [name, setName] = useState("");
//   const [clientType, setClientType] = useState<
//     "productora" | "agencia" | "directo" | ""
//   >("");
//   const [companyText, setCompanyText] = useState("");
//   const [position, setPosition] = useState("");
//   const [email, setEmail] = useState("");
//   const [phone, setPhone] = useState("");

//   // Precargar valores cuando llega el contacto
//   useEffect(() => {
//     if (q.data) {
//       setName(q.data.name ?? "");

//       const ct = (q.data as any).client_type;
//       if (ct === "productora" || ct === "agencia" || ct === "directo") {
//         setClientType(ct);
//       } else {
//         setClientType("");
//       }

//       setCompanyText(q.data.company ?? "");
//       setPosition(q.data.position ?? "");
//       setEmail(q.data.email ?? "");
//       setPhone(q.data.phone ?? "");
//     }
//   }, [q.data]);

//   // Helper confirm
//   const confirm = async (title: string, message: string): Promise<boolean> => {
//     if (Platform.OS === "web") {
//       return window.confirm(`${title}\n\n${message}`);
//     }
//     return new Promise((resolve) => {
//       Alert.alert(title, message, [
//         { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
//         { text: "Confirmar", style: "destructive", onPress: () => resolve(true) },
//       ]);
//     });
//   };

//   const mUpd = useMutation({
//     mutationFn: async () =>
//       updateContact(
//         contactId,
//         {
//           name: name.trim() || undefined,
//           company: companyText || undefined,
//           position: position || undefined,
//           email: email || undefined,
//           phone: phone || undefined,
//           client_type: clientType || undefined,
//         } as any
//       ),
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["contact", contactId] });
//       await qc.invalidateQueries({ queryKey: ["contacts"] });
//     },
//   });

//   const mDel = useMutation({
//     mutationFn: async () => deleteContact(contactId),
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["contacts"] });
//       router.back();
//     },
//   });

//   const cid = contactId as string;

//   const handleSavePress = async () => {
//     const ok = await confirm(
//       "Guardar cambios",
//       "¿Seguro quieres guardar los cambios de este contacto?"
//     );
//     if (!ok) return;
//     mUpd.mutate();
//   };

//   const handleDeletePress = async () => {
//     const ok = await confirm(
//       "Eliminar contacto",
//       "Si confirmas se eliminará el contacto y sus actividades. ¿Deseas continuar?"
//     );
//     if (!ok) return;
//     mDel.mutate();
//   };

//   return (
//     <>
//       <Stack.Screen
//         options={{
//           title: "Detalle Contacto",
//           headerStyle: { backgroundColor: BG },
//           headerTintColor: TEXT,
//           headerTitleStyle: { color: TEXT, fontWeight: "800" },
//         }}
//       />
//       <ScrollView
//         style={{ flex: 1, backgroundColor: BG }}
//         contentContainerStyle={styles.container}
//         keyboardShouldPersistTaps="handled"
//       >
//         {q.isLoading ? (
//           <Text style={{ color: SUBTLE }}>Cargando...</Text>
//         ) : q.isError ? (
//           <>
//             <Text style={{ color: "#fecaca", marginBottom: 8 }}>
//               Error: {String((q.error as any)?.message || q.error)}
//             </Text>
//             <Pressable
//               style={[styles.btn, styles.btnPrimary]}
//               onPress={() => q.refetch()}
//             >
//               <Text style={styles.btnText}>Reintentar</Text>
//             </Pressable>
//             <Pressable
//               style={[styles.btn, styles.btnGhost]}
//               onPress={() => router.back()}
//             >
//               <Text style={styles.btnText}>Volver</Text>
//             </Pressable>
//           </>
//         ) : !q.data ? (
//           <Text style={{ color: SUBTLE }}>No encontrado</Text>
//         ) : (
//           <>
//             {/* Nombre */}
//             <Text style={styles.section}>Datos del contacto</Text>
//             <Text style={styles.label}>Nombre</Text>
//             <TextInput
//               style={[styles.input, styles.nameInput]}
//               value={name}
//               onChangeText={setName}
//               placeholder="Nombre del contacto"
//               placeholderTextColor={SUBTLE}
//             />

//             {/* Creador */}
//             {q.data.created_by_name && (
//               <View style={styles.creatorBox}>
//                 <Text style={styles.creatorLabel}>Creado por:</Text>
//                 <Text style={styles.creatorName}>{q.data.created_by_name}</Text>
//                 {q.data.created_by_email && (
//                   <Text style={styles.creatorEmail}>
//                     {q.data.created_by_email}
//                   </Text>
//                 )}
//               </View>
//             )}

//             {/* Cliente: Productora / Agencia / Cliente directo */}
//             <Text style={styles.label}>Cliente</Text>
//             <View style={styles.clientTypeRow}>
//               {(["productora", "agencia", "directo"] as const).map((t) => {
//                 const active = clientType === t;
//                 const label =
//                   t === "productora"
//                     ? "Productora"
//                     : t === "agencia"
//                     ? "Agencia"
//                     : "Cliente directo";

//                 return (
//                   <Pressable
//                     key={t}
//                     onPress={() =>
//                       setClientType((prev) => (prev === t ? "" : t))
//                     }
//                     style={[
//                       styles.clientTypeChip,
//                       active && styles.clientTypeChipActive,
//                     ]}
//                   >
//                     <Text
//                       style={[
//                         styles.clientTypeText,
//                         active && styles.clientTypeTextActive,
//                       ]}
//                     >
//                       {label}
//                     </Text>
//                   </Pressable>
//                 );
//               })}
//             </View>

//             {/* Empresa */}
//             <Text style={styles.label}>Empresa</Text>
//             <TextInput
//               placeholder="Empresa"
//               value={companyText}
//               onChangeText={setCompanyText}
//               style={styles.input}
//               placeholderTextColor={SUBTLE}
//             />

//             {/* Cargo */}
//             <Text style={styles.label}>Cargo</Text>
//             <TextInput
//               placeholder="Cargo"
//               value={position}
//               onChangeText={setPosition}
//               style={styles.input}
//               placeholderTextColor={SUBTLE}
//             />

//             {/* Email */}
//             <Text style={styles.label}>Email</Text>
//             <TextInput
//               placeholder="usuario@dominio.com"
//               value={email}
//               onChangeText={setEmail}
//               autoCapitalize="none"
//               keyboardType="email-address"
//               style={styles.input}
//               placeholderTextColor={SUBTLE}
//             />

//             {/* Teléfono */}
//             <Text style={styles.label}>Teléfono</Text>
//             <TextInput
//               placeholder="+58 412 000 0000"
//               value={phone}
//               onChangeText={setPhone}
//               keyboardType="phone-pad"
//               style={styles.input}
//               placeholderTextColor={SUBTLE}
//             />

//             {/* Relacionados */}
//             <Text style={styles.section}>Actividades</Text>
//             <RelatedActivities filters={{ contact_id: cid }} members={members} />

//             <Text style={styles.section}>Notas</Text>
//             <RelatedNotes filters={{ contact_id: cid }} />

//             {/* Acciones */}
//             <Pressable
//               style={[
//                 styles.btn,
//                 styles.btnPrimary,
//                 (mUpd.isPending || mDel.isPending) && { opacity: 0.9 },
//               ]}
//               onPress={handleSavePress}
//               disabled={mUpd.isPending || mDel.isPending}
//             >
//               <Text style={styles.btnText}>
//                 {mUpd.isPending ? "Guardando..." : "Guardar cambios"}
//               </Text>
//             </Pressable>

//             <Pressable
//               style={[
//                 styles.btn,
//                 styles.btnDanger,
//                 (mUpd.isPending || mDel.isPending) && { opacity: 0.9 },
//               ]}
//               onPress={handleDeletePress}
//               disabled={mDel.isPending || mUpd.isPending}
//             >
//               <Text style={styles.btnText}>
//                 {mDel.isPending ? "Eliminando..." : "Eliminar"}
//               </Text>
//             </Pressable>
//           </>
//         )}
//       </ScrollView>
//     </>
//   );
// }

// const styles = StyleSheet.create({
//   screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 8 },

//   container: {
//     padding: 12,
//     paddingBottom: 120,
//     gap: 8,
//   },

//   // Creador
//   creatorBox: {
//     backgroundColor: "rgba(34, 211, 238, 0.08)",
//     borderWidth: 1,
//     borderColor: "rgba(34, 211, 238, 0.2)",
//     borderRadius: 10,
//     padding: 8,
//     marginTop: 4,
//     marginBottom: 4,
//   },
//   creatorLabel: {
//     color: "#22d3ee",
//     fontSize: 11,
//     fontWeight: "700",
//     textTransform: "uppercase",
//     letterSpacing: 0.5,
//     marginBottom: 2,
//   },
//   creatorName: {
//     color: TEXT,
//     fontSize: 13,
//     fontWeight: "800",
//   },
//   creatorEmail: {
//     color: SUBTLE,
//     fontSize: 11,
//     marginTop: 1,
//   },

//   label: {
//     color: TEXT,
//     fontWeight: "800",
//     marginTop: 4,
//   },

//   input: {
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: FIELD,
//     color: TEXT,
//     borderRadius: 10,
//     paddingHorizontal: 10,
//     paddingVertical: 8,
//     marginTop: 4,
//     fontSize: 13,
//   },
//   nameInput: {
//     fontSize: 17,
//     fontWeight: "900",
//   },

//   section: {
//     marginTop: 8,
//     fontWeight: "900",
//     fontSize: 15,
//     color: TEXT,
//   },

//   // Cliente: productora / agencia / directo
//   clientTypeRow: {
//     flexDirection: "row",
//     flexWrap: "wrap",
//     gap: 6,
//     marginTop: 4,
//   },
//   clientTypeChip: {
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: CARD,
//   },
//   clientTypeChipActive: {
//     borderColor: ACCENT,
//     backgroundColor: "rgba(124,58,237,0.25)",
//   },
//   clientTypeText: {
//     color: SUBTLE,
//     fontWeight: "700",
//     fontSize: 11,
//   },
//   clientTypeTextActive: {
//     color: "#fff",
//   },

//   btn: { marginTop: 10, padding: 11, borderRadius: 12, alignItems: "center" },
//   btnText: { color: "#fff", fontWeight: "900" },
//   btnPrimary: {
//     backgroundColor: ACCENT,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.16)",
//   },
//   btnDanger: { backgroundColor: DANGER },
//   btnGhost: {
//     backgroundColor: "rgba(255,255,255,0.06)",
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.12)",
//   },
// });
