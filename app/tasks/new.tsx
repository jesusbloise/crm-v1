// app/tasks/new.tsx
import { createActivity, type ActivityType } from "@/src/api/activities";
import { listContacts } from "@/src/api/contacts";
import {
  listWorkspaceMembers,
  type WorkspaceMember,
} from "@/src/api/workspaceMembers";

import { createCalendarEventFromActivity } from "@/src/lib/googleCalendar";
import {
  initNotifications,
  scheduleActivityReminder,
} from "@/src/utils/notifications";

import { uid } from "@/src/utils/uid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

/* 🎨 Paleta consistente */
const PRIMARY = "#7C3AED"; // morado acciones
const ACCENT = "#22D3EE"; // cian detalles
const BG = "#0F1115"; // fondo
const CARD = "#171923"; // tarjetas
const FIELD = "#121318"; // inputs
const BORDER = "#2B3140"; // bordes
const TEXT = "#F3F4F6"; // texto principal
const SUBTLE = "#A4ADBD"; // subtítulos

type RelKey = "contact_id";
const TYPES: ActivityType[] = ["task", "call", "meeting"];

/** Estados igual que en el resto (dropdown en vez de botón suelto) */
type ActivityStatus = "open" | "in_progress" | "done";

const STATUS_LABEL: Record<ActivityStatus, string> = {
  open: "Abierta",
  in_progress: "En proceso",
  done: "Realizada",
};

/** Igual que MemberOption en RelatedActivities, pero usando el tipo de la API */
type MemberOption = WorkspaceMember;

export default function NewActivity() {
  const params = useLocalSearchParams<{
    contact_id?: string;
  }>();

  const qc = useQueryClient();

  // 🔹 contactos
  const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

  // 🔹 miembros reales del workspace (desde el backend)
  const qMembers = useQuery({
    queryKey: ["workspaceMembers"],
    queryFn: listWorkspaceMembers,
  });

  // formulario
  const [type, setType] = useState<ActivityType>("task");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dateStr, setDateStr] = useState(""); // YYYY-MM-DD
  const [timeStr, setTimeStr] = useState(""); // HH:MM
  const [remind, setRemind] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // estado dropdown
  const [status, setStatus] = useState<ActivityStatus>("open");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  // 🔹 Asignación: hasta 2 responsables
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);

  // vínculo contacto
  const [contactId, setContactId] = useState<string | undefined>();

  // bloquear si vienen por query
  const locked: Partial<Record<RelKey, true>> = useMemo(() => {
    const lk: Partial<Record<RelKey, true>> = {};
    (["contact_id"] as RelKey[]).forEach((k) => {
      if (params[k]) lk[k] = true;
    });
    return lk;
  }, [params]);

  useEffect(() => {
    if (params.contact_id) setContactId(String(params.contact_id));
  }, [params]);

  useEffect(() => {
    initNotifications().catch(() => {});
  }, []);

  // helpers fecha/hora
  const parseDueDate = (s: string): number | null => {
    if (!s.trim()) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return NaN as any;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return NaN as any;
    return d.getTime();
  };

  const parseTime = (s: string): { h: number; m: number } | null => {
    if (!s.trim()) return null;
    const m = s.match(/^(\d{2}):([0-5]\d)$/);
    if (!m) return null;
    return { h: Number(m[1]), m: Number(m[2]) };
  };

  const validate = () => {
    if (!title.trim()) return "El título es obligatorio.";
    if (dateStr.trim()) {
      const ts = parseDueDate(dateStr);
      if (isNaN(ts as any)) return "La fecha debe ser YYYY-MM-DD.";
    }
    if (remind) {
      if (!dateStr.trim()) return "Para recordar, ingresa una fecha.";
      if (!timeStr.trim() || !parseTime(timeStr))
        return "La hora debe ser HH:MM (24h).";

      const due = parseDueDate(dateStr)!;
      const t = parseTime(timeStr)!;
      const when = new Date(due);
      when.setHours(t.h, t.m, 0, 0);
      if (when.getTime() <= Date.now())
        return "El recordatorio debe ser en el futuro.";
    }
    return null;
  };

  const mCreate = useMutation({
    mutationFn: async () => {
      const err = validate();
      if (err) {
        setError(err);
        throw new Error(err);
      }
      setError(null);

      const due = parseDueDate(dateStr); // puede ser null

      const [a1, a2] = selectedAssignees;

      const payload: any = {
        id: uid(),
        type,
        title: title.trim(),
        status, // ojo: el backend solo acepta open/done/canceled, igual que antes (mapearás luego si hace falta)
        notes: notes.trim() ? notes.trim() : null,
        due_date: due || null,
        contact_id: contactId || null,
        assigned_to: a1 ?? undefined,
        assigned_to_2: a2 ?? undefined,
      };

      console.log("Nuevo payload actividad (NewActivity):", payload);

      // 1) Crear actividad en tu backend
      await createActivity(payload);

      // 2) Si hay recordatorio → programar notificación local
      //    y crear evento en Google Calendar usando la misma fecha/hora
      let eventStart: Date | null = null;

      if (remind) {
        const base = parseDueDate(dateStr)!;
        const t = parseTime(timeStr)!;
        const when = new Date(base);
        when.setHours(t.h, t.m, 0, 0);

        // Notificación local (nativo) o alert en web
        await scheduleActivityReminder({
          activityId: payload.id,
          title: payload.title,
          body: payload.notes || `Recordatorio: ${payload.title}`,
          when,
        });

        eventStart = when;
      }

      // 3) Crear evento en Google Calendar (si tenemos fecha/hora válidas)
// 3) Crear evento en Google Calendar (si tenemos fecha/hora válidas)
if (eventStart) {
  try {
    await createCalendarEventFromActivity({
      id: payload.id,
      title: payload.title,
      notes: payload.notes ?? null,
      startAt: eventStart, // la Date completa, GoogleCalendar se encarga del resto
    });
  } catch (e) {
    console.warn("No se pudo crear evento en Google Calendar:", e);
  }
}


    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["activities"] }),
        contactId &&
          qc.invalidateQueries({
            queryKey: ["activities", { contact_id: contactId } as any],
          }),
      ]);
      router.back();
    },
    onError: (e: any) => {
      alert(String(e?.message ?? "No se pudo crear la actividad"));
    },
  });

  // Chips genérico para contactos
  function Chips<T extends { id: string; label: string }>(props: {
    title: string;
    items: T[];
    selected?: string;
    onSelect?: (id?: string) => void;
    locked?: boolean;
  }) {
    const { title, items, selected, onSelect, locked } = props;
    return (
      <View style={{ marginTop: 10 }}>
        <Text style={styles.label}>{title}</Text>
        <View style={styles.chipsRow}>
          {items.map((it) => {
            const active = selected === it.id;
            return (
              <Pressable
                key={it.id}
                onPress={() => !locked && onSelect?.(active ? undefined : it.id)}
                style={[
                  styles.chip,
                  (active || locked) && styles.chipActive,
                  locked && { opacity: 0.8 },
                ]}
                disabled={locked}
              >
                <Text
                  style={[
                    styles.chipText,
                    (active || locked) && styles.chipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {it.label}
                </Text>
              </Pressable>
            );
          })}
          {items.length === 0 && (
            <Text style={styles.subtle}>— vacío —</Text>
          )}
        </View>
      </View>
    );
  }

  const conOpts = useMemo(
    () => (qCon.data ?? []).map((c) => ({ id: c.id, label: c.name })),
    [qCon.data]
  );

  // Miembros del workspace
  const members: MemberOption[] = qMembers.data ?? [];

  const getMemberLabel = (id: string): string => {
    if (!members || members.length === 0) return id;
    const m = members.find((mm) => mm.id === id);
    return m?.name || m?.email || id;
  };

  const assignedSummary = (() => {
    if (qMembers.isLoading) return "Asignar";
    if (qMembers.isError) return "Asignar";
    if (selectedAssignees.length === 0) return "Asignar";
    if (selectedAssignees.length === 1)
      return `Asignado: ${getMemberLabel(selectedAssignees[0])}`;
    if (selectedAssignees.length === 2)
      return `Asignados: ${getMemberLabel(
        selectedAssignees[0]
      )} y ${getMemberLabel(selectedAssignees[1])}`;
    return "Asignar";
  })();

  const toggleAssignee = (id: string) => {
    setSelectedAssignees((prev) => {
      // si ya está, lo quitamos
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      // si no está y ya hay 2, no añadimos más (máximo 2)
      if (prev.length >= 2) {
        return prev;
      }
      return [...prev, id];
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: "Nueva actividad",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Tipo */}
        <Text style={styles.label}>Tipo</Text>
        <View style={styles.pillsRow}>
          {TYPES.map((t) => {
            const active = type === t;
            return (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                style={[styles.pill, active && styles.pillActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                hitSlop={8}
              >
                <Text
                  style={[styles.pillText, active && styles.pillTextActive]}
                >
                  {t === "task"
                    ? "Tarea"
                    : t === "call"
                    ? "Llamada"
                    : "Reunión"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Estado dropdown */}
        <Text style={[styles.label, { marginTop: 10 }]}>Estado</Text>
        <View>
          <Pressable
            style={styles.statusDropdown}
            onPress={() => setStatusMenuOpen((v) => !v)}
          >
            <View
              style={[
                styles.statusDot,
                styles[`statusDot_${status}` as const],
              ]}
            />
            <Text style={styles.statusDropdownText}>
              {STATUS_LABEL[status]}
            </Text>
          </Pressable>

          {statusMenuOpen && (
            <View style={styles.statusMenu}>
              {(["open", "in_progress", "done"] as ActivityStatus[]).map(
                (st) => (
                  <Pressable
                    key={st}
                    style={styles.statusOption}
                    onPress={() => {
                      setStatus(st);
                      setStatusMenuOpen(false);
                    }}
                  >
                    <Text style={styles.statusOptionText}>
                      {STATUS_LABEL[st]}
                    </Text>
                  </Pressable>
                )
              )}
            </View>
          )}
        </View>

        {/* Asignación – mismo estilo compacto que RelatedActivities */}
        <View style={{ marginTop: 10 }}>
          <Text style={styles.label}>Asignación</Text>

          {qMembers.isLoading ? (
            <Text style={styles.subtle}>
              Cargando miembros del workspace…
            </Text>
          ) : qMembers.isError ? (
            <Text style={styles.error}>
              Error cargando miembros del workspace
            </Text>
          ) : members.length === 0 ? (
            <Text style={styles.subtle}>
              No hay usuarios en este workspace todavía.
            </Text>
          ) : (
            <View
              style={{
                flexDirection: "column",
                flexShrink: 0,
                maxWidth: 160,
                marginTop: 6,
              }}
            >
              {/* Botón principal tipo dropdown */}
              <Pressable
                style={styles.assignDropdownTrigger}
                onPress={() => setAssignDropdownOpen((v) => !v)}
              >
                <Text style={styles.assignDropdownText}>
                  {assignedSummary}
                </Text>
              </Pressable>

              {/* Contenido del dropdown: un solo listado donde se pueden marcar hasta 2 */}
              {assignDropdownOpen && (
                <View style={styles.assignDropdown}>
                  <Text style={styles.assignSectionTitle}>Responsables</Text>
                  <Text style={styles.assignSectionHint}>
                    Puedes seleccionar hasta 2 personas para esta actividad.
                  </Text>

                  {members.map((m) => {
                    const active = selectedAssignees.includes(m.id);
                    return (
                      <Pressable
                        key={m.id}
                        style={[
                          styles.assignOption,
                          active && styles.assignOptionActive,
                        ]}
                        onPress={() => toggleAssignee(m.id)}
                      >
                        <Text
                          style={[
                            styles.assignOptionText,
                            active && styles.assignOptionTextActive,
                          ]}
                        >
                          {active ? "● " : "○ "}
                          {m.name || m.email || m.id}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </View>

        <Text style={styles.label}>Título *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Ej: Llamar para confirmar demo"
          placeholderTextColor={SUBTLE}
        />

        {/* Fecha / Hora simple */}
        <Text style={styles.label}>Fecha (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={dateStr}
          onChangeText={setDateStr}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          placeholder="2025-02-28"
          placeholderTextColor={SUBTLE}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Hora (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={timeStr}
              onChangeText={setTimeStr}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              placeholder="14:30"
              placeholderTextColor={SUBTLE}
            />
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={[styles.label, { marginBottom: 6 }]}>
              Recordarme
            </Text>
            <Switch
              value={remind}
              onValueChange={setRemind}
              trackColor={{ false: "#444", true: PRIMARY }}
              thumbColor={remind ? "#fff" : "#ccc"}
            />
          </View>
        </View>

        <Text style={styles.label}>Notas</Text>
        <TextInput
          style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Detalles adicionales…"
          placeholderTextColor={SUBTLE}
          multiline
        />

        {/* Contacto */}
        <Chips
          title="Contacto"
          items={conOpts}
          selected={contactId}
          onSelect={setContactId}
          locked={!!locked.contact_id}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[
            styles.btn,
            styles.btnPrimary,
            mCreate.isPending && { opacity: 0.9 },
          ]}
          onPress={() => mCreate.mutate()}
          disabled={mCreate.isPending}
        >
          <Text style={styles.btnText}>
            {mCreate.isPending ? "Creando…" : "Crear actividad"}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={() => router.back()}
        >
          <Text style={styles.btnText}>Cancelar</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* Estilos */
const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  label: { color: TEXT, fontWeight: "900", marginTop: 2 },

  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: CARD,
  },
  pillActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  pillText: { fontSize: 12, color: TEXT, fontWeight: "700" },
  pillTextActive: { color: "#fff", fontWeight: "900" },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 12,
    padding: 12,
  },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },
  chipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  chipText: { color: TEXT, fontWeight: "800", fontSize: 12, maxWidth: 180 },
  chipTextActive: { color: "#fff" },

  // Dropdown de estado
  statusDropdown: {
    marginTop: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDropdownText: {
    color: TEXT,
    fontWeight: "800",
    fontSize: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  statusDot_open: {
    backgroundColor: "#9CA3AF",
  },
  statusDot_in_progress: {
    backgroundColor: ACCENT,
  },
  statusDot_done: {
    backgroundColor: "#22C55E",
  },
  statusMenu: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  statusOption: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2933",
  },
  statusOptionText: {
    fontSize: 12,
    color: TEXT,
  },

  // Dropdown de asignación (compacto, armonizado con RelatedActivities pero dark)
  assignDropdownTrigger: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: CARD,
    alignSelf: "flex-start",
  },
  assignDropdownText: {
    color: TEXT,
    fontSize: 10,
    fontWeight: "700",
  },
  assignDropdown: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    overflow: "hidden",
  },
  assignSectionTitle: {
    paddingHorizontal: 10,
    paddingTop: 8,
    color: TEXT,
    fontSize: 12,
    fontWeight: "800",
  },
  assignSectionHint: {
    paddingHorizontal: 10,
    paddingBottom: 4,
    color: SUBTLE,
    fontSize: 11,
  },
  assignOption: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: "#1F2933",
  },
  assignOptionActive: {
    backgroundColor: "#1E293B",
  },
  assignOptionText: {
    fontSize: 12,
    color: TEXT,
  },
  assignOptionTextActive: {
    fontWeight: "700",
    color: ACCENT,
  },

  btn: { marginTop: 6, padding: 12, borderRadius: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "900" },
  btnPrimary: {
    backgroundColor: PRIMARY,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  subtle: { color: SUBTLE },
  error: { color: "#fecaca" },
});


// // app/tasks/new.tsx
// import { createActivity, type ActivityType } from "@/src/api/activities";
// import {
//   listWorkspaceMembers,
//   type WorkspaceMember,
// } from "@/src/api/workspaceMembers";

// import { listContacts } from "@/src/api/contacts";

// import ToastCenter from "@/src/ui/ToastCenter";
// import {
//   initNotifications,
//   registerToast,
//   scheduleActivityReminder,
// } from "@/src/utils/notifications";
// import { uid } from "@/src/utils/uid";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { router, Stack, useLocalSearchParams } from "expo-router";
// import { useEffect, useMemo, useState } from "react";
// import {
//   KeyboardAvoidingView,
//   Platform,
//   Pressable,
//   ScrollView,
//   StyleSheet,
//   Switch,
//   Text,
//   TextInput,
//   View,
// } from "react-native";

// /* 🎨 Paleta consistente */
// const PRIMARY = "#7C3AED"; // morado acciones
// const ACCENT = "#22D3EE"; // cian detalles
// const BG = "#0F1115"; // fondo
// const CARD = "#171923"; // tarjetas
// const FIELD = "#121318"; // inputs
// const BORDER = "#2B3140"; // bordes
// const TEXT = "#F3F4F6"; // texto principal
// const SUBTLE = "#A4ADBD"; // subtítulos

// type RelKey = "contact_id";
// const TYPES: ActivityType[] = ["task", "call", "meeting"];

// /** Estados igual que en el resto (dropdown en vez de botón suelto) */
// type ActivityStatus = "open" | "in_progress" | "done";

// const STATUS_LABEL: Record<ActivityStatus, string> = {
//   open: "Abierta",
//   in_progress: "En proceso",
//   done: "Realizada",
// };

// /** Igual que MemberOption en RelatedActivities, pero usando el tipo de la API */
// type MemberOption = WorkspaceMember;

// export default function NewActivity() {
//   const params = useLocalSearchParams<{
//     contact_id?: string;
//   }>();

//   const qc = useQueryClient();

//   // 🔹 contactos
//   const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

//   // 🔹 miembros reales del workspace (desde el backend)
//   const qMembers = useQuery({
//     queryKey: ["workspaceMembers"],
//     queryFn: listWorkspaceMembers,
//   });

//   // formulario
//   const [type, setType] = useState<ActivityType>("task");
//   const [title, setTitle] = useState("");
//   const [notes, setNotes] = useState("");
//   const [dateStr, setDateStr] = useState(""); // YYYY-MM-DD
//   const [timeStr, setTimeStr] = useState(""); // HH:MM
//   const [remind, setRemind] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   // estado dropdown
//   const [status, setStatus] = useState<ActivityStatus>("open");
//   const [statusMenuOpen, setStatusMenuOpen] = useState(false);

//   // 🔹 Asignación: hasta 2 responsables
//   const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
//   const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);

//   // vínculo contacto
//   const [contactId, setContactId] = useState<string | undefined>();

//   // 🔔 Toast local centrado
//   const [toast, setToast] = useState<{ title: string; msg: string } | null>(
//     null
//   );

//   // bloquear si vienen por query
//   const locked: Partial<Record<RelKey, true>> = useMemo(() => {
//     const lk: Partial<Record<RelKey, true>> = {};
//     (["contact_id"] as RelKey[]).forEach((k) => {
//       if (params[k]) lk[k] = true;
//     });
//     return lk;
//   }, [params]);

//   useEffect(() => {
//     if (params.contact_id) setContactId(String(params.contact_id));
//   }, [params]);

//   useEffect(() => {
//     initNotifications().catch(() => {});
//   }, []);

//   // Registrar callback para que notifications.ts pueda mostrar el toast
//   useEffect(() => {
//     registerToast((title, msg) => {
//       setToast({ title, msg });
//     });
//   }, []);

//   // helpers fecha/hora
//   const parseDueDate = (s: string): number | null => {
//     if (!s.trim()) return null;
//     const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
//     if (!m) return NaN as any;
//     const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
//     if (isNaN(d.getTime())) return NaN as any;
//     return d.getTime();
//   };

//   const parseTime = (s: string): { h: number; m: number } | null => {
//     if (!s.trim()) return null;
//     const m = s.match(/^(\d{2}):([0-5]\d)$/);
//     if (!m) return null;
//     return { h: Number(m[1]), m: Number(m[2]) };
//   };

//   const validate = () => {
//     if (!title.trim()) return "El título es obligatorio.";
//     if (dateStr.trim()) {
//       const ts = parseDueDate(dateStr);
//       if (isNaN(ts as any)) return "La fecha debe ser YYYY-MM-DD.";
//     }
//     if (remind) {
//       if (!dateStr.trim()) return "Para recordar, ingresa una fecha.";
//       if (!timeStr.trim() || !parseTime(timeStr))
//         return "La hora debe ser HH:MM (24h).";

//       const due = parseDueDate(dateStr)!;
//       const t = parseTime(timeStr)!;
//       const when = new Date(due);
//       when.setHours(t.h, t.m, 0, 0);
//       if (when.getTime() <= Date.now())
//         return "El recordatorio debe ser en el futuro.";
//     }
//     return null;
//   };

//   const mCreate = useMutation({
//     mutationFn: async () => {
//       const err = validate();
//       if (err) {
//         setError(err);
//         throw new Error(err);
//       }
//       setError(null);

//       const due = parseDueDate(dateStr); // puede ser null

//       const [a1, a2] = selectedAssignees;

//       const payload: any = {
//         id: uid(),
//         type,
//         title: title.trim(),
//         status, // ojo: el backend solo acepta open/done/canceled, igual que antes (mapearás luego si hace falta)
//         notes: notes.trim() ? notes.trim() : null,
//         due_date: due || null,
//         contact_id: contactId || null,
//         assigned_to: a1 ?? undefined,
//         assigned_to_2: a2 ?? undefined,
//       };

//       console.log("Nuevo payload actividad (NewActivity):", payload);

//       await createActivity(payload);

//       if (remind) {
//         const base = parseDueDate(dateStr)!;
//         const t = parseTime(timeStr)!;
//         const when = new Date(base);
//         when.setHours(t.h, t.m, 0, 0);

//         await scheduleActivityReminder({
//           activityId: payload.id,
//           title: payload.title,
//           body: payload.notes || `Recordatorio: ${payload.title}`,
//           when,
//         });
//       }
//     },
//     onSuccess: async () => {
//       await Promise.all([
//         qc.invalidateQueries({ queryKey: ["activities"] }),
//         contactId &&
//           qc.invalidateQueries({
//             queryKey: ["activities", { contact_id: contactId } as any],
//           }),
//       ]);
//       router.back();
//     },
//     onError: (e: any) => {
//       alert(String(e?.message ?? "No se pudo crear la actividad"));
//     },
//   });

//   // Chips genérico para contactos
//   function Chips<T extends { id: string; label: string }>(props: {
//     title: string;
//     items: T[];
//     selected?: string;
//     onSelect?: (id?: string) => void;
//     locked?: boolean;
//   }) {
//     const { title, items, selected, onSelect, locked } = props;
//     return (
//       <View style={{ marginTop: 10 }}>
//         <Text style={styles.label}>{title}</Text>
//         <View style={styles.chipsRow}>
//           {items.map((it) => {
//             const active = selected === it.id;
//             return (
//               <Pressable
//                 key={it.id}
//                 onPress={() => !locked && onSelect?.(active ? undefined : it.id)}
//                 style={[
//                   styles.chip,
//                   (active || locked) && styles.chipActive,
//                   locked && { opacity: 0.8 },
//                 ]}
//                 disabled={locked}
//               >
//                 <Text
//                   style={[
//                     styles.chipText,
//                     (active || locked) && styles.chipTextActive,
//                   ]}
//                   numberOfLines={1}
//                 >
//                   {it.label}
//                 </Text>
//               </Pressable>
//             );
//           })}
//           {items.length === 0 && (
//             <Text style={styles.subtle}>— vacío —</Text>
//           )}
//         </View>
//       </View>
//     );
//   }

//   const conOpts = useMemo(
//     () => (qCon.data ?? []).map((c) => ({ id: c.id, label: c.name })),
//     [qCon.data]
//   );

//   // Miembros del workspace
//   const members: MemberOption[] = qMembers.data ?? [];

//   const getMemberLabel = (id: string): string => {
//     if (!members || members.length === 0) return id;
//     const m = members.find((mm) => mm.id === id);
//     return m?.name || m?.email || id;
//   };

//   const assignedSummary = (() => {
//     if (qMembers.isLoading) return "Asignar";
//     if (qMembers.isError) return "Asignar";
//     if (selectedAssignees.length === 0) return "Asignar";
//     if (selectedAssignees.length === 1)
//       return `Asignado: ${getMemberLabel(selectedAssignees[0])}`;
//     if (selectedAssignees.length === 2)
//       return `Asignados: ${getMemberLabel(
//         selectedAssignees[0]
//       )} y ${getMemberLabel(selectedAssignees[1])}`;
//     return "Asignar";
//   })();

//   const toggleAssignee = (id: string) => {
//     setSelectedAssignees((prev) => {
//       // si ya está, lo quitamos
//       if (prev.includes(id)) {
//         return prev.filter((x) => x !== id);
//       }
//       // si no está y ya hay 2, no añadimos más (máximo 2)
//       if (prev.length >= 2) {
//         return prev;
//       }
//       return [...prev, id];
//     });
//   };

//   return (
//     <KeyboardAvoidingView
//       style={{ flex: 1, backgroundColor: BG }}
//       behavior={Platform.OS === "ios" ? "padding" : undefined}
//       keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
//     >
//       <Stack.Screen
//         options={{
//           title: "Nueva actividad",
//           headerStyle: { backgroundColor: BG },
//           headerTintColor: TEXT,
//           headerTitleStyle: { color: TEXT, fontWeight: "800" },
//         }}
//       />
//       <ScrollView contentContainerStyle={styles.container}>
//         {/* Tipo */}
//         <Text style={styles.label}>Tipo</Text>
//         <View style={styles.pillsRow}>
//           {TYPES.map((t) => {
//             const active = type === t;
//             return (
//               <Pressable
//                 key={t}
//                 onPress={() => setType(t)}
//                 style={[styles.pill, active && styles.pillActive]}
//                 accessibilityRole="button"
//                 accessibilityState={{ selected: active }}
//                 hitSlop={8}
//               >
//                 <Text
//                   style={[styles.pillText, active && styles.pillTextActive]}
//                 >
//                   {t === "task"
//                     ? "Tarea"
//                     : t === "call"
//                     ? "Llamada"
//                     : "Reunión"}
//                 </Text>
//               </Pressable>
//             );
//           })}
//         </View>

//         {/* Estado dropdown */}
//         <Text style={[styles.label, { marginTop: 10 }]}>Estado</Text>
//         <View>
//           <Pressable
//             style={styles.statusDropdown}
//             onPress={() => setStatusMenuOpen((v) => !v)}
//           >
//             <View
//               style={[
//                 styles.statusDot,
//                 styles[`statusDot_${status}` as const],
//               ]}
//             />
//             <Text style={styles.statusDropdownText}>
//               {STATUS_LABEL[status]}
//             </Text>
//           </Pressable>

//           {statusMenuOpen && (
//             <View style={styles.statusMenu}>
//               {(["open", "in_progress", "done"] as ActivityStatus[]).map(
//                 (st) => (
//                   <Pressable
//                     key={st}
//                     style={styles.statusOption}
//                     onPress={() => {
//                       setStatus(st);
//                       setStatusMenuOpen(false);
//                     }}
//                   >
//                     <Text style={styles.statusOptionText}>
//                       {STATUS_LABEL[st]}
//                     </Text>
//                   </Pressable>
//                 )
//               )}
//             </View>
//           )}
//         </View>

//         {/* Asignación – mismo estilo compacto que RelatedActivities */}
//         <View style={{ marginTop: 10 }}>
//           <Text style={styles.label}>Asignación</Text>

//           {qMembers.isLoading ? (
//             <Text style={styles.subtle}>
//               Cargando miembros del workspace…
//             </Text>
//           ) : qMembers.isError ? (
//             <Text style={styles.error}>
//               Error cargando miembros del workspace
//             </Text>
//           ) : members.length === 0 ? (
//             <Text style={styles.subtle}>
//               No hay usuarios en este workspace todavía.
//             </Text>
//           ) : (
//             <View
//               style={{
//                 flexDirection: "column",
//                 flexShrink: 0,
//                 maxWidth: 160,
//                 marginTop: 6,
//               }}
//             >
//               {/* Botón principal tipo dropdown */}
//               <Pressable
//                 style={styles.assignDropdownTrigger}
//                 onPress={() => setAssignDropdownOpen((v) => !v)}
//               >
//                 <Text style={styles.assignDropdownText}>
//                   {assignedSummary}
//                 </Text>
//               </Pressable>

//               {/* Contenido del dropdown: un solo listado donde se pueden marcar hasta 2 */}
//               {assignDropdownOpen && (
//                 <View style={styles.assignDropdown}>
//                   <Text style={styles.assignSectionTitle}>Responsables</Text>
//                   <Text style={styles.assignSectionHint}>
//                     Puedes seleccionar hasta 2 personas para esta actividad.
//                   </Text>

//                   {members.map((m) => {
//                     const active = selectedAssignees.includes(m.id);
//                     return (
//                       <Pressable
//                         key={m.id}
//                         style={[
//                           styles.assignOption,
//                           active && styles.assignOptionActive,
//                         ]}
//                         onPress={() => toggleAssignee(m.id)}
//                       >
//                         <Text
//                           style={[
//                             styles.assignOptionText,
//                             active && styles.assignOptionTextActive,
//                           ]}
//                         >
//                           {active ? "● " : "○ "}
//                           {m.name || m.email || m.id}
//                         </Text>
//                       </Pressable>
//                     );
//                   })}
//                 </View>
//               )}
//             </View>
//           )}
//         </View>

//         <Text style={styles.label}>Título *</Text>
//         <TextInput
//           style={styles.input}
//           value={title}
//           onChangeText={setTitle}
//           placeholder="Ej: Llamar para confirmar demo"
//           placeholderTextColor={SUBTLE}
//         />

//         {/* Fecha / Hora simple */}
//         <Text style={styles.label}>Fecha (YYYY-MM-DD)</Text>
//         <TextInput
//           style={styles.input}
//           value={dateStr}
//           onChangeText={setDateStr}
//           autoCapitalize="none"
//           keyboardType="numbers-and-punctuation"
//           placeholder="2025-02-28"
//           placeholderTextColor={SUBTLE}
//         />

//         <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
//           <View style={{ flex: 1 }}>
//             <Text style={styles.label}>Hora (HH:MM)</Text>
//             <TextInput
//               style={styles.input}
//               value={timeStr}
//               onChangeText={setTimeStr}
//               autoCapitalize="none"
//               keyboardType="numbers-and-punctuation"
//               placeholder="14:30"
//               placeholderTextColor={SUBTLE}
//             />
//           </View>
//           <View style={{ alignItems: "center" }}>
//             <Text style={[styles.label, { marginBottom: 6 }]}>
//               Recordarme
//             </Text>
//             <Switch
//               value={remind}
//               onValueChange={setRemind}
//               trackColor={{ false: "#444", true: PRIMARY }}
//               thumbColor={remind ? "#fff" : "#ccc"}
//             />
//           </View>
//         </View>

//         <Text style={styles.label}>Notas</Text>
//         <TextInput
//           style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
//           value={notes}
//           onChangeText={setNotes}
//           placeholder="Detalles adicionales…"
//           placeholderTextColor={SUBTLE}
//           multiline
//         />

//         {/* Contacto */}
//         <Chips
//           title="Contacto"
//           items={conOpts}
//           selected={contactId}
//           onSelect={setContactId}
//           locked={!!locked.contact_id}
//         />

//         {!!error && <Text style={styles.error}>{error}</Text>}

//         <Pressable
//           style={[
//             styles.btn,
//             styles.btnPrimary,
//             mCreate.isPending && { opacity: 0.9 },
//           ]}
//           onPress={() => mCreate.mutate()}
//           disabled={mCreate.isPending}
//         >
//           <Text style={styles.btnText}>
//             {mCreate.isPending ? "Creando…" : "Crear actividad"}
//           </Text>
//         </Pressable>

//         <Pressable
//           style={[styles.btn, styles.btnGhost]}
//           onPress={() => router.back()}
//         >
//           <Text style={styles.btnText}>Cancelar</Text>
//         </Pressable>
//       </ScrollView>

//       {/* Toast centrado para web / entornos sin notificaciones */}
//       {toast && (
//         <ToastCenter
//           visible={true}
//           title={toast.title}
//           message={toast.msg}
//           onClose={() => setToast(null)}
//         />
//       )}
//     </KeyboardAvoidingView>
//   );
// }

// /* Estilos */
// const styles = StyleSheet.create({
//   container: { padding: 16, gap: 12 },
//   label: { color: TEXT, fontWeight: "900", marginTop: 2 },

//   pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
//   pill: {
//     borderWidth: 1,
//     borderColor: BORDER,
//     borderRadius: 999,
//     paddingVertical: 6,
//     paddingHorizontal: 12,
//     backgroundColor: CARD,
//   },
//   pillActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
//   pillText: { fontSize: 12, color: TEXT, fontWeight: "700" },
//   pillTextActive: { color: "#fff", fontWeight: "900" },

//   input: {
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: FIELD,
//     color: TEXT,
//     borderRadius: 12,
//     padding: 12,
//   },

//   chipsRow: {
//     flexDirection: "row",
//     flexWrap: "wrap",
//     gap: 8,
//     marginTop: 6,
//   },
//   chip: {
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: CARD,
//   },
//   chipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
//   chipText: { color: TEXT, fontWeight: "800", fontSize: 12, maxWidth: 180 },
//   chipTextActive: { color: "#fff" },

//   // Dropdown de estado
//   statusDropdown: {
//     marginTop: 6,
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: CARD,
//     paddingHorizontal: 12,
//     paddingVertical: 8,
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 8,
//   },
//   statusDropdownText: {
//     color: TEXT,
//     fontWeight: "800",
//     fontSize: 12,
//   },
//   statusDot: {
//     width: 10,
//     height: 10,
//     borderRadius: 999,
//   },
//   statusDot_open: {
//     backgroundColor: "#9CA3AF",
//   },
//   statusDot_in_progress: {
//     backgroundColor: ACCENT,
//   },
//   statusDot_done: {
//     backgroundColor: "#22C55E",
//   },
//   statusMenu: {
//     marginTop: 4,
//     borderRadius: 12,
//     backgroundColor: CARD,
//     borderWidth: 1,
//     borderColor: BORDER,
//     overflow: "hidden",
//   },
//   statusOption: {
//     paddingVertical: 6,
//     paddingHorizontal: 10,
//     borderBottomWidth: 1,
//     borderBottomColor: "#1F2933",
//   },
//   statusOptionText: {
//     fontSize: 12,
//     color: TEXT,
//   },

//   // Dropdown de asignación (compacto, armonizado con RelatedActivities pero dark)
//   assignDropdownTrigger: {
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: BORDER,
//     paddingVertical: 6,
//     paddingHorizontal: 10,
//     backgroundColor: CARD,
//     alignSelf: "flex-start",
//   },
//   assignDropdownText: {
//     color: TEXT,
//     fontSize: 10,
//     fontWeight: "700",
//   },
//   assignDropdown: {
//     marginTop: 6,
//     borderRadius: 12,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: FIELD,
//     overflow: "hidden",
//   },
//   assignSectionTitle: {
//     paddingHorizontal: 10,
//     paddingTop: 8,
//     color: TEXT,
//     fontSize: 12,
//     fontWeight: "800",
//   },
//   assignSectionHint: {
//     paddingHorizontal: 10,
//     paddingBottom: 4,
//     color: SUBTLE,
//     fontSize: 11,
//   },
//   assignOption: {
//     paddingVertical: 6,
//     paddingHorizontal: 10,
//     borderTopWidth: 1,
//     borderTopColor: "#1F2933",
//   },
//   assignOptionActive: {
//     backgroundColor: "#1E293B",
//   },
//   assignOptionText: {
//     fontSize: 12,
//     color: TEXT,
//   },
//   assignOptionTextActive: {
//     fontWeight: "700",
//     color: ACCENT,
//   },

//   btn: { marginTop: 6, padding: 12, borderRadius: 12, alignItems: "center" },
//   btnText: { color: "#fff", fontWeight: "900" },
//   btnPrimary: {
//     backgroundColor: PRIMARY,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.16)",
//   },
//   btnGhost: {
//     backgroundColor: "rgba(255,255,255,0.06)",
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.12)",
//   },

//   subtle: { color: SUBTLE },
//   error: { color: "#fecaca" },
// });

