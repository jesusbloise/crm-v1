// src/components/RelatedNotes.tsx
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
  type Note,
} from "@/src/api/notes";
import { uid } from "@/src/utils/uid";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export type NoteFilters = {
  deal_id?: string;
  account_id?: string;
  contact_id?: string;
  lead_id?: string;
};

type Props = {
  title?: string;
  filters: NoteFilters;
};

function formatDate(value: number | string | null | undefined) {
  if (value == null || value === "") return "Fecha no disponible";

  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return "Fecha no disponible";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return date.toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se pudo guardar el cambio. Inténtalo nuevamente.";
}

async function confirmDelete(): Promise<boolean> {
  const message = "Esta nota se eliminará. ¿Quieres continuar?";

  if (Platform.OS === "web") {
    return window.confirm(message);
  }

  return new Promise((resolve) => {
    Alert.alert(
      "Eliminar nota",
      message,
      [
        {
          text: "Cancelar",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => resolve(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(false),
      }
    );
  });
}

export default function RelatedNotes({
  title = "Notas",
  filters,
}: Props) {
  const qc = useQueryClient();

  const [newBody, setNewBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const enabled = Boolean(
    filters.contact_id ||
      filters.deal_id ||
      filters.account_id ||
      filters.lead_id
  );

  const q = useQuery<Note[]>({
    queryKey: ["notes", filters],
    queryFn: () => listNotes(filters),
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    select: (rows) =>
      [...rows].sort(
        (a, b) =>
          Number(b.created_at) - Number(a.created_at) ||
          a.id.localeCompare(b.id)
      ),
  });

  async function refreshNotes() {
    await qc.invalidateQueries({ queryKey: ["notes"] });
  }

  const mCreate = useMutation({
    mutationFn: async () => {
      const body = newBody.trim();

      if (!enabled) {
        throw new Error("No se pudo identificar el contacto o la entidad.");
      }

      if (!body) {
        throw new Error("Escribe el contenido de la nota.");
      }

      await createNote({
        id: uid(),
        body,
        ...filters,
      });
    },
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      setNewBody("");
      await refreshNotes();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const mUpdate = useMutation({
    mutationFn: async () => {
      const body = editingBody.trim();

      if (!editingId) {
        throw new Error("Selecciona una nota para editar.");
      }

      if (!body) {
        throw new Error("La nota no puede quedar vacía.");
      }

      await updateNote(editingId, { body });
    },
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      setEditingId(null);
      setEditingBody("");
      await refreshNotes();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const mDelete = useMutation({
    mutationFn: (id: string) => deleteNote(id),
    onMutate: () => setActionError(null),
    onSuccess: async (_result, id) => {
      if (editingId === id) {
        setEditingId(null);
        setEditingBody("");
      }

      qc.removeQueries({ queryKey: ["note", id] });
      await refreshNotes();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const busy =
    mCreate.isPending || mUpdate.isPending || mDelete.isPending;

  const notes = q.data ?? [];

  async function handleDelete(id: string) {
    if (busy) return;

    if (await confirmDelete()) {
      mDelete.mutate(id);
    }
  }

  return (
    <View style={s.box}>
      <View style={s.header}>
        <View style={s.heading}>
          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>
            Guarda acuerdos y detalles importantes del seguimiento.
          </Text>
        </View>

        {q.isFetching && !q.isLoading && (
          <ActivityIndicator size="small" color="#7551c8" />
        )}
      </View>

      <View style={s.composer}>
        <TextInput
          accessibilityLabel="Contenido de la nueva nota"
          style={s.input}
          placeholder="Escribe una nota…"
          placeholderTextColor="#8991a2"
          value={newBody}
          onChangeText={setNewBody}
          editable={!busy}
          multiline
          textAlignVertical="top"
        />

        <View style={s.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy || !enabled || !newBody.trim()}
            onPress={() => mCreate.mutate()}
            style={[
              s.button,
              s.primary,
              (busy || !enabled || !newBody.trim()) && s.disabled,
            ]}
          >
            <Text style={s.primaryText}>
              {mCreate.isPending ? "Guardando…" : "+ Añadir nota"}
            </Text>
          </Pressable>
        </View>
      </View>

      {!!actionError && (
        <Text accessibilityRole="alert" style={s.error}>
          {actionError}
        </Text>
      )}

      {!enabled ? (
        <Text style={s.empty}>Selecciona un contacto para ver sus notas.</Text>
      ) : q.isLoading ? (
        <View style={s.loading}>
          <ActivityIndicator color="#7551c8" />
          <Text style={s.subtitle}>Cargando notas…</Text>
        </View>
      ) : q.isError ? (
        <View style={s.feedback}>
          <Text style={s.errorText}>No pudimos cargar las notas.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void q.refetch()}
            style={[s.button, s.secondary]}
          >
            <Text style={s.secondaryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : notes.length === 0 ? (
        <Text style={s.empty}>
          Todavía no hay notas. Añade la primera para iniciar el seguimiento.
        </Text>
      ) : (
        <ScrollView
          style={s.list}
          nestedScrollEnabled
          contentContainerStyle={s.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {notes.map((note) => {
            const isEditing = editingId === note.id;
            const author =
              note.created_by_name?.trim() ||
              note.created_by_email?.trim() ||
              "Autor no disponible";

            return (
              <View key={note.id} style={s.noteRow}>
                <View style={s.noteHeading}>
                  <View style={s.marker}>
                    <Text style={s.markerText}>N</Text>
                  </View>

                  <View style={s.heading}>
                    <Text style={s.author}>{author}</Text>
                    <Text style={s.meta}>
                      {formatDate(note.created_at)}
                      {Number(note.updated_at) > Number(note.created_at)
                        ? " · Editada"
                        : ""}
                    </Text>
                  </View>
                </View>

                {isEditing ? (
                  <TextInput
                    accessibilityLabel="Editar contenido de la nota"
                    style={s.input}
                    value={editingBody}
                    onChangeText={setEditingBody}
                    editable={!busy}
                    multiline
                    textAlignVertical="top"
                  />
                ) : (
                  <Text style={s.body}>{note.body}</Text>
                )}

                <View style={s.actions}>
                  {isEditing ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy || !editingBody.trim()}
                        onPress={() => mUpdate.mutate()}
                        style={[
                          s.button,
                          s.primary,
                          (busy || !editingBody.trim()) && s.disabled,
                        ]}
                      >
                        <Text style={s.primaryText}>
                          {mUpdate.isPending ? "Guardando…" : "Guardar"}
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => {
                          setEditingId(null);
                          setEditingBody("");
                          setActionError(null);
                        }}
                        style={[
                          s.button,
                          s.secondary,
                          busy && s.disabled,
                        ]}
                      >
                        <Text style={s.secondaryText}>Cancelar</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Editar nota de ${author}`}
                        disabled={busy}
                        onPress={() => {
                          setEditingId(note.id);
                          setEditingBody(note.body);
                          setActionError(null);
                        }}
                        style={[
                          s.button,
                          s.secondary,
                          busy && s.disabled,
                        ]}
                      >
                        <Text style={s.secondaryText}>Editar</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Eliminar nota de ${author}`}
                        disabled={busy}
                        onPress={() => void handleDelete(note.id)}
                        style={[
                          s.button,
                          s.danger,
                          busy && s.disabled,
                        ]}
                      >
                        <Text style={s.dangerText}>
                          {mDelete.isPending &&
                          mDelete.variables === note.id
                            ? "Eliminando…"
                            : "Eliminar"}
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    width: "100%",
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#e7e9f0",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    overflow: "hidden",
  },
  header: {
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heading: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  title: {
    color: "#202536",
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    color: "#737b8e",
    fontSize: 12,
    lineHeight: 19,
  },
  composer: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: "#eef0f5",
    gap: 10,
  },
  input: {
    width: "100%",
    minWidth: 0,
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#dce0e9",
    backgroundColor: "#ffffff",
    color: "#202536",
    borderRadius: 9,
    padding: 12,
    fontSize: 14,
    lineHeight: 22,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
  },
  button: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: "#7551c8",
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  secondary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ded5ef",
  },
  secondaryText: {
    color: "#7551c8",
    fontSize: 12,
    fontWeight: "600",
  },
  danger: {
    backgroundColor: "#fff3f3",
    borderWidth: 1,
    borderColor: "#f3d6d6",
  },
  dangerText: {
    color: "#b42332",
    fontSize: 12,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
  list: {
    maxHeight: 520,
  },
  listContent: {
    paddingBottom: 4,
  },
  noteRow: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: "#e7e9f0",
    gap: 14,
  },
  noteHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  marker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#f1ecfa",
    alignItems: "center",
    justifyContent: "center",
  },
  markerText: {
    color: "#7551c8",
    fontSize: 13,
    fontWeight: "700",
  },
  author: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "600",
  },
  meta: {
    color: "#8991a2",
    fontSize: 11,
    lineHeight: 17,
  },
  body: {
    color: "#344054",
    fontSize: 14,
    lineHeight: 23,
  },
  loading: {
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  empty: {
    padding: 20,
    color: "#737b8e",
    fontSize: 13,
    lineHeight: 21,
  },
  feedback: {
    padding: 18,
    gap: 10,
    alignItems: "flex-start",
  },
  error: {
    color: "#b42332",
    paddingHorizontal: 18,
    paddingBottom: 14,
    fontSize: 12,
    lineHeight: 19,
  },
  errorText: {
    color: "#b42332",
    fontSize: 12,
    lineHeight: 19,
  },
});