import {
    getActivityStats,
    type ActivityStatsFilters,
} from "@/src/api/activities";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import ActivityTrendChart from "./ActivityTrendChart";

const STATES = [
  { key: "open", label: "Abiertas", color: "#8b6bd1" },
  { key: "in_progress", label: "En proceso", color: "#4c8de8" },
  { key: "done", label: "Realizadas", color: "#31a681" },
  { key: "canceled", label: "Canceladas", color: "#a9b1c1" },
] as const;

type Props = {
  tenantId: string | null;
  enabled: boolean;
  filters: ActivityStatsFilters;
  onSelectStatus: (
    status: "open" | "in_progress" | "done" | "canceled"
  ) => void;
  onSelectPerson: (id: string) => void;
};

export default function ActivityStatsPanel({
  tenantId,
  enabled,
  filters,
  onSelectStatus,
  onSelectPerson,
}: Props) {
  const stats = useQuery({
    queryKey: ["activity-stats", tenantId, filters],
    queryFn: () => getActivityStats(filters),
    enabled: enabled && Boolean(tenantId),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const refetch = stats.refetch;

  useFocusEffect(
    useCallback(() => {
      if (enabled && tenantId) {
        void refetch();
      }
    }, [enabled, tenantId, refetch])
  );

  if (!enabled || !tenantId) return null;

  if (stats.isPending) {
    return (
      <View style={s.card}>
        <ActivityIndicator color="#7551c8" />
        <Text style={s.muted}>Cargando estadísticas…</Text>
      </View>
    );
  }

  if (stats.isError) {
    return (
      <View style={s.card}>
        <Text style={s.title}>Estadísticas</Text>
        <Text style={s.error}>No pudimos cargar el resumen.</Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => void stats.refetch()}
          style={s.retry}
        >
          <Text style={s.link}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  const { summary, users, scope, unassigned } = stats.data;
  const maximum = Math.max(1, ...users.map((user) => user.total));
  const team = scope === "team";

  return (
    <View style={s.panel}>
      <View style={s.card}>
        <View style={s.heading}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>
              {team ? "VISIÓN DEL EQUIPO" : "MIS ACTIVIDADES"}
            </Text>

            <Text style={s.title}>Control de actividades</Text>
          </View>

          {stats.isFetching && (
            <ActivityIndicator size="small" color="#7551c8" />
          )}
        </View>

        <Text style={s.total}>{summary.total}</Text>

        <Text style={s.muted}>
          {team
            ? "Actividades en el alcance seleccionado"
            : "Actividades asignadas a mí"}
        </Text>

        <View style={s.alerts}>
          <View style={s.metric}>
            <Text style={[s.metricNumber, { color: "#c16a37" }]}>
              {summary.overdue}
            </Text>
            <Text style={s.small}>Atrasadas</Text>
          </View>

          <View style={s.metric}>
            <Text style={s.metricNumber}>{summary.undated}</Text>
            <Text style={s.small}>Sin fecha</Text>
          </View>

          {team && (
            <View style={s.metric}>
              <Text style={s.metricNumber}>{unassigned}</Text>
              <Text style={s.small}>Sin asignar</Text>
            </View>
          )}
        </View>

        <Text style={s.sectionTitle}>Distribución por estado</Text>

        <Text style={s.footnote}>
          Comparación de estados antes de aplicar el selector de estado
          del listado.
        </Text>

        {STATES.map(({ key, label, color }) => {
          const count = summary[key];

          const percentage = summary.total
            ? Math.round((count / summary.total) * 100)
            : 0;

          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${count}. Filtrar actividades`}
              onPress={() => onSelectStatus(key)}
              style={s.stateRow}
            >
              <View style={s.labelRow}>
                <View style={s.legendLabel}>
                  <View
                    style={[s.dot, { backgroundColor: color }]}
                  />
                  <Text style={s.label}>{label}</Text>
                </View>

                <Text style={s.value}>
                  {count}
                  <Text style={s.percentage}> · {percentage}%</Text>
                </Text>
              </View>

              <View style={s.track}>
                <View
                  style={[
                    s.fill,
                    {
                      width: `${percentage}%`,
                      backgroundColor: color,
                    },
                  ]}
                />
              </View>
            </Pressable>
          );
        })}

        {summary.total === 0 && (
          <Text style={s.muted}>
            No hay actividades para estos filtros.
          </Text>
        )}
      </View>

      <ActivityTrendChart
        tenantId={tenantId}
        enabled={enabled}
        filters={filters}
      />

      {team && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>Carga por responsable</Text>

          <Text style={s.muted}>
            Selecciona una persona para consultar sus asignaciones.
          </Text>

          {users.map((user) => (
            <Pressable
              key={user.user_id}
              accessibilityRole="button"
              accessibilityLabel={`${user.name}: ${user.total} actividades`}
              onPress={() => onSelectPerson(user.user_id)}
              style={s.person}
            >
              <View style={s.labelRow}>
                <Text
                  style={[s.label, { flex: 1 }]}
                  numberOfLines={1}
                >
                  {user.name}
                </Text>

                <Text style={s.value}>{user.total}</Text>
              </View>

              <View style={s.stackedTrack}>
                {STATES.map(({ key, color }) => (
                  <View
                    key={key}
                    style={{
                      width: `${(user[key] / maximum) * 100}%`,
                      height: 10,
                      backgroundColor: color,
                    }}
                  />
                ))}
              </View>
            </Pressable>
          ))}

          {users.length === 0 && (
            <Text style={s.muted}>Sin actividades asignadas.</Text>
          )}

          <View style={s.legend}>
            {STATES.map(({ key, label, color }) => (
              <View key={key} style={s.legendLabel}>
                <View
                  style={[s.dot, { backgroundColor: color }]}
                />
                <Text style={s.small}>{label}</Text>
              </View>
            ))}
          </View>

          <Text style={s.footnote}>
            Las actividades compartidas cuentan para cada responsable
            y una sola vez en el total del equipo.
          </Text>
        </View>
      )}

      <Text style={s.footnote}>
        Resumen según fecha programada, búsqueda y filtros de pendientes.
        La carga individual incluye cualquiera de las dos asignaciones.
        La evolución compara fechas programadas y fechas reales de
        finalización.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    gap: 14,
    minWidth: 0,
  },

  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e7e9f0",
    borderRadius: 14,
    padding: 20,
    gap: 10,
    minWidth: 0,
  },

  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  eyebrow: {
    color: "#8a819e",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 6,
  },

  title: {
    color: "#202536",
    fontSize: 16,
    fontWeight: "700",
  },

  total: {
    color: "#302344",
    fontSize: 38,
    fontWeight: "700",
    marginTop: 8,
  },

  muted: {
    color: "#737b8e",
    fontSize: 12,
    lineHeight: 19,
  },

  alerts: {
    flexDirection: "row",
    backgroundColor: "#f8f9fc",
    borderRadius: 10,
    paddingVertical: 14,
    marginVertical: 6,
  },

  metric: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },

  metricNumber: {
    color: "#364152",
    fontSize: 21,
    fontWeight: "700",
  },

  small: {
    color: "#737b8e",
    fontSize: 10,
  },

  sectionTitle: {
    color: "#303749",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
  },

  stateRow: {
    paddingVertical: 7,
    gap: 8,
  },

  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  legendLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  label: {
    color: "#475467",
    fontSize: 12,
  },

  value: {
    color: "#303749",
    fontSize: 12,
    fontWeight: "700",
  },

  percentage: {
    color: "#9299a7",
    fontWeight: "400",
  },

  track: {
    height: 7,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: "#f0f2f7",
  },

  fill: {
    height: 7,
    borderRadius: 5,
  },

  person: {
    gap: 9,
    paddingVertical: 9,
  },

  stackedTrack: {
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: "#f0f2f7",
  },

  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },

  footnote: {
    color: "#8991a2",
    fontSize: 10,
    lineHeight: 16,
  },

  error: {
    color: "#b54738",
    fontSize: 12,
  },

  retry: {
    alignSelf: "flex-start",
    paddingVertical: 8,
  },

  link: {
    color: "#7551c8",
    fontSize: 12,
    fontWeight: "600",
  },
});