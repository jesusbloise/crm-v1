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
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

/* Paleta */
const PRIMARY = "#7C3AED";
const ACCENT = "#22D3EE";
const BG = "#0F1115";
const CARD = "#171923";
const FIELD = "#121318";
const BORDER = "#2B3140";
const TEXT = "#F3F4F6";
const SUBTLE = "#A4ADBD";

type RelKey = "contact_id";
const TYPES: ActivityType[] = ["task", "call", "meeting"];

/* Estados */
type ActivityStatus = "open" | "in_progress" | "done";

const STATUS_LABEL: Record<ActivityStatus, string> = {
  open: "Abierta",
  in_progress: "En proceso",
  done: "Realizada",
};

type MemberOption = WorkspaceMember;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateToYYYYMMDD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function yyyymmddToDDMMYYYY(yyyymmdd: string) {
  const m = yyyymmdd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function ddmmyyyyToYYYYMMDD(ddmmyyyy: string): string | null {
  const trimmed = ddmmyyyy.trim();
  if (!trimmed) return null;

  // Aceptamos DD/MM/AAAA o DD-MM-AAAA
  const m = trimmed.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);

  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  const d = new Date(yyyy, mm - 1, dd);
  if (Number.isNaN(d.getTime())) return null;

  // Validación fuerte (evita 31/02/2025)
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd)
    return null;

  return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}

function formatDateSpanishFromYYYYMMDD(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;

  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;

  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/* Calendario simple (web) */
function getMonthMatrix(year: number, monthIndex0: number) {
  const first = new Date(year, monthIndex0, 1);
  const startDay = (first.getDay() + 6) % 7; // lunes=0 ... domingo=6

  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < startDay; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });

  while (cells.length % 7 !== 0) cells.push({ day: null });

  // 6 filas para consistencia visual
  while (cells.length < 42) cells.push({ day: null });

  return cells;
}

export default function NewActivity() {
  const params = useLocalSearchParams<{ contact_id?: string }>();
  const qc = useQueryClient();

  const qCon = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

  const qMembers = useQuery({
    queryKey: ["workspaceMembers"],
    queryFn: listWorkspaceMembers,
  });

  const [type, setType] = useState<ActivityType>("task");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  // Interno: YYYY-MM-DD para que todo siga funcionando igual
  const [dateStr, setDateStr] = useState(""); // YYYY-MM-DD

  // Visible: DD/MM/AAAA (español)
  const [dateInput, setDateInput] = useState(""); // DD/MM/AAAA

  const [timeStr, setTimeStr] = useState(""); // HH:MM
  const [remind, setRemind] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<ActivityStatus>("open");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);

  const [contactId, setContactId] = useState<string | undefined>();

  // Picker states
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [iosDateTemp, setIosDateTemp] = useState<Date>(() => new Date());

  // Web calendar states
  const [webCalOpen, setWebCalOpen] = useState(false);
  const [webMonthCursor, setWebMonthCursor] = useState<Date>(() => new Date());

  const locked: Partial<Record<RelKey, true>> = useMemo(() => {
    const lk: Partial<Record<RelKey, true>> = {};
    (["contact_id"] as RelKey[]).forEach((k) => {
      if ((params as any)[k]) lk[k] = true;
    });
    return lk;
  }, [params]);

  useEffect(() => {
    if (params.contact_id) setContactId(String(params.contact_id));
  }, [params]);

  useEffect(() => {
    initNotifications().catch(() => {});
  }, []);

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
    if (!contactId) return "Debes seleccionar un contacto.";

    if (dateStr.trim()) {
      const ts = parseDueDate(dateStr);
      if (isNaN(ts as any)) return "La fecha no es válida.";
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
        return "El recordatorio debe estar en el futuro.";
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

      const due = parseDueDate(dateStr);
      const [a1, a2] = selectedAssignees;

      const payload: any = {
        id: uid(),
        type,
        title: title.trim(),
        status,
        notes: notes.trim() ? notes.trim() : null,
        due_date: due || null,
        contact_id: contactId || null,
        assigned_to: a1 ?? undefined,
        assigned_to_2: a2 ?? undefined,
      };

      await createActivity(payload);

      let eventStart: Date | null = null;
      if (dateStr.trim() && timeStr.trim()) {
        const dueTs = parseDueDate(dateStr);
        const t = parseTime(timeStr);
        if (dueTs && !isNaN(dueTs as any) && t) {
          const when = new Date(dueTs);
          when.setHours(t.h, t.m, 0, 0);
          eventStart = when;
        }
      }

      if (remind && eventStart) {
        await scheduleActivityReminder({
          activityId: payload.id,
          title: payload.title,
          body: payload.notes || `Recordatorio: ${payload.title}`,
          when: eventStart,
        });
      }

      if (eventStart) {
        try {
          await createCalendarEventFromActivity({
            id: payload.id,
            title: payload.title,
            notes: payload.notes ?? null,
            startAt: eventStart,
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

  const members: MemberOption[] = qMembers.data ?? [];

  const getMemberLabel = (id: string): string => {
    const m = members.find((mm) => mm.id === id);
    return m?.name || m?.email || id;
  };

  const toggleAssignee = (id: string) => {
    setSelectedAssignees((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const assignedText = useMemo(() => {
    if (qMembers.isLoading) return "Cargando…";
    if (qMembers.isError) return "Asignar";
    if (selectedAssignees.length === 0) return "Sin asignar";
    if (selectedAssignees.length === 1) return getMemberLabel(selectedAssignees[0]);
    return `${getMemberLabel(selectedAssignees[0])} y ${getMemberLabel(selectedAssignees[1])}`;
  }, [qMembers.isLoading, qMembers.isError, selectedAssignees, members]);

  const prettyDateEs = useMemo(() => {
    return formatDateSpanishFromYYYYMMDD(dateStr);
  }, [dateStr]);

  // Mantener sincronía: si dateStr cambia (por picker), actualiza lo visible en español
  useEffect(() => {
    if (!dateStr.trim()) {
      setDateInput("");
      return;
    }
    const asDDMMYYYY = yyyymmddToDDMMYYYY(dateStr);
    if (asDDMMYYYY) setDateInput(asDDMMYYYY);
  }, [dateStr]);

  // Manual: el usuario escribe DD/MM/AAAA, si es válido convertimos a YYYY-MM-DD interno
  const onChangeDateInput = useCallback((txt: string) => {
    setDateInput(txt);

    const normalized = ddmmyyyyToYYYYMMDD(txt);
    if (normalized) {
      setDateStr(normalized);
    } else {
      // si está vacío, limpia también el interno
      if (!txt.trim()) setDateStr("");
    }
  }, []);

  const openDatePicker = useCallback(() => {
    // Web: abrimos nuestro calendario modal
    if (Platform.OS === "web") {
      const base = parseDueDate(dateStr);
      const start = base && !isNaN(base as any) ? new Date(base) : new Date();
      setWebMonthCursor(new Date(start.getFullYear(), start.getMonth(), 1));
      setWebCalOpen(true);
      return;
    }

    // iOS/Android: datepicker nativo
    const base = parseDueDate(dateStr);
    if (base && !isNaN(base as any)) setIosDateTemp(new Date(base));
    else setIosDateTemp(new Date());
    setDatePickerOpen(true);
  }, [dateStr]);

  const onAndroidDateChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      setDatePickerOpen(false);
      if (event.type !== "set" || !selected) return;
      setDateStr(dateToYYYYMMDD(selected));
    },
    []
  );

  const onIosConfirm = useCallback(() => {
    setDateStr(dateToYYYYMMDD(iosDateTemp));
    setDatePickerOpen(false);
  }, [iosDateTemp]);

  const onIosCancel = useCallback(() => {
    setDatePickerOpen(false);
  }, []);

  // Web calendar select
  const onWebSelectDay = useCallback(
    (day: number) => {
      const d = new Date(webMonthCursor.getFullYear(), webMonthCursor.getMonth(), day);
      setDateStr(dateToYYYYMMDD(d));
      setWebCalOpen(false);
    },
    [webMonthCursor]
  );

  const webMonthLabel = useMemo(() => {
    return webMonthCursor.toLocaleDateString("es-CL", {
      month: "long",
      year: "numeric",
    });
  }, [webMonthCursor]);

  const webCells = useMemo(() => {
    return getMonthMatrix(webMonthCursor.getFullYear(), webMonthCursor.getMonth());
  }, [webMonthCursor]);

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
        <Text style={styles.label}>Tipo</Text>
        <View style={styles.pillsRow}>
          {TYPES.map((t) => {
            const active = type === t;
            return (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {t === "task" ? "Tarea" : t === "call" ? "Llamada" : "Reunión"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { marginTop: 10 }]}>Estado</Text>
        <View>
          <Pressable
            style={styles.statusDropdown}
            onPress={() => setStatusMenuOpen((v) => !v)}
          >
            <View style={[styles.statusDot, styles[`statusDot_${status}` as const]]} />
            <Text style={styles.statusDropdownText}>{STATUS_LABEL[status]}</Text>
          </Pressable>

          {statusMenuOpen && (
            <View style={styles.statusMenu}>
              {(["open", "in_progress", "done"] as ActivityStatus[]).map((st) => (
                <Pressable
                  key={st}
                  style={styles.statusOption}
                  onPress={() => {
                    setStatus(st);
                    setStatusMenuOpen(false);
                  }}
                >
                  <Text style={styles.statusOptionText}>{STATUS_LABEL[st]}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={{ marginTop: 10, gap: 6 }}>
          <Text style={styles.label}>Personas asignadas (máx. 2)</Text>

          <View style={styles.dropdownWrapper}>
            <Pressable
              style={styles.dropdownTrigger}
              onPress={() => setAssignDropdownOpen((v) => !v)}
            >
              <Text style={styles.dropdownText} numberOfLines={1}>
                {assignedText}
              </Text>
              <Text style={styles.dropdownArrow}>
                {assignDropdownOpen ? "▲" : "▼"}
              </Text>
            </Pressable>

            {assignDropdownOpen && (
              <View style={styles.dropdownMenu}>
                {qMembers.isLoading ? (
                  <View style={{ padding: 10 }}>
                    <Text style={styles.subtle}>Cargando miembros…</Text>
                  </View>
                ) : qMembers.isError ? (
                  <View style={{ padding: 10 }}>
                    <Text style={styles.error}>Error cargando miembros.</Text>
                  </View>
                ) : members.length === 0 ? (
                  <View style={{ padding: 10 }}>
                    <Text style={styles.subtle}>No hay miembros en este workspace.</Text>
                  </View>
                ) : (
                  members.map((m) => {
                    const active = selectedAssignees.includes(m.id);
                    const disabled = !active && selectedAssignees.length >= 2;

                    return (
                      <Pressable
                        key={m.id}
                        style={[
                          styles.dropdownOption,
                          active && styles.dropdownOptionActive,
                          disabled && { opacity: 0.5 },
                        ]}
                        onPress={() => toggleAssignee(m.id)}
                        disabled={disabled}
                      >
                        <Text
                          style={[
                            styles.dropdownOptionText,
                            active && styles.dropdownOptionTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {(m.name || m.email || m.id) + (active ? "  ✓" : "")}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </View>
            )}
          </View>
        </View>

        <Text style={styles.label}>Título *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Ej: Llamar para confirmar demo"
          placeholderTextColor={SUBTLE}
        />

        <Text style={styles.label}>Notas</Text>
        <TextInput
          style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Detalles adicionales…"
          placeholderTextColor={SUBTLE}
          multiline
        />

        <View style={styles.plusBox}>
          <Text style={styles.plusTitle}>Agregar al calendario / recordatorio</Text>

          <Text style={styles.plusLabel}>Fecha (DD/MM/AAAA)</Text>

          <View style={styles.dateRow}>
            <TextInput
              style={[styles.plusInput, { flex: 1 }]}
              value={dateInput}
              onChangeText={onChangeDateInput}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              placeholder="28/02/2025"
              placeholderTextColor={SUBTLE}
            />

            <Pressable style={styles.datePickBtn} onPress={openDatePicker}>
              <Text style={styles.datePickBtnText}>Elegir fecha</Text>
            </Pressable>
          </View>

          {prettyDateEs && (
            <Text style={styles.datePreview}>{prettyDateEs}</Text>
          )}

          <View style={styles.plusRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.plusLabel}>Hora (HH:MM)</Text>
              <TextInput
                style={styles.plusInput}
                value={timeStr}
                onChangeText={setTimeStr}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                placeholder="14:30"
                placeholderTextColor={SUBTLE}
              />
            </View>

            <View style={{ alignItems: "center" }}>
              <Text style={styles.plusLabel}>Recordarme</Text>
              <Switch
                value={remind}
                onValueChange={setRemind}
                trackColor={{ false: "#444", true: PRIMARY }}
                thumbColor={remind ? "#fff" : "#ccc"}
              />
            </View>
          </View>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.btn, styles.btnPrimary, mCreate.isPending && { opacity: 0.9 }]}
          onPress={() => mCreate.mutate()}
          disabled={mCreate.isPending}
        >
          <Text style={styles.btnText}>
            {mCreate.isPending ? "Creando…" : "Crear actividad"}
          </Text>
        </Pressable>

        <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => router.back()}>
          <Text style={styles.btnText}>Cancelar</Text>
        </Pressable>
      </ScrollView>

      {/* Android date picker */}
      {datePickerOpen && Platform.OS === "android" && (
        <DateTimePicker
          value={
            (() => {
              const base = parseDueDate(dateStr);
              if (base && !isNaN(base as any)) return new Date(base);
              return new Date();
            })()
          }
          mode="date"
          display="calendar"
          onChange={onAndroidDateChange}
        />
      )}

      {/* iOS date picker */}
      {Platform.OS === "ios" && (
        <Modal
          visible={datePickerOpen}
          transparent
          animationType="fade"
          onRequestClose={onIosCancel}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Seleccionar fecha</Text>

              <DateTimePicker
                value={iosDateTemp}
                mode="date"
                display="spinner"
                onChange={(_, d) => {
                  if (d) setIosDateTemp(d);
                }}
              />

              <View style={styles.modalActions}>
                <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={onIosCancel}>
                  <Text style={styles.modalBtnText}>Cancelar</Text>
                </Pressable>

                <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={onIosConfirm}>
                  <Text style={styles.modalBtnText}>Listo</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Web calendar modal */}
      {Platform.OS === "web" && (
        <Modal
          visible={webCalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setWebCalOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.webCalCard}>
              <View style={styles.webCalHeader}>
                <Pressable
                  style={styles.webCalNavBtn}
                  onPress={() => {
                    setWebMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
                  }}
                >
                  <Text style={styles.webCalNavText}>‹</Text>
                </Pressable>

                <Text style={styles.webCalTitle}>{webMonthLabel}</Text>

                <Pressable
                  style={styles.webCalNavBtn}
                  onPress={() => {
                    setWebMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
                  }}
                >
                  <Text style={styles.webCalNavText}>›</Text>
                </Pressable>
              </View>

              <View style={styles.webCalWeekRow}>
                {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
                  <Text key={d} style={styles.webCalWeekCell}>{d}</Text>
                ))}
              </View>

              <View style={styles.webCalGrid}>
                {webCells.map((c, idx) => {
                  const day = c.day;
                  const isEmpty = day == null;

                  // activo si coincide con dateStr actual
                  const active =
                    !!day &&
                    dateStr ===
                      dateToYYYYMMDD(
                        new Date(webMonthCursor.getFullYear(), webMonthCursor.getMonth(), day)
                      );

                  return (
                    <Pressable
                      key={idx}
                      style={[
                        styles.webCalCell,
                        isEmpty && { opacity: 0 },
                        active && styles.webCalCellActive,
                      ]}
                      disabled={isEmpty}
                      onPress={() => {
                        if (!day) return;
                        onWebSelectDay(day);
                      }}
                    >
                      <Text style={[styles.webCalCellText, active && styles.webCalCellTextActive]}>
                        {day ?? ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.webCalFooter}>
                <Pressable
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={() => setWebCalOpen(false)}
                >
                  <Text style={styles.modalBtnText}>Cerrar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

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
  statusDot: { width: 10, height: 10, borderRadius: 999 },
  statusDot_open: { backgroundColor: "#9CA3AF" },
  statusDot_in_progress: { backgroundColor: ACCENT },
  statusDot_done: { backgroundColor: "#22C55E" },
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
  statusOptionText: { fontSize: 12, color: TEXT },

  dropdownWrapper: { alignSelf: "flex-start", minWidth: 220 },
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownText: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  dropdownArrow: { color: SUBTLE, fontSize: 10, marginLeft: 6 },
  dropdownMenu: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    overflow: "hidden",
    minWidth: 220,
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2933",
  },
  dropdownOptionActive: { backgroundColor: "#1E293B" },
  dropdownOptionText: { color: TEXT, fontSize: 12 },
  dropdownOptionTextActive: { color: ACCENT, fontWeight: "700" },

  plusBox: {
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.35)",
    backgroundColor: "rgba(34,211,238,0.06)",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  plusTitle: { color: TEXT, fontWeight: "900", fontSize: 13 },
  plusLabel: { color: SUBTLE, fontWeight: "800", fontSize: 12 },
  plusInput: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 12,
    padding: 12,
  },
  plusRow: { flexDirection: "row", alignItems: "center", gap: 12 },

  dateRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  datePickBtn: {
    backgroundColor: "rgba(124,58,237,0.18)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  datePickBtnText: { color: TEXT, fontWeight: "900", fontSize: 12 },

  datePreview: {
    color: SUBTLE,
    fontSize: 12,
    marginTop: -2,
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 10,
  },
  modalTitle: {
    color: TEXT,
    fontWeight: "900",
    fontSize: 14,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalBtnPrimary: {
    backgroundColor: PRIMARY,
    borderColor: "rgba(255,255,255,0.14)",
  },
  modalBtnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  modalBtnText: { color: "#fff", fontWeight: "900" },

  webCalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 10,
  },
  webCalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  webCalTitle: {
    color: TEXT,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  webCalNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FIELD,
  },
  webCalNavText: { color: TEXT, fontSize: 18, fontWeight: "900" },
  webCalWeekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 6,
  },
  webCalWeekCell: {
    width: 44,
    textAlign: "center",
    color: SUBTLE,
    fontWeight: "900",
  },
  webCalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "space-between",
    paddingHorizontal: 6,
  },
  webCalCell: {
    width: 44,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    alignItems: "center",
    justifyContent: "center",
  },
  webCalCellActive: {
    borderColor: PRIMARY,
    backgroundColor: "rgba(124,58,237,0.22)",
  },
  webCalCellText: {
    color: TEXT,
    fontWeight: "900",
  },
  webCalCellTextActive: {
    color: "#E9D5FF",
  },
  webCalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
  },
});

// // app/tasks/new.tsx
// import { createActivity, type ActivityType } from "@/src/api/activities";
// import { listContacts } from "@/src/api/contacts";
// import {
//   listWorkspaceMembers,
//   type WorkspaceMember,
// } from "@/src/api/workspaceMembers";

// import { createCalendarEventFromActivity } from "@/src/lib/googleCalendar";
// import {
//   initNotifications,
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
//   const params = useLocalSearchParams<{ contact_id?: string }>();
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

//   // recordatorio / calendario
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

//   // bloquear si vienen por query
//   const locked: Partial<Record<RelKey, true>> = useMemo(() => {
//     const lk: Partial<Record<RelKey, true>> = {};
//     (["contact_id"] as RelKey[]).forEach((k) => {
//       if ((params as any)[k]) lk[k] = true;
//     });
//     return lk;
//   }, [params]);

//   useEffect(() => {
//     if (params.contact_id) setContactId(String(params.contact_id));
//   }, [params]);

//   useEffect(() => {
//     initNotifications().catch(() => {});
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

//     // 🔥 regla: debe tener contacto sí o sí
//     if (!contactId) return "Debes seleccionar un contacto.";

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
//         return "El recordatorio debe estar en el futuro.";
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
//         status,
//         notes: notes.trim() ? notes.trim() : null,
//         due_date: due || null,
//         contact_id: contactId || null,
//         assigned_to: a1 ?? undefined,
//         assigned_to_2: a2 ?? undefined,
//       };

//       // 1) Crear actividad en tu backend
//       await createActivity(payload);

//       // 2) Calcular fecha/hora completa si se ingresaron
//       let eventStart: Date | null = null;
//       if (dateStr.trim() && timeStr.trim()) {
//         const dueTs = parseDueDate(dateStr);
//         const t = parseTime(timeStr);
//         if (dueTs && !isNaN(dueTs as any) && t) {
//           const when = new Date(dueTs);
//           when.setHours(t.h, t.m, 0, 0);
//           eventStart = when;
//         }
//       }

//       // 3) Si hay recordatorio → programar notificación local
//       if (remind && eventStart) {
//         await scheduleActivityReminder({
//           activityId: payload.id,
//           title: payload.title,
//           body: payload.notes || `Recordatorio: ${payload.title}`,
//           when: eventStart,
//         });
//       }

//       // 4) Crear evento en Google Calendar si tenemos fecha/hora válidas
//       if (eventStart) {
//         try {
//           await createCalendarEventFromActivity({
//             id: payload.id,
//             title: payload.title,
//             notes: payload.notes ?? null,
//             startAt: eventStart,
//           });
//         } catch (e) {
//           console.warn("No se pudo crear evento en Google Calendar:", e);
//         }
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
//           {items.length === 0 && <Text style={styles.subtle}>— vacío —</Text>}
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

//   const toggleAssignee = (id: string) => {
//     setSelectedAssignees((prev) => {
//       if (prev.includes(id)) return prev.filter((x) => x !== id);
//       if (prev.length >= 2) return prev;
//       return [...prev, id];
//     });
//   };

//   const assignedText = useMemo(() => {
//     if (qMembers.isLoading) return "Cargando…";
//     if (qMembers.isError) return "Asignar";
//     if (selectedAssignees.length === 0) return "Sin asignar";
//     if (selectedAssignees.length === 1) return getMemberLabel(selectedAssignees[0]);
//     return `${getMemberLabel(selectedAssignees[0])} y ${getMemberLabel(selectedAssignees[1])}`;
//   }, [qMembers.isLoading, qMembers.isError, selectedAssignees, members]);

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
//                 <Text style={[styles.pillText, active && styles.pillTextActive]}>
//                   {t === "task" ? "Tarea" : t === "call" ? "Llamada" : "Reunión"}
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
//             <View style={[styles.statusDot, styles[`statusDot_${status}` as const]]} />
//             <Text style={styles.statusDropdownText}>{STATUS_LABEL[status]}</Text>
//           </Pressable>

//           {statusMenuOpen && (
//             <View style={styles.statusMenu}>
//               {(["open", "in_progress", "done"] as ActivityStatus[]).map((st) => (
//                 <Pressable
//                   key={st}
//                   style={styles.statusOption}
//                   onPress={() => {
//                     setStatus(st);
//                     setStatusMenuOpen(false);
//                   }}
//                 >
//                   <Text style={styles.statusOptionText}>{STATUS_LABEL[st]}</Text>
//                 </Pressable>
//               ))}
//             </View>
//           )}
//         </View>

//         {/* ✅ Asignación – dropdown estilo DETAIL */}
//         <View style={{ marginTop: 10, gap: 6 }}>
//           <Text style={styles.label}>Personas asignadas (máx. 2)</Text>

//           <View style={styles.dropdownWrapper}>
//             <Pressable
//               style={styles.dropdownTrigger}
//               onPress={() => setAssignDropdownOpen((v) => !v)}
//             >
//               <Text style={styles.dropdownText} numberOfLines={1}>
//                 {assignedText}
//               </Text>
//               <Text style={styles.dropdownArrow}>
//                 {assignDropdownOpen ? "▲" : "▼"}
//               </Text>
//             </Pressable>

//             {assignDropdownOpen && (
//               <View style={styles.dropdownMenu}>
//                 {qMembers.isLoading ? (
//                   <View style={{ padding: 10 }}>
//                     <Text style={styles.subtle}>Cargando miembros…</Text>
//                   </View>
//                 ) : qMembers.isError ? (
//                   <View style={{ padding: 10 }}>
//                     <Text style={styles.error}>Error cargando miembros.</Text>
//                   </View>
//                 ) : members.length === 0 ? (
//                   <View style={{ padding: 10 }}>
//                     <Text style={styles.subtle}>No hay miembros en este workspace.</Text>
//                   </View>
//                 ) : (
//                   members.map((m) => {
//                     const active = selectedAssignees.includes(m.id);
//                     const disabled = !active && selectedAssignees.length >= 2;

//                     return (
//                       <Pressable
//                         key={m.id}
//                         style={[
//                           styles.dropdownOption,
//                           active && styles.dropdownOptionActive,
//                           disabled && { opacity: 0.5 },
//                         ]}
//                         onPress={() => toggleAssignee(m.id)}
//                         disabled={disabled}
//                       >
//                         <Text
//                           style={[
//                             styles.dropdownOptionText,
//                             active && styles.dropdownOptionTextActive,
//                           ]}
//                           numberOfLines={1}
//                         >
//                           {(m.name || m.email || m.id) + (active ? "  ✓" : "")}
//                         </Text>
//                       </Pressable>
//                     );
//                   })
//                 )}
//               </View>
//             )}
//           </View>
//         </View>

//         {/* ✅ ORDEN NUEVO: Título → Notas */}
//         <Text style={styles.label}>Título *</Text>
//         <TextInput
//           style={styles.input}
//           value={title}
//           onChangeText={setTitle}
//           placeholder="Ej: Llamar para confirmar demo"
//           placeholderTextColor={SUBTLE}
//         />

//         <Text style={styles.label}>Notas</Text>
//         <TextInput
//           style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
//           value={notes}
//           onChangeText={setNotes}
//           placeholder="Detalles adicionales…"
//           placeholderTextColor={SUBTLE}
//           multiline
//         />

//         {/* ✅ “PLUS” recordatorio/calendario (cuadro remarcado) */}
//         <View style={styles.plusBox}>
//           <Text style={styles.plusTitle}>Agregar al calendario / recordatorio</Text>

//           <Text style={styles.plusLabel}>Fecha (YYYY-MM-DD)</Text>
//           <TextInput
//             style={styles.plusInput}
//             value={dateStr}
//             onChangeText={setDateStr}
//             autoCapitalize="none"
//             keyboardType="numbers-and-punctuation"
//             placeholder="2025-02-28"
//             placeholderTextColor={SUBTLE}
//           />

//           <View style={styles.plusRow}>
//             <View style={{ flex: 1 }}>
//               <Text style={styles.plusLabel}>Hora (HH:MM)</Text>
//               <TextInput
//                 style={styles.plusInput}
//                 value={timeStr}
//                 onChangeText={setTimeStr}
//                 autoCapitalize="none"
//                 keyboardType="numbers-and-punctuation"
//                 placeholder="14:30"
//                 placeholderTextColor={SUBTLE}
//               />
//             </View>

//             <View style={{ alignItems: "center" }}>
//               <Text style={styles.plusLabel}>Recordarme</Text>
//               <Switch
//                 value={remind}
//                 onValueChange={setRemind}
//                 trackColor={{ false: "#444", true: PRIMARY }}
//                 thumbColor={remind ? "#fff" : "#ccc"}
//               />
//             </View>
//           </View>
//         </View>

//         {/* Contacto */}
//         {/* <Chips
//           title="Contacto"
//           items={conOpts}
//           selected={contactId}
//           onSelect={setContactId}
//           locked={!!locked.contact_id}
//         /> */}

//         {!!error && <Text style={styles.error}>{error}</Text>}

//         <Pressable
//           style={[styles.btn, styles.btnPrimary, mCreate.isPending && { opacity: 0.9 }]}
//           onPress={() => mCreate.mutate()}
//           disabled={mCreate.isPending}
//         >
//           <Text style={styles.btnText}>
//             {mCreate.isPending ? "Creando…" : "Crear actividad"}
//           </Text>
//         </Pressable>

//         <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => router.back()}>
//           <Text style={styles.btnText}>Cancelar</Text>
//         </Pressable>
//       </ScrollView>
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
//   statusDot: { width: 10, height: 10, borderRadius: 999 },
//   statusDot_open: { backgroundColor: "#9CA3AF" },
//   statusDot_in_progress: { backgroundColor: ACCENT },
//   statusDot_done: { backgroundColor: "#22C55E" },
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
//   statusOptionText: { fontSize: 12, color: TEXT },

//   // ✅ Dropdown asignación (mismo estilo del detail)
//   dropdownWrapper: { alignSelf: "flex-start", minWidth: 220 },
//   dropdownTrigger: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: FIELD,
//     paddingHorizontal: 12,
//     paddingVertical: 10,
//   },
//   dropdownText: {
//     color: TEXT,
//     fontSize: 12,
//     fontWeight: "700",
//     flexShrink: 1,
//   },
//   dropdownArrow: { color: SUBTLE, fontSize: 10, marginLeft: 6 },
//   dropdownMenu: {
//     marginTop: 6,
//     borderRadius: 12,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: FIELD,
//     overflow: "hidden",
//     minWidth: 220,
//   },
//   dropdownOption: {
//     paddingHorizontal: 12,
//     paddingVertical: 10,
//     borderBottomWidth: 1,
//     borderBottomColor: "#1f2933",
//   },
//   dropdownOptionActive: { backgroundColor: "#1E293B" },
//   dropdownOptionText: { color: TEXT, fontSize: 12 },
//   dropdownOptionTextActive: { color: ACCENT, fontWeight: "700" },

//   // ✅ “PLUS” box recordatorio/calendario
//   plusBox: {
//     borderWidth: 1,
//     borderColor: "rgba(34,211,238,0.35)",
//     backgroundColor: "rgba(34,211,238,0.06)",
//     borderRadius: 14,
//     padding: 12,
//     gap: 8,
//   },
//   plusTitle: { color: TEXT, fontWeight: "900", fontSize: 13 },
//   plusLabel: { color: SUBTLE, fontWeight: "800", fontSize: 12 },
//   plusInput: {
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: FIELD,
//     color: TEXT,
//     borderRadius: 12,
//     padding: 12,
//   },
//   plusRow: { flexDirection: "row", alignItems: "center", gap: 12 },

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
