import {
    createActivity,
    deleteActivity,
    listActivities,
    updateActivity,
    type Activity,
    type ActivityStatus,
} from "@/src/api/activities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

/** Filtro genérico por entidad relacionada */
export type ActivityFilters = {
  deal_id?: string;
  account_id?: string;
  contact_id?: string;
  lead_id?: string;
  status?: ActivityStatus;
};

export default function RelatedActivities(props: {
  title?: string;
  filters: ActivityFilters;        // 👈 en qué entidad filtrar
  createDefaults?: Partial<Activity>; // valores extra al crear (type=task, etc)
}) {
  const { title = "Actividades", filters, createDefaults } = props;
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState("");

  const q = useQuery<Activity[]>({
    queryKey: ["activities", filters],
    queryFn: () => listActivities(filters),
    enabled: Object.keys(filters).length > 0,
  });

  const mCreate = useMutation({
    mutationFn: async () => {
      const t = newTitle.trim();
      if (!t) return;
      await createActivity({
        id: uid(),
        type: "task",
        title: t,
        status: "open",
        ...filters,
        ...(createDefaults ?? {}),
      } as Partial<Activity>);
    },
    onSuccess: async () => {
      setNewTitle("");
      await qc.invalidateQueries({ queryKey: ["activities", filters] });
    },
  });

  const mToggle = useMutation({
    mutationFn: async (a: Activity) => {
      await updateActivity(a.id, { status: a.status === "open" ? "done" : "open" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["activities", filters] });
    },
  });

  const mDel = useMutation({
    mutationFn: async (id: string) => deleteActivity(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["activities", filters] });
    },
  });

  return (
    <View style={S.box}>
      <Text style={S.title}>{title}</Text>

      <View style={[S.row, { gap: 8 }]}>
        <TextInput
          style={[S.input]}
          placeholder="Nueva tarea…"
          placeholderTextColor="#475569"
          value={newTitle}
          onChangeText={setNewTitle}
        />
        <Pressable
          style={[S.btn, S.btnPrimary, mCreate.isPending && { opacity: 0.7 }]}
          onPress={() => mCreate.mutate()}
          disabled={mCreate.isPending}
        >
          <Text style={S.btnText}>Crear</Text>
        </Pressable>
      </View>

      {q.isError ? (
        <Text style={{ color: "#ef4444", padding: 12 }}>Error cargando actividades.</Text>
      ) : (
        <View>
          {(q.data ?? []).map((a) => (
            <View key={a.id} style={S.row}>
              <View style={{ flex: 1 }}>
                <Text style={[S.itemTitle, a.status !== "open" && { textDecorationLine: "line-through", opacity: 0.7 }]}>
                  {a.title}
                </Text>
                <Text style={S.itemSub}>{a.type} · {a.status}</Text>
              </View>

              <Pressable style={[S.btn, S.btnMuted]} onPress={() => mToggle.mutate(a)}>
                <Text style={S.btnText}>{a.status === "open" ? "Hecha" : "Abrir"}</Text>
              </Pressable>
              <Pressable style={[S.btn, S.btnDanger]} onPress={() => mDel.mutate(a.id)}>
                <Text style={S.btnText}>Borrar</Text>
              </Pressable>
            </View>
          ))}

          {(q.data ?? []).length === 0 && (
            <Text style={{ color: "#475569", padding: 12 }}>Sin actividades.</Text>
          )}
        </View>
      )}
    </View>
  );
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const S = StyleSheet.create({
  box: { borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#ECEFF4", borderRadius: 12, overflow: "hidden" },
  title: { color: "#0F172A", fontWeight: "900", fontSize: 16, padding: 12 },
  row: { padding: 12, borderTopWidth: 1, borderTopColor: "#CBD5E1", flexDirection: "row", alignItems: "center", gap: 8 },
  itemTitle: { color: "#0F172A", fontWeight: "800" },
  itemSub: { color: "#475569", fontSize: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#fff", color: "#0F172A", borderRadius: 10, padding: 10 },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "800" },
  btnPrimary: { backgroundColor: "#7C3AED" }, // morado
  btnMuted: { backgroundColor: "#334155" },
  btnDanger: { backgroundColor: "#EF4444" },
});
