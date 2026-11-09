// app/deals/[id].tsx
import { listAccounts } from "@/src/api/accounts";
import { listContacts } from "@/src/api/contacts";
import {
  deleteDeal,
  getDeal,
  updateDeal,
  type DealStage
} from "@/src/api/deals";
import { listWorkspaceMembers } from "@/src/api/workspaceMembers";
import DealDocuments from "@/src/components/DealDocuments";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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

// 🔁 Reutilizables
import RelatedActivities from "@/src/components/RelatedActivities";
import RelatedNotes from "@/src/components/RelatedNotes";

/* 🎨 Tema */
/* Tema claro */
const BG = "#f5f6fa";
const CARD = "#ffffff";
const BORDER = "#dce0eb";
const TEXT = "#30364a";
const SUBTLE = "#788399";
const ACCENT = "#7551c8";
const ACCENT_2 = "#7551c8";
const DANGER = "#c03950";

const LIGHT_CARD = "#ffffff";
const LIGHT_BORDER = "#e0e4ed";
const DARK_TEXT = "#30364a";

const STAGES: DealStage[] = [
  "nuevo",
  "calificado",
  "propuesta",
  "negociacion",
  "ganado",
  "perdido",
];

export default function DealDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const dealId = Array.isArray(id) ? id[0] : id;
  const qc = useQueryClient();

  // Deal + relacionados
  const qDeal = useQuery({
    queryKey: ["deal", dealId],
    queryFn: () => getDeal(dealId!),
    enabled: !!dealId,
  });
  const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
 const qCon = useQuery({
  queryKey: ["contacts"],
  queryFn: () => listContacts(),
});

  // Estado editable del deal
  const [title, setTitle] = useState("");
  const [amountText, setAmountText] = useState("");
  const [stage, setStage] = useState<DealStage>("nuevo");

  const [assignedTo, setAssignedTo] = useState<string | null>(null);
const [assignmentOpen, setAssignmentOpen] = useState(false);
const [memberSearch, setMemberSearch] = useState("");

const qMembers = useQuery({
  queryKey: ["workspaceMembers", "deal", dealId],
  queryFn: listWorkspaceMembers,
  enabled: Boolean(qDeal.data?.can_manage_assignment),
  staleTime: 0,
  refetchOnMount: "always",
});

const members = qMembers.data ?? [];

const filteredMembers = members.filter((member) => {
  const term = memberSearch.trim().toLowerCase();

  return !term ||
    `${member.name || ""} ${member.email || ""}`
      .toLowerCase()
      .includes(term);
});

const selectedMember = members.find(
  (member) => member.id === assignedTo
);

  useEffect(() => {
    if (qDeal.data) {
      setTitle(qDeal.data.title ?? "");
      setAmountText(qDeal.data.amount != null ? String(qDeal.data.amount) : "");
      setStage((qDeal.data.stage as DealStage) ?? "nuevo");
      setAssignedTo(qDeal.data.assigned_to ?? null);
setAssignmentOpen(false);
    }
  }, [qDeal.data]);

  const mSave = useMutation({
    mutationFn: async () => {
      if (!dealId) return;
await updateDeal(dealId, {
  title: title.trim(),
  amount: amountText.trim() ? Number(amountText) : null,
  stage,
  expected_updated_at: Number(qDeal.data!.updated_at),
  ...(qDeal.data?.can_manage_assignment
    ? { assigned_to: assignedTo }
    : {}),
});

    },
    onError: (error) => {
  const message = error instanceof Error
    ? error.message
    : "No se pudieron guardar los cambios.";

  if (Platform.OS === "web") {
    window.alert(message);
  } else {
    Alert.alert("No se pudo guardar", message);
  }
},
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["deal", dealId] }),
        qc.invalidateQueries({ queryKey: ["deals"] }),
        // Los componentes Related* se actualizan solos con sus keys
      ]);
    },
  });

  const mDelete = useMutation({
    mutationFn: async () => {
      if (!dealId) return;
      await deleteDeal(dealId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["deals"] });
      router.back();
    },
  });

  // Relacionados
  const account = useMemo(
    () => (qAcc.data ?? []).find((a) => a.id === qDeal.data?.account_id),
    [qAcc.data, qDeal.data?.account_id]
  );
  const contact = useMemo(
    () => (qCon.data ?? []).find((c) => c.id === qDeal.data?.contact_id),
    [qCon.data, qDeal.data?.contact_id]
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen
        options={{
          title: "Oportunidad",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />

      <ScrollView contentContainerStyle={styles.container}>
        {qDeal.isLoading ? (
          <Text style={{ color: SUBTLE }}>Cargando…</Text>
        ) : qDeal.isError ? (
          <Text style={{ color: "#fecaca" }}>
            Error: {String((qDeal.error as any)?.message || qDeal.error)}
          </Text>
        ) : !qDeal.data ? (
          <Text style={{ color: TEXT }}>No encontrado</Text>
        ) : (
          <>
            {/* ——— Campos editables ——— */}
            <Text style={styles.label}>Título</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Título del deal"
              placeholderTextColor={SUBTLE}
            />

            <Text style={styles.label}>Monto</Text>
            <TextInput
              style={styles.input}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="numeric"
              placeholder="Ej: 15000"
              placeholderTextColor={SUBTLE}
            />
<Text style={styles.label}>Responsable de la oportunidad</Text>

<Text style={styles.muted}>
  Lleva la negociación comercial. Las actividades tienen sus propios asignados.
</Text>

{qDeal.data.can_manage_assignment ? (
  <View style={{ gap: 8 }}>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: assignmentOpen }}
      disabled={mSave.isPending}
      style={styles.input}
      onPress={() => setAssignmentOpen((open) => !open)}
    >
      <Text style={styles.label}>
        {assignedTo
          ? selectedMember?.name ||
            selectedMember?.email ||
            qDeal.data.assigned_to_name ||
            "Responsable seleccionado"
          : "Sin asignar"}
        {"  ▾"}
      </Text>
    </Pressable>

    {assignmentOpen && (
      <View style={[styles.box, { gap: 8 }]}>
        <TextInput
          value={memberSearch}
          onChangeText={setMemberSearch}
          placeholder="Buscar persona por nombre o correo"
          placeholderTextColor={SUBTLE}
          style={styles.input}
          autoCapitalize="none"
        />

        <Pressable
          disabled={mSave.isPending}
          style={styles.input}
          onPress={() => {
            setAssignedTo(null);
            setAssignmentOpen(false);
          }}
        >
          <Text style={styles.label}>
            {assignedTo === null ? "✓ " : ""}Sin asignar
          </Text>
        </Pressable>

        {qMembers.isLoading ? (
          <Text style={styles.muted}>Cargando personas…</Text>
        ) : qMembers.isError ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.muted}>
              No se pudieron cargar los miembros del workspace.
            </Text>
            <Pressable onPress={() => { void qMembers.refetch(); }}>
              <Text style={styles.link}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            nestedScrollEnabled
            style={{ maxHeight: 240 }}
            keyboardShouldPersistTaps="handled"
          >
            {filteredMembers.map((member) => (
              <Pressable
                key={member.id}
                disabled={mSave.isPending}
                style={[styles.input, { marginBottom: 6 }]}
                onPress={() => {
                  setAssignedTo(member.id);
                  setAssignmentOpen(false);
                  setMemberSearch("");
                }}
              >
                <Text style={styles.label}>
                  {assignedTo === member.id ? "✓ " : ""}
                  {member.name || member.email || member.id}
                </Text>

                {!!member.email && (
                  <Text style={styles.muted}>{member.email}</Text>
                )}
              </Pressable>
            ))}

            {filteredMembers.length === 0 && (
              <Text style={styles.muted}>No hay coincidencias.</Text>
            )}
          </ScrollView>
        )}
      </View>
    )}

    <Text style={styles.muted}>
      La asignación se aplica al pulsar Guardar cambios.
      El responsable debe tener acceso al contacto vinculado.
    </Text>
  </View>
) : (
  <View style={styles.box}>
    <Text style={styles.label}>
      {qDeal.data.assigned_to_name ||
        (qDeal.data.assigned_to ? "Asignado a tu usuario" : "Sin asignar")}
    </Text>
    <Text style={styles.muted}>
      El creador o un administrador puede cambiar el responsable.
    </Text>
  </View>
)}
            <Text style={styles.label}>Etapa</Text>
            <View style={styles.pillsRow}>
              {STAGES.map((s) => {
                const active = stage === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setStage(s)}
                    style={[styles.pill, active && styles.pillActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    hitSlop={8}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {s}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ——— Relacionados ——— */}
            <Text style={styles.section}>Relacionados</Text>
            <View style={styles.box}>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Cuenta</Text>
                {account ? (
                  <Link href={`/accounts/${account.id}`} asChild>
                    <Pressable accessibilityRole="link" hitSlop={8}>
                      <Text style={styles.link}>{account.name}</Text>
                    </Pressable>
                  </Link>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Contacto</Text>
                {contact ? (
                  <Link href={`/contacts/${contact.id}`} asChild>
                    <Pressable accessibilityRole="link" hitSlop={8}>
                      <Text style={styles.link}>{contact.name}</Text>
                    </Pressable>
                  </Link>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>
            </View>
<DealDocuments key={dealId} dealId={dealId!} />
            {/* ——— Actividades (reutilizable) ——— */}
            <View style={[styles.box, styles.emphasisBoxLight]}>
              <Text style={styles.sectionLight}>Actividades</Text>
              <RelatedActivities filters={{ deal_id: dealId! }} />
            </View>

            {/* ——— Notas (reutilizable) ——— */}
            <View style={[styles.box, styles.emphasisBoxLight]}>
              <Text style={styles.sectionLight}>Notas</Text>
              <RelatedNotes filters={{ deal_id: dealId! }} />
            </View>

            {/* ——— Acciones ——— */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
                mSave.isPending && { opacity: 0.8 },
              ]}
              onPress={() => mSave.mutate()}
              disabled={mSave.isPending}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.primaryBtnText}>
                {mSave.isPending ? "Guardando..." : "Guardar cambios"}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.dangerBtn,
                pressed && styles.pressed,
                mDelete.isPending && { opacity: 0.8 },
              ]}
              onPress={() => mDelete.mutate()}
              disabled={mDelete.isPending}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.primaryBtnText}>
                {mDelete.isPending ? "Eliminando..." : "Eliminar"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* ——— Styles ——— */
const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  label: { color: TEXT, fontWeight: "800" },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    color: TEXT,
    borderRadius: 12,
    padding: 12,
  },

  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: CARD,
  },
  pillActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  pillText: { fontSize: 12, color: TEXT, fontWeight: "600" },
  pillTextActive: { color: "#fff", fontWeight: "900" },

  section: { marginTop: 6, color: TEXT, fontWeight: "900", fontSize: 16 },

  box: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: CARD,
    padding: 10,
    gap: 8,
  },

  row: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  rowTitle: { color: TEXT, fontWeight: "800" },
  link: { color: ACCENT_2, textDecorationLine: "underline", fontWeight: "800" },
  muted: { color: SUBTLE },

  // Light section title inside light boxes
  sectionLight: {
    color: DARK_TEXT,
    fontWeight: "900",
    fontSize: 16,
    paddingHorizontal: 4,
    paddingTop: 6,
  },

  // Botones principales
  primaryBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: ACCENT,
  },
  dangerBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: DANGER,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  pressed: { opacity: 0.9 },

  // —— Variantes claras (marco visual de secciones)
  emphasisBoxLight: {
    backgroundColor: LIGHT_CARD,
    borderColor: LIGHT_BORDER,
  },
});

