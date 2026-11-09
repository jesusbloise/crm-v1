// src/components/CalendarMonthView.tsx
import { useEffect, useMemo, useState } from "react";
import {
    Linking,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

export type CalendarViewEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

type Props = {
  events: CalendarViewEvent[];
  year: number;
  month: number;
  selectedDate?: string;
  loading?: boolean;
  onMonthChange: (year: number, month: number) => void;
  onSelectDate: (date: string) => void;
  onCreateActivity: () => void;
};

function dayKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDay(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function eventStart(event: CalendarViewEvent) {
  if (event.start?.dateTime) {
    const date = new Date(event.start.dateTime);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return parseDay(event.start?.date);
}

function eventEnd(event: CalendarViewEvent) {
  if (event.end?.dateTime) {
    const date = new Date(event.end.dateTime);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return parseDay(event.end?.date);
}

function occursOn(event: CalendarViewEvent, date: Date) {
  const start = eventStart(event);
  if (!start) return false;

  const end = eventEnd(event);
  const nextDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1
  );

  // Google utiliza una fecha final exclusiva para eventos de todo el día.
  if (end && end.getTime() > start.getTime()) {
    return start < nextDay && end > date;
  }

  return dayKey(start) === dayKey(date);
}

function timeLabel(event: CalendarViewEvent) {
  if (event.start?.date) return "Todo el día";

  const start = eventStart(event);
  const end = eventEnd(event);

  if (!start) return "Hora no disponible";

  const format = (date: Date) =>
    date.toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    });

  if (!end) return format(start);

  if (dayKey(start) !== dayKey(end)) {
    return `${start.toLocaleDateString("es-CL", {
      day: "numeric",
      month: "short",
    })}, ${format(start)} → ${end.toLocaleDateString("es-CL", {
      day: "numeric",
      month: "short",
    })}, ${format(end)}`;
  }

  return `${format(start)} – ${format(end)}`;
}

function safeGoogleLink(value?: string) {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (
      url.protocol === "https:" &&
      (url.hostname === "google.com" ||
        url.hostname.endsWith(".google.com"))
    ) {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export default function CalendarMonthView({
  events,
  year,
  month,
  selectedDate,
  loading = false,
  onMonthChange,
  onSelectDate,
  onCreateActivity,
}: Props) {
  const [width, setWidth] = useState(0);
  const [linkError, setLinkError] = useState<string | null>(null);

  const wide = width >= 1050;
  const compact = width > 0 && width < 600;

  const today = new Date();
  const todayKey = dayKey(today);
  const selected = parseDay(selectedDate);

  const activeDate =
    selected &&
    selected.getFullYear() === year &&
    selected.getMonth() === month
      ? selected
      : today.getFullYear() === year && today.getMonth() === month
      ? new Date(year, month, today.getDate())
      : new Date(year, month, 1);

  const activeKey = dayKey(activeDate);

  useEffect(() => {
    setLinkError(null);
  }, [activeKey]);

  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          (eventStart(a)?.getTime() ?? 0) -
            (eventStart(b)?.getTime() ?? 0) ||
          a.id.localeCompare(b.id)
      ),
    [events]
  );

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((offset + totalDays) / 7) * 7;

    return Array.from({ length: cellCount }, (_, index) => {
      const day = index - offset + 1;

      if (day < 1 || day > totalDays) return null;

      const date = new Date(year, month, day);

      return {
        date,
        key: dayKey(date),
        day,
        events: sortedEvents.filter((event) => occursOn(event, date)),
      };
    });
  }, [year, month, sortedEvents]);

  const agenda = sortedEvents.filter((event) =>
    occursOn(event, activeDate)
  );

  function moveMonth(amount: number) {
    const date = new Date(year, month + amount, 1);
    onMonthChange(date.getFullYear(), date.getMonth());
    onSelectDate(dayKey(date));
  }

  function goToday() {
    const date = new Date();
    onMonthChange(date.getFullYear(), date.getMonth());
    onSelectDate(dayKey(date));
  }

  async function openEvent(url: string) {
    setLinkError(null);

    try {
      await Linking.openURL(url);
    } catch {
      setLinkError("No se pudo abrir el evento en Google Calendar.");
    }
  }

  return (
    <View
      style={s.root}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View style={s.toolbar}>
        <View style={s.titleBlock}>
          <Text style={s.eyebrow}>PLANIFICACIÓN</Text>
          <Text style={s.monthTitle}>
            {new Date(year, month, 1).toLocaleDateString("es-CL", {
              month: "long",
              year: "numeric",
            })}
          </Text>
        </View>

        <View style={s.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mes anterior"
            onPress={() => moveMonth(-1)}
            style={s.arrow}
          >
            <Text style={s.arrowText}>‹</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={goToday}
            style={s.button}
          >
            <Text style={s.buttonText}>Hoy</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mes siguiente"
            onPress={() => moveMonth(1)}
            style={s.arrow}
          >
            <Text style={s.arrowText}>›</Text>
          </Pressable>
        </View>
      </View>

      <View style={[s.columns, wide && s.columnsWide]}>
        <View style={s.calendar}>
          <View style={s.week}>
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(
              (label) => (
                <Text key={label} style={s.weekDay}>
                  {compact ? label.charAt(0) : label}
                </Text>
              )
            )}
          </View>

          <View style={s.grid}>
            {cells.map((cell, index) => {
              if (!cell) {
                return (
                  <View
                    key={`empty:${index}`}
                    style={[
                      s.cell,
                      s.emptyCell,
                      compact && s.cellCompact,
                    ]}
                  />
                );
              }

              const isSelected = cell.key === activeKey;
              const isToday = cell.key === todayKey;

              return (
                <Pressable
                  key={cell.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${cell.date.toLocaleDateString(
                    "es-CL",
                    {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }
                  )}. ${
                    loading
                      ? "Cargando eventos"
                      : `${cell.events.length} eventos`
                  }`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => onSelectDate(cell.key)}
                  style={[
                    s.cell,
                    compact && s.cellCompact,
                    isSelected && s.cellSelected,
                  ]}
                >
                  <View style={s.dayHeader}>
                    <View
                      style={[
                        s.numberBadge,
                        isToday && s.todayBadge,
                      ]}
                    >
                      <Text
                        style={[
                          s.dayNumber,
                          isSelected && s.selectedNumber,
                          isToday && s.todayNumber,
                        ]}
                      >
                        {cell.day}
                      </Text>
                    </View>
                  </View>

                  {!loading &&
                    (compact ? (
                      <View style={s.dots}>
                        {cell.events.slice(0, 3).map((event) => (
                          <View key={event.id} style={s.eventDot} />
                        ))}
                        {cell.events.length > 3 && (
                          <Text style={s.moreCompact}>
                            +{cell.events.length - 3}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <View style={s.previews}>
                        {cell.events.slice(0, 2).map((event) => (
                          <View key={event.id} style={s.preview}>
                            <Text
                              numberOfLines={1}
                              style={s.previewText}
                            >
                              {event.summary || "Sin título"}
                            </Text>
                          </View>
                        ))}
                        {cell.events.length > 2 && (
                          <Text style={s.more}>
                            +{cell.events.length - 2} más
                          </Text>
                        )}
                      </View>
                    ))}
                </Pressable>
              );
            })}
          </View>

          <View style={s.legend}>
            <View style={s.eventDot} />
            <Text style={s.small}>Eventos de Google Calendar</Text>
            {loading && (
              <Text style={s.small}>Actualizando mes…</Text>
            )}
          </View>
        </View>

        <View style={[s.agenda, wide && s.agendaWide]}>
          <View style={s.agendaHeader}>
            <Text style={s.eyebrow}>AGENDA DEL DÍA</Text>
            <Text style={s.agendaTitle}>
              {activeDate.toLocaleDateString("es-CL", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </Text>
            <Text style={s.small}>
              {loading
                ? "Cargando eventos…"
                : `${agenda.length} ${
                    agenda.length === 1 ? "evento" : "eventos"
                  }`}
            </Text>
          </View>

          {loading ? (
            <View style={s.emptyAgenda}>
              <Text style={s.muted}>Consultando este mes…</Text>
            </View>
          ) : agenda.length === 0 ? (
            <View style={s.emptyAgenda}>
              <Text style={s.emptyTitle}>Día sin eventos</Text>
              <Text style={s.muted}>
                No hay eventos de Google Calendar para esta fecha.
              </Text>
            </View>
          ) : (
            agenda.map((event) => {
              const url = safeGoogleLink(event.htmlLink);

              return (
                <View key={event.id} style={s.agendaEvent}>
                  <Text style={s.eventTime}>{timeLabel(event)}</Text>
                  <Text style={s.eventTitle}>
                    {event.summary || "Sin título"}
                  </Text>

                  {!!event.location && (
                    <Text selectable style={s.muted}>
                      {event.location}
                    </Text>
                  )}

                  {!!url && (
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => void openEvent(url)}
                      style={s.eventLink}
                    >
                      <Text style={s.buttonText}>
                        Abrir en Google →
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}

          {!!linkError && (
            <Text accessibilityRole="alert" style={s.error}>
              {linkError}
            </Text>
          )}

          <View style={s.agendaFooter}>
            <Pressable
              accessibilityRole="button"
              onPress={onCreateActivity}
              style={[s.button, s.primary]}
            >
              <Text style={s.primaryText}>+ Nueva actividad</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { width: "100%", minWidth: 0, gap: 16 },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  titleBlock: { gap: 5 },
  eyebrow: {
    color: "#8a819e",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  monthTitle: {
    color: "#202536",
    fontSize: 23,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  controls: { flexDirection: "row", alignItems: "center", gap: 8 },
  button: {
    minHeight: 42,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ded5ef",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#7551c8",
    fontSize: 12,
    fontWeight: "600",
  },
  primary: {
    backgroundColor: "#7551c8",
    borderColor: "#7551c8",
  },
  primaryText: { color: "#ffffff", fontSize: 12, fontWeight: "600" },
  arrow: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e7e9f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: { color: "#7551c8", fontSize: 26, lineHeight: 30 },
  columns: { gap: 16 },
  columnsWide: { flexDirection: "row", alignItems: "flex-start" },
  calendar: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e9f0",
    borderRadius: 14,
    overflow: "hidden",
  },
  week: {
    flexDirection: "row",
    paddingVertical: 14,
    backgroundColor: "#fafbfe",
  },
  weekDay: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: "#737b8e",
    fontSize: 11,
    fontWeight: "600",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    minWidth: 0,
    minHeight: 110,
    padding: 6,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderColor: "#eef0f5",
    gap: 5,
    backgroundColor: "#ffffff",
  },
  cellCompact: { minHeight: 72, padding: 3 },
  emptyCell: { backgroundColor: "#fafbfe" },
  cellSelected: { backgroundColor: "#f0eafa" },
  dayHeader: { flexDirection: "row", alignItems: "center" },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  todayBadge: { backgroundColor: "#7551c8" },
  dayNumber: { color: "#475467", fontSize: 12, fontWeight: "600" },
  selectedNumber: { color: "#6541b4", fontWeight: "700" },
  todayNumber: { color: "#ffffff" },
  previews: { gap: 4, minWidth: 0 },
  preview: {
    backgroundColor: "#eee8f9",
    borderLeftWidth: 2,
    borderLeftColor: "#8b6bd1",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  previewText: { color: "#62439c", fontSize: 10, lineHeight: 14 },
  more: { color: "#7551c8", fontSize: 10, paddingHorizontal: 3 },
  dots: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 3,
    paddingTop: 4,
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#8b6bd1",
  },
  moreCompact: { color: "#7551c8", fontSize: 9 },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#eef0f5",
  },
  small: { color: "#8991a2", fontSize: 11, lineHeight: 18 },
  muted: { color: "#737b8e", fontSize: 12, lineHeight: 20 },
  agenda: {
    minWidth: 0,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e9f0",
    borderRadius: 14,
    overflow: "hidden",
  },
  agendaWide: { width: 310, flexShrink: 0 },
  agendaHeader: {
    padding: 20,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eef0f5",
  },
  agendaTitle: {
    color: "#202536",
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  emptyAgenda: { padding: 20, gap: 8 },
  emptyTitle: { color: "#475467", fontSize: 14, fontWeight: "600" },
  agendaEvent: {
    padding: 20,
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#eef0f5",
  },
  eventTime: { color: "#7551c8", fontSize: 12, fontWeight: "600" },
  eventTitle: {
    color: "#202536",
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
  },
  eventLink: {
    alignSelf: "flex-start",
    minHeight: 40,
    justifyContent: "center",
  },
  agendaFooter: { padding: 18 },
  error: {
    color: "#b42332",
    fontSize: 12,
    lineHeight: 19,
    padding: 18,
  },
});