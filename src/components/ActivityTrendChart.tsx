import type { ActivityStatsFilters } from "@/src/api/activities";
import { api } from "@/src/api/http";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

type Trend = {
  scope: "team" | "mine";
  from: number;
  before: number;
  timezone: string;
  days: {
    date: string;
    scheduled: number;
    completed: number;
  }[];
  undated_completions: number;
};

type Props = {
  tenantId: string | null;
  enabled: boolean;
  filters: ActivityStatsFilters;
};

export default function ActivityTrendChart({
  tenantId,
  enabled,
  filters,
}: Props) {
  const [selection, setSelection] = useState<{
    key: string;
    date: string;
  } | null>(null);

  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "America/Santiago";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const defaultEnd = new Date(today);
  defaultEnd.setDate(defaultEnd.getDate() + 1);

  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() - 13);

  const from = filters.due_from ?? defaultStart.getTime();
  const before = filters.due_before ?? defaultEnd.getTime();

  const validRange =
    from < before &&
    before - from <= 367 * 86400000;

  const selectionKey = JSON.stringify([
    tenantId,
    filters.scope,
    filters.person_id,
    filters.q,
    from,
    before,
    timezone,
  ]);

  const query = useQuery({
    queryKey: [
      "activity-trend",
      tenantId,
      filters.scope,
      filters.person_id,
      filters.q,
      from,
      before,
      timezone,
    ],
    enabled: enabled && Boolean(tenantId) && validRange,
    queryFn: () => {
      const params = new URLSearchParams({
        from: String(from),
        before: String(before),
        timezone,
      });

      if (filters.scope) {
        params.set("scope", filters.scope);
      }

      if (filters.person_id) {
        params.set("person_id", filters.person_id);
      }

      if (filters.q) {
        params.set("q", filters.q);
      }

      return api.get<Trend>(
        `/activities/trend?${params.toString()}`
      );
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const refetch = query.refetch;

  useFocusEffect(
    useCallback(() => {
      if (enabled && tenantId && validRange) {
        void refetch();
      }
    }, [enabled, tenantId, validRange, refetch])
  );

  if (!enabled || !tenantId) return null;

  const formatDay = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);

    return new Date(
      year,
      month - 1,
      day
    ).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
    });
  };

  const days = query.data?.days ?? [];

  const maximum = Math.max(
    1,
    ...days.map((day) =>
      Math.max(day.scheduled, day.completed)
    )
  );

  const scheduled = days.reduce(
    (sum, day) => sum + day.scheduled,
    0
  );

  const completed = days.reduce(
    (sum, day) => sum + day.completed,
    0
  );

  const active =
    selection?.key === selectionKey
      ? days.find((day) => day.date === selection.date)
      : undefined;

  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>EVOLUCIÓN DIARIA</Text>

      <Text style={s.title}>
        Programadas y realizadas
      </Text>

      <Text style={s.subtitle}>
        {filters.due_from === undefined &&
        filters.due_before === undefined
          ? "Últimos 14 días"
          : "Periodo seleccionado"}
      </Text>

      {!validRange ? (
        <Text style={s.subtitle}>
          Selecciona un periodo de hasta un año.
        </Text>
      ) : query.isPending ? (
        <ActivityIndicator color="#7551c8" />
      ) : query.isError ? (
        <View style={{ gap: 10 }}>
          <Text style={s.error}>
            No pudimos cargar la evolución.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => void query.refetch()}
          >
            <Text style={s.link}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={s.totals}>
            <View>
              <Text
                style={[
                  s.number,
                  { color: "#8261cc" },
                ]}
              >
                {scheduled}
              </Text>
              <Text style={s.subtitle}>Programadas</Text>
            </View>

            <View>
              <Text
                style={[
                  s.number,
                  { color: "#269b78" },
                ]}
              >
                {completed}
              </Text>
              <Text style={s.subtitle}>Realizadas</Text>
            </View>
          </View>

          <View style={s.plot}>
            <View style={s.axis}>
              <Text style={s.tick}>{maximum}</Text>

              <Text style={s.tick}>
                {maximum > 1
                  ? Math.round(maximum / 2)
                  : ""}
              </Text>

              <Text style={s.tick}>0</Text>
            </View>

            <ScrollView
              horizontal
              style={{ flex: 1, minWidth: 0 }}
              showsHorizontalScrollIndicator
              contentContainerStyle={{
                paddingRight: 8,
                gap: 4,
              }}
            >
              {days.map((day) => (
                <Pressable
                  key={day.date}
                  accessibilityRole="button"
                  accessibilityLabel={
                    `${formatDay(day.date)}: ` +
                    `${day.scheduled} programadas, ` +
                    `${day.completed} realizadas`
                  }
                  onPress={() => {
                    setSelection({
                      key: selectionKey,
                      date: day.date,
                    });
                  }}
                  style={[
                    s.day,
                    active?.date === day.date && {
                      backgroundColor: "#f1ecfa",
                    },
                  ]}
                >
                  <View style={s.bars}>
                    <View
                      style={[
                        s.bar,
                        {
                          height:
                            (day.scheduled / maximum) * 120,
                          backgroundColor: "#9576db",
                        },
                      ]}
                    />

                    <View
                      style={[
                        s.bar,
                        {
                          height:
                            (day.completed / maximum) * 120,
                          backgroundColor: "#36ad88",
                        },
                      ]}
                    />
                  </View>

                  <Text style={s.dayLabel}>
                    {formatDay(day.date)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {active ? (
            <View style={s.detail}>
              <Text style={s.detailTitle}>
                {formatDay(active.date)}
              </Text>

              <Text style={s.subtitle}>
                {active.scheduled} programadas ·{" "}
                {active.completed} realizadas
              </Text>
            </View>
          ) : (
            <Text style={s.subtitle}>
              Pulsa un día para ver sus cantidades.
              Desliza para recorrer el periodo.
            </Text>
          )}

          {scheduled === 0 && completed === 0 && (
            <Text style={s.subtitle}>
              Sin actividad registrada en estas fechas.
            </Text>
          )}

          <Text style={s.note}>
            Programadas: fecha prevista, excluyendo canceladas.
            Realizadas: fecha de finalización de las actividades
            que siguen completadas. Conserva el alcance,
            responsable y búsqueda; no aplica el filtro de
            estado ni los accesos de pendientes.
          </Text>

          {(query.data?.undated_completions ?? 0) > 0 && (
            <Text style={s.note}>
              Hay {query.data?.undated_completions} realizadas
              sin fecha de finalización conocida en este
              alcance. No se incluyen en la serie.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e7e9f0",
    borderRadius: 14,
    padding: 20,
    gap: 10,
    minWidth: 0,
  },

  eyebrow: {
    color: "#8a819e",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "700",
  },

  title: {
    color: "#202536",
    fontSize: 16,
    fontWeight: "700",
  },

  subtitle: {
    color: "#737b8e",
    fontSize: 11,
    lineHeight: 18,
  },

  totals: {
    flexDirection: "row",
    gap: 32,
    paddingVertical: 10,
  },

  number: {
    fontSize: 26,
    fontWeight: "700",
  },

  plot: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e7e9f0",
    paddingBottom: 6,
    minWidth: 0,
  },

  axis: {
    width: 28,
    height: 120,
    justifyContent: "space-between",
    marginTop: 6,
  },

  tick: {
    color: "#98a0af",
    fontSize: 9,
  },

  day: {
    width: 44,
    paddingTop: 6,
    borderRadius: 6,
    gap: 8,
  },

  bars: {
    height: 120,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e7e9f0",
  },

  bar: {
    width: 12,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },

  dayLabel: {
    color: "#8991a2",
    fontSize: 9,
    textAlign: "center",
  },

  detail: {
    backgroundColor: "#f8f9fc",
    borderRadius: 8,
    padding: 10,
    gap: 3,
  },

  detailTitle: {
    color: "#364152",
    fontSize: 12,
    fontWeight: "600",
  },

  note: {
    color: "#8991a2",
    fontSize: 10,
    lineHeight: 16,
  },

  error: {
    color: "#b54738",
    fontSize: 12,
  },

  link: {
    color: "#7551c8",
    fontSize: 12,
    fontWeight: "600",
  },
});