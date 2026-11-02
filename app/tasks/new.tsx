// app/tasks/new.tsx
import { createActivity, type ActivityType } from "@/src/api/activities";
import { getAuthStorageScope } from "@/src/api/auth";
import {
  getContact,
  listContacts,
  type Contact,
} from "@/src/api/contacts";
import {
  listWorkspaceMembers,
  type WorkspaceMember,
} from "@/src/api/workspaceMembers";

import {
  createCalendarEventFromActivity,
  enqueueCalendarEventFromActivity,
} from "@/src/lib/googleCalendar";

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

import AsyncStorage from "@react-native-async-storage/async-storage";

import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

/* Paleta */
const PRIMARY = "#7551c8";
const ACCENT = "#4878c7";
const BG = "#f5f6fa";
const CARD = "#ffffff";
const FIELD = "#ffffff";
const BORDER = "#e7e9f0";
const TEXT = "#202536";
const SUBTLE = "#737b8e";

/* Key para evento local */
const LOCAL_EVENT_MAP_KEY = "activityEventLocal:v1";

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

  const m = trimmed.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);

  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  const d = new Date(yyyy, mm - 1, dd);
  if (Number.isNaN(d.getTime())) return null;

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

function formatDateShortEs(ms: number) {
  return new Date(ms).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTimeShortEs(ms: number) {
  return new Date(ms).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
  while (cells.length < 42) cells.push({ day: null });

  return cells;
}

async function saveLocalEvent(activityId: string, eventMs: number) {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_EVENT_MAP_KEY);
    const current = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const next = { ...(current || {}), [activityId]: eventMs };
    await AsyncStorage.setItem(LOCAL_EVENT_MAP_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("No se pudo guardar evento local:", e);
  }
}

export default function NewActivity() {
  const params = useLocalSearchParams<{ contact_id?: string }>();
  const qc = useQueryClient();

  const [contactSearch, setContactSearch] = useState("");
  const [debouncedContactSearch, setDebouncedContactSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactScope, setContactScope] = useState<string | null>(null);
  const [contactScopeError, setContactScopeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getAuthStorageScope()
      .then((scope) => {
        if (cancelled) return;

        if (!scope) {
          setContactScopeError(
            "No se pudo comprobar la sesión. Reabre el formulario."
          );
          return;
        }

        setContactScope(scope.storageKey);
      })
      .catch(() => {
        if (!cancelled) {
          setContactScopeError(
            "No se pudo comprobar la sesión. Reabre el formulario."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedContactSearch(contactSearch.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [contactSearch]);

  const inheritedContactId =
    typeof params.contact_id === "string" ? params.contact_id : "";

  async function assertContactScope() {
    const current = await getAuthStorageScope();

    if (!contactScope || current?.storageKey !== contactScope) {
      throw new Error(
        "Cambió la sesión o el workspace. Reabre el formulario."
      );
    }
  }

  const qContacts = useQuery({
    queryKey: [
      "contact-search",
      contactScope,
      debouncedContactSearch,
    ],
    queryFn: async () => {
      await assertContactScope();

      const contacts = await listContacts({
        q: debouncedContactSearch,
        limit: 20,
      });

      await assertContactScope();
      return contacts;
    },
    enabled:
      Boolean(contactScope) &&
      !inheritedContactId &&
      debouncedContactSearch.length >= 2,
    retry: false,
    staleTime: 0,
  });

  const qInheritedContact = useQuery({
    queryKey: ["contact", inheritedContactId, contactScope],
    queryFn: async () => {
      await assertContactScope();
      const contact = await getContact(inheritedContactId);
      await assertContactScope();
      return contact;
    },
    enabled: Boolean(contactScope) && Boolean(inheritedContactId),
    retry: false,
  });

  const contactSearchPending =
    contactSearch.trim() !== debouncedContactSearch;

  const contactResults =
    contactSearch.trim().length >= 2 && !contactSearchPending
      ? qContacts.data ?? []
      : [];


  const qMembers = useQuery({
    queryKey: ["workspaceMembers"],
    queryFn: listWorkspaceMembers,
  });

  const [type, setType] = useState<ActivityType>("task");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  const [dateStr, setDateStr] = useState(""); // YYYY-MM-DD
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

      const dueBase = parseDueDate(dateStr); // fecha (00:00)
      let due: number | null = dueBase;

      if (dueBase && timeStr.trim()) {
        const t = parseTime(timeStr);
        if (t) {
          const when = new Date(dueBase);
          when.setHours(t.h, t.m, 0, 0);
          due = when.getTime();
        }
      }

      const [a1, a2] = selectedAssignees;

      const tempId = uid();

      const payload: any = {
        id: tempId,
        type,
        title: title.trim(),
        status,
        notes: notes.trim() ? notes.trim() : null,
        due_date: due || null,
        contact_id: contactId || null,
        assigned_to: a1 ?? undefined,
        assigned_to_2: a2 ?? undefined,
      };

      // 👇 importante: captura el id real si el backend lo cambia
      const created: any = await createActivity(payload);
      const realId: string = created?.id || payload.id;

      // Determinar eventStart y guardar fallback local
      // - si hay fecha+hora -> eventStart exacto
      // - si hay solo fecha -> guardamos medianoche (dueBase)
      let eventStart: Date | null = null;
      let eventMsToStore: number | null = null;

      if (dateStr.trim()) {
        if (timeStr.trim()) {
          const dueTs = parseDueDate(dateStr);
          const t = parseTime(timeStr);
          if (dueTs && !isNaN(dueTs as any) && t) {
            const when = new Date(dueTs);
            when.setHours(t.h, t.m, 0, 0);
            eventStart = when;
            eventMsToStore = when.getTime();
          }
        } else if (dueBase && !isNaN(dueBase as any)) {
          // solo fecha
          eventMsToStore = dueBase;
        }
      }

      if (eventMsToStore != null) {
        await saveLocalEvent(realId, eventMsToStore);
      }

      if (remind && eventStart) {
        await scheduleActivityReminder({
          activityId: realId,
          title: payload.title,
          body: payload.notes || `Recordatorio: ${payload.title}`,
          when: eventStart,
        });
      }

      // ✅ GOOGLE CALENDAR: crear o encolar (sin romper flujo actual)
      if (eventStart) {
        try {
          await createCalendarEventFromActivity({
            id: realId,
            title: payload.title,
            notes: payload.notes ?? null,
            startAt: eventStart,
          });

          // Opcional: si quieres que al crear una actividad y ya hay token,
          // también intente vaciar la cola en background (sin bloquear).
          // flushCalendarQueue().catch(() => {});
        } catch (e) {
          // Si falló por no estar conectado o cualquier error de red,
          // lo metemos a cola para que aparezca cuando sincronice.
          try {
            await enqueueCalendarEventFromActivity({
              id: realId,
              title: payload.title,
              notes: payload.notes ?? null,
              startAt: eventStart,
            });
          } catch (e2) {
            console.warn("No se pudo encolar evento para Google Calendar:", e2);
          }

          console.warn("No se pudo crear evento en Google Calendar:", e);
        }
      }
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["activities"] }),
        qc.invalidateQueries({ queryKey: ["activities-all"] }),
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
    if (selectedAssignees.length === 1)
      return getMemberLabel(selectedAssignees[0]);
    return `${getMemberLabel(selectedAssignees[0])} y ${getMemberLabel(
      selectedAssignees[1]
    )}`;
  }, [qMembers.isLoading, qMembers.isError, selectedAssignees, members]);

  const prettyDateEs = useMemo(() => {
    return formatDateSpanishFromYYYYMMDD(dateStr);
  }, [dateStr]);

  const duePreview = useMemo(() => {
    if (!dateStr.trim()) return null;

    const dueBase = parseDueDate(dateStr);
    if (!dueBase || isNaN(dueBase as any)) return null;

    const t = timeStr.trim() ? parseTime(timeStr) : null;
    if (t) {
      const when = new Date(dueBase);
      when.setHours(t.h, t.m, 0, 0);
      return {
        label: "Fecha y hora",
        value: formatDateTimeShortEs(when.getTime()),
      };
    }

    return {
      label: "Fecha",
      value: formatDateShortEs(dueBase),
    };
  }, [dateStr, timeStr]);

  const remindPreview = useMemo(() => {
    if (!remind) return null;
    if (!dateStr.trim()) return null;

    const dueBase = parseDueDate(dateStr);
    const t = parseTime(timeStr);

    if (!dueBase || isNaN(dueBase as any) || !t) return null;

    const when = new Date(dueBase);
    when.setHours(t.h, t.m, 0, 0);

    if (when.getTime() <= Date.now()) return null;

    return formatDateTimeShortEs(when.getTime());
  }, [remind, dateStr, timeStr]);

  useEffect(() => {
    if (!dateStr.trim()) {
      setDateInput("");
      return;
    }
    const asDDMMYYYY = yyyymmddToDDMMYYYY(dateStr);
    if (asDDMMYYYY) setDateInput(asDDMMYYYY);
  }, [dateStr]);

  const onChangeDateInput = useCallback((txt: string) => {
    setDateInput(txt);

    const normalized = ddmmyyyyToYYYYMMDD(txt);
    if (normalized) {
      setDateStr(normalized);
    } else {
      if (!txt.trim()) setDateStr("");
    }
  }, []);

  const openDatePicker = useCallback(() => {
    if (Platform.OS === "web") {
      const base = parseDueDate(dateStr);
      const start = base && !isNaN(base as any) ? new Date(base) : new Date();
      setWebMonthCursor(new Date(start.getFullYear(), start.getMonth(), 1));
      setWebCalOpen(true);
      return;
    }

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

  const onWebSelectDay = useCallback(
    (day: number) => {
      const d = new Date(
        webMonthCursor.getFullYear(),
        webMonthCursor.getMonth(),
        day
      );
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
    return getMonthMatrix(
      webMonthCursor.getFullYear(),
      webMonthCursor.getMonth()
    );
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

            <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Nueva actividad</Text>
          <Text style={styles.pageDescription}>
            Define la tarea, sus responsables y la fecha de seguimiento.
          </Text>
        </View>

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
            <View
              style={[
                styles.statusDot,
                styles[`statusDot_${status}` as const],
              ]}
            />
            <Text style={styles.statusDropdownText}>{STATUS_LABEL[status]}</Text>
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
                    <Text style={styles.subtle}>
                      No hay miembros en este workspace.
                    </Text>
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
                          {(m.name || m.email || m.id) + (active ? "  OK" : "")}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </View>
            )}
          </View>
        </View>
        <Text style={styles.label}>Contacto *</Text>

        {contactScopeError ? (
          <Text style={styles.error}>{contactScopeError}</Text>
        ) : locked.contact_id ? (
          <View style={styles.contactSelected}>
            <Text style={styles.contactSelectedText}>
              {qInheritedContact.isError
                ? "No se pudo cargar el contacto"
                : qInheritedContact.data?.name || "Cargando contacto…"}
            </Text>

            <Text style={styles.subtle}>
              Esta actividad está vinculada al contacto desde el que ingresaste.
            </Text>

            {qInheritedContact.isError && (
              <Pressable onPress={() => void qInheritedContact.refetch()}>
                <Text style={styles.contactSelectedText}>Reintentar</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.contactSelector}>
            {selectedContact && (
              <View style={styles.contactSelected}>
                <Text style={styles.contactSelectedText}>
                  Seleccionado: {selectedContact.name}
                </Text>

                {Boolean(selectedContact.company || selectedContact.email) && (
                  <Text style={styles.subtle}>
                    {[selectedContact.company, selectedContact.email]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                )}

                <Pressable
                  onPress={() => {
                    setSelectedContact(null);
                    setContactId(undefined);
                  }}
                >
                  <Text style={styles.contactSelectedText}>
                    Quitar selección
                  </Text>
                </Pressable>
              </View>
            )}

            <TextInput
              style={styles.input}
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Buscar por nombre, empresa o correo"
              placeholderTextColor={SUBTLE}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Buscar contacto"
              maxLength={120}
            />

            {!contactScope ? (
              <Text style={styles.subtle}>Comprobando sesión…</Text>
            ) : contactSearch.trim().length < 2 ? (
              <Text style={styles.subtle}>
                Escribe al menos 2 caracteres para buscar.
              </Text>
            ) : contactSearchPending || qContacts.isFetching ? (
              <Text style={styles.subtle}>Buscando contactos…</Text>
            ) : qContacts.isError ? (
              <View style={styles.contactSelector}>
                <Text style={styles.error}>
                  No se pudieron buscar los contactos.
                </Text>

                <Pressable onPress={() => void qContacts.refetch()}>
                  <Text style={styles.contactSelectedText}>Reintentar</Text>
                </Pressable>
              </View>
            ) : qContacts.isSuccess && contactResults.length === 0 ? (
              <Text style={styles.subtle}>
                No hay contactos que coincidan con la búsqueda.
              </Text>
            ) : contactResults.length > 0 ? (
              <>
                <ScrollView
                  style={styles.contactResults}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {contactResults.map((contact) => {
                    const selected = contactId === contact.id;

                    return (
                      <Pressable
                        key={contact.id}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        onPress={() => {
                          setSelectedContact(contact);
                          setContactId(contact.id);
                        }}
                        style={[
                          styles.contactOption,
                          selected && styles.contactOptionActive,
                        ]}
                      >
                        <View style={styles.contactOptionInfo}>
                          <Text style={styles.contactName}>
                            {contact.name || "Sin nombre"}
                          </Text>

                          {Boolean(contact.company || contact.email) && (
                            <Text style={styles.subtle}>
                              {[contact.company, contact.email]
                                .filter(Boolean)
                                .join(" · ")}
                            </Text>
                          )}
                        </View>

                        <Text style={styles.contactSelectedText}>
                          {selected ? "✓" : "○"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {contactResults.length === 20 && (
                  <Text style={styles.subtle}>
                    Se muestran hasta 20 coincidencias. Escribe más detalles
                    para precisar la búsqueda.
                  </Text>
                )}
              </>
            ) : null}
          </View>
        )}


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

          {(duePreview || remind) && (
            <View style={styles.plusSummary}>
              {duePreview && (
                <View style={styles.plusSummaryRow}>
                  <Text style={styles.plusSummaryLabel}>{duePreview.label}:</Text>
                  <Text style={styles.plusSummaryValue}>{duePreview.value}</Text>
                </View>
              )}

              {remind && (
                <View style={styles.plusSummaryRow}>
                  <Text style={styles.plusSummaryLabel}>Recordatorio:</Text>
                  <Text style={styles.plusSummaryValue}>
                    {remindPreview ? remindPreview : "Completa fecha y hora válida"}
                  </Text>
                </View>
              )}
            </View>
          )}

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

          {prettyDateEs && <Text style={styles.datePreview}>{prettyDateEs}</Text>}

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

      {datePickerOpen && Platform.OS === "android" && (
        <DateTimePicker
          value={(() => {
            const base = parseDueDate(dateStr);
            if (base && !isNaN(base as any)) return new Date(base);
            return new Date();
          })()}
          mode="date"
          display="calendar"
          onChange={onAndroidDateChange}
        />
      )}

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
                <Pressable
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={onIosCancel}
                >
                  <Text style={styles.modalBtnText}>Cancelar</Text>
                </Pressable>

                <Pressable
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={onIosConfirm}
                >
                  <Text style={styles.modalBtnText}>Listo</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

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
                    setWebMonthCursor(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                    );
                  }}
                >
                  <Text style={styles.webCalNavText}>{"<"}</Text>
                </Pressable>

                <Text style={styles.webCalTitle}>{webMonthLabel}</Text>

                <Pressable
                  style={styles.webCalNavBtn}
                  onPress={() => {
                    setWebMonthCursor(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                    );
                  }}
                >
                  <Text style={styles.webCalNavText}>{">"}</Text>
                </Pressable>
              </View>

              <View style={styles.webCalWeekRow}>
                {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
                  <Text key={d} style={styles.webCalWeekCell}>
                    {d}
                  </Text>
                ))}
              </View>

              <View style={styles.webCalGrid}>
                {webCells.map((c, idx) => {
                  const day = c.day;
                  const isEmpty = day == null;

                  const active =
                    !!day &&
                    dateStr ===
                      dateToYYYYMMDD(
                        new Date(
                          webMonthCursor.getFullYear(),
                          webMonthCursor.getMonth(),
                          day
                        )
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
                      <Text
                        style={[
                          styles.webCalCellText,
                          active && styles.webCalCellTextActive,
                        ]}
                      >
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
    contactSelector: {
    gap: 10,
    minWidth: 0,
  },
  contactSelected: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#daceef",
    borderRadius: 8,
    backgroundColor: "#f1ecfa",
    gap: 6,
  },
  contactSelectedText: {
    color: PRIMARY,
    fontSize: 13,
    fontWeight: "600",
  },
  contactResults: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    backgroundColor: CARD,
  },
  contactOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  contactOptionActive: {
    backgroundColor: "#f1ecfa",
  },
  contactOptionInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  contactName: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "600",
  },
  container: {
    width: "100%",
    maxWidth: 960,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 48,
    gap: 12,
  },

  pageHeader: {
    gap: 6,
    marginBottom: 12,
  },
  pageTitle: {
    color: TEXT,
    fontSize: 25,
    fontWeight: "700",
  },
  pageDescription: {
    color: SUBTLE,
    fontSize: 13,
    lineHeight: 20,
  },
  label: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },

  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: CARD,
  },
  pillActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  pillText: {
    fontSize: 12,
    color: TEXT,
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#ffffff",
    fontWeight: "600",
  },

  input: {
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 21,
  },

  statusDropdown: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: CARD,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  statusDropdownText: {
    color: TEXT,
    fontWeight: "500",
    fontSize: 13,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  statusDot_open: { backgroundColor: "#98a2b3" },
  statusDot_in_progress: { backgroundColor: ACCENT },
  statusDot_done: { backgroundColor: "#399568" },
  statusMenu: {
    marginTop: 6,
    borderRadius: 8,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  statusOption: {
    minHeight: 42,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  statusOptionText: {
    fontSize: 13,
    color: TEXT,
  },

  dropdownWrapper: {
    width: "100%",
    minWidth: 0,
  },
  dropdownTrigger: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: FIELD,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 10,
  },
  dropdownText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
    minWidth: 0,
  },
  dropdownArrow: {
    color: SUBTLE,
    fontSize: 10,
  },
  dropdownMenu: {
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    overflow: "hidden",
  },
  dropdownOption: {
    minHeight: 42,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  dropdownOptionActive: {
    backgroundColor: "#f1ecfa",
  },
  dropdownOptionText: {
    color: TEXT,
    fontSize: 13,
  },
  dropdownOptionTextActive: {
    color: PRIMARY,
    fontWeight: "600",
  },

  plusBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e2d9f2",
    backgroundColor: "#faf8fe",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  plusTitle: {
    color: TEXT,
    fontWeight: "600",
    fontSize: 15,
    lineHeight: 22,
  },
  plusLabel: {
    color: "#596274",
    fontWeight: "600",
    fontSize: 12,
    marginBottom: 5,
  },
  plusInput: {
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  plusRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },

  plusSummary: {
    borderWidth: 1,
    borderColor: "#e2d9f2",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  plusSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  plusSummaryLabel: {
    color: SUBTLE,
    fontWeight: "500",
    fontSize: 12,
  },
  plusSummaryValue: {
    color: TEXT,
    fontWeight: "600",
    fontSize: 12,
    lineHeight: 19,
    flexShrink: 1,
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  datePickBtn: {
    minHeight: 44,
    backgroundColor: "#eee8f8",
    borderWidth: 1,
    borderColor: "#daceef",
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  datePickBtnText: {
    color: PRIMARY,
    fontWeight: "600",
    fontSize: 12,
  },
  datePreview: {
    color: SUBTLE,
    fontSize: 12,
    lineHeight: 19,
  },

  btn: {
    minHeight: 44,
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 13,
  },
  btnPrimary: {
    backgroundColor: PRIMARY,
  },
  btnGhost: {
    backgroundColor: "#596274",
  },

  subtle: {
    color: SUBTLE,
    fontSize: 13,
    lineHeight: 20,
  },
  error: {
    color: "#a12637",
    fontSize: 13,
    lineHeight: 20,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(23,29,45,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 12,
  },
  modalTitle: {
    color: TEXT,
    fontWeight: "600",
    fontSize: 15,
  },
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  },
  modalBtn: {
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnPrimary: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  modalBtnGhost: {
    backgroundColor: "#596274",
    borderColor: "#596274",
  },
  modalBtnText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 12,
  },

  webCalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 12,
  },
  webCalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  webCalTitle: {
    color: TEXT,
    fontWeight: "600",
    fontSize: 14,
    textTransform: "capitalize",
    flexShrink: 1,
    textAlign: "center",
  },
  webCalNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f6fa",
  },
  webCalNavText: {
    color: TEXT,
    fontSize: 18,
    fontWeight: "600",
  },
  webCalWeekRow: {
    flexDirection: "row",
  },
  webCalWeekCell: {
    width: "14.28%",
    textAlign: "center",
    color: SUBTLE,
    fontWeight: "500",
    fontSize: 12,
  },
  webCalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  webCalCell: {
    width: "14.28%",
    aspectRatio: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  webCalCellActive: {
    borderWidth: 1,
    borderColor: "#b49bdc",
    backgroundColor: "#eee8f8",
  },
  webCalCellText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "500",
  },
  webCalCellTextActive: {
    color: PRIMARY,
    fontWeight: "700",
  },
  webCalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
  },
});