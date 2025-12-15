// src/components/RelatedNotes.tsx
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
  type Note,
} from "@/src/api/notes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/** Extiende Note con los campos enriquecidos del backend */
type NoteWithCreator = Note & {
  created_by_name?: string | null;
  created_by_email?: string | null;
};

export type NoteFilters = {
  deal_id?: string;
  account_id?: string;
  contact_id?: string;
  lead_id?: string;
};

export default function RelatedNotes({
  title = "Notas",
  filters,
}: {
  title?: string;
  filters: NoteFilters;
}) {
  const qc = useQueryClient();
  const [newBody, setNewBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const q = useQuery<NoteWithCreator[]>({
    queryKey: ["notes", filters],
    queryFn: () => listNotes(filters) as Promise<NoteWithCreator[]>,
    enabled: Object.keys(filters).length > 0,
  });

  const mCreate = useMutation({
    mutationFn: async () => {
      const b = newBody.trim();
      if (!b) return;
      await createNote({ body: b, ...filters } as any);
    },
    onSuccess: async () => {
      setNewBody("");
      await qc.invalidateQueries({ queryKey: ["notes", filters] });
    },
  });

  const mUpdate = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      await updateNote(editingId, { body: editingBody });
    },
    onSuccess: async () => {
      setEditingId(null);
      setEditingBody("");
      await qc.invalidateQueries({ queryKey: ["notes", filters] });
    },
  });

  const mDelete = useMutation({
    mutationFn: async (id: string) => deleteNote(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notes", filters] });
    },
  });

  const notes = q.data ?? [];

  return (
    <View style={S.box}>
      <Text style={S.title}>{title}</Text>

      {/* input + botón Agregar */}
      <View style={[S.row, { gap: 8 }]}>
        <TextInput
          style={[S.input]}
          placeholder="Escribe una nota…"
          placeholderTextColor="#475569"
          value={newBody}
          onChangeText={setNewBody}
        />
        <Pressable
          style={[S.btn, S.btnPrimary, mCreate.isPending && { opacity: 0.7 }]}
          onPress={() => mCreate.mutate()}
          disabled={mCreate.isPending}
        >
          <Text style={S.btnText}>Agregar</Text>
        </Pressable>
      </View>

      {q.isError ? (
        <Text style={{ color: "#ef4444", padding: 12 }}>
          Error cargando notas.
        </Text>
      ) : notes.length === 0 ? (
        <Text style={{ color: "#475569", padding: 12 }}>No hay notas.</Text>
      ) : (
        // 🔽 Contenedor con scroll y altura limitada (similar a actividades)
        <View style={S.listWrapper}>
          <ScrollView
            style={S.scroll}
            nestedScrollEnabled
            contentContainerStyle={S.listContent}
          >
            {notes.map((n) => {
              const isEditing = editingId === n.id;
              return (
                <View key={n.id} style={S.row}>
                  {isEditing ? (
                    <TextInput
                      style={[S.input, { flex: 1 }]}
                      value={editingBody}
                      onChangeText={setEditingBody}
                      placeholder="Editar nota…"
                      placeholderTextColor="#475569"
                    />
                  ) : (
                    <View style={{ flex: 1 }}>
                      <Text style={S.note}>{n.body}</Text>
                      {n.created_by_name && (
                        <Text style={S.noteMeta}>👤 {n.created_by_name}</Text>
                      )}
                    </View>
                  )}

                  {isEditing ? (
                    <>
                      <Pressable
                        style={[
                          S.btn,
                          S.btnPrimary,
                          mUpdate.isPending && { opacity: 0.7 },
                        ]}
                        onPress={() => mUpdate.mutate()}
                        disabled={mUpdate.isPending}
                      >
                        <Text style={S.btnText}>Guardar</Text>
                      </Pressable>
                      <Pressable
                        style={[S.btn, S.btnMuted]}
                        onPress={() => {
                          setEditingId(null);
                          setEditingBody("");
                        }}
                      >
                        <Text style={S.btnText}>Cancelar</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable
                        style={[S.btn, S.btnMuted]}
                        onPress={() => {
                          setEditingId(n.id);
                          setEditingBody(n.body);
                        }}
                      >
                        <Text style={S.btnText}>Editar</Text>
                      </Pressable>
                      <Pressable
                        style={[S.btn, S.btnDanger]}
                        onPress={() => mDelete.mutate(n.id)}
                      >
                        <Text style={S.btnText}>Borrar</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#ECEFF4",
    borderRadius: 12,
    overflow: "hidden",
  },
  title: { color: "#0F172A", fontWeight: "900", fontSize: 16, padding: 12 },

  // 🔽 contenedor con scroll para las notas (máx ~5 filas)
  listWrapper: {
    maxHeight: 380,
  },
  scroll: {
    maxHeight: 380,
  },
  listContent: {
    paddingBottom: 4,
  },

  row: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#CBD5E1",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  note: { color: "#0F172A", flex: 1, fontWeight: "600" },
  noteMeta: {
    color: "#7C3AED",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
    color: "#0F172A",
    borderRadius: 10,
    padding: 10,
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  btnPrimary: { backgroundColor: "#7C3AED" },
  btnMuted: { backgroundColor: "#334155" },
  btnDanger: { backgroundColor: "#EF4444" },
});


// // src/components/RelatedNotes.tsx
// import { createNote, deleteNote, listNotes, updateNote, type Note } from "@/src/api/notes";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { useState } from "react";
// import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

// /** Extiende Note con los campos enriquecidos del backend */
// type NoteWithCreator = Note & {
//   created_by_name?: string | null;
//   created_by_email?: string | null;
// };

// export type NoteFilters = {
//   deal_id?: string;
//   account_id?: string;
//   contact_id?: string;
//   lead_id?: string;
// };

// export default function RelatedNotes({
//   title = "Notas",
//   filters,
// }: {
//   title?: string;
//   filters: NoteFilters;
// }) {
//   const qc = useQueryClient();
//   const [newBody, setNewBody] = useState("");
//   const [editingId, setEditingId] = useState<string | null>(null);
//   const [editingBody, setEditingBody] = useState("");

//   const q = useQuery<NoteWithCreator[]>({
//     queryKey: ["notes", filters],
//     queryFn: () => listNotes(filters) as Promise<NoteWithCreator[]>,
//     enabled: Object.keys(filters).length > 0,
//   });

//   const mCreate = useMutation({
//     mutationFn: async () => {
//       const b = newBody.trim();
//       if (!b) return;
//       await createNote({ body: b, ...filters } as any);
//     },
//     onSuccess: async () => {
//       setNewBody("");
//       await qc.invalidateQueries({ queryKey: ["notes", filters] });
//     },
//   });

//   const mUpdate = useMutation({
//     mutationFn: async () => {
//       if (!editingId) return;
//       await updateNote(editingId, { body: editingBody });
//     },
//     onSuccess: async () => {
//       setEditingId(null);
//       setEditingBody("");
//       await qc.invalidateQueries({ queryKey: ["notes", filters] });
//     },
//   });

//   const mDelete = useMutation({
//     mutationFn: async (id: string) => deleteNote(id),
//     onSuccess: async () => {
//       await qc.invalidateQueries({ queryKey: ["notes", filters] });
//     },
//   });

//   return (
//     <View style={S.box}>
//       <Text style={S.title}>{title}</Text>

//       <View style={[S.row, { gap: 8 }]}>
//         <TextInput
//           style={[S.input]}
//           placeholder="Escribe una nota…"
//           placeholderTextColor="#475569"
//           value={newBody}
//           onChangeText={setNewBody}
//         />
//         <Pressable
//           style={[S.btn, S.btnPrimary, mCreate.isPending && { opacity: 0.7 }]}
//           onPress={() => mCreate.mutate()}
//           disabled={mCreate.isPending}
//         >
//           <Text style={S.btnText}>Agregar</Text>
//         </Pressable>
//       </View>

//       {q.isError ? (
//         <Text style={{ color: "#ef4444", padding: 12 }}>Error cargando notas.</Text>
//       ) : (
//         <>
//           {(q.data ?? []).map((n) => {
//             const isEditing = editingId === n.id;
//             return (
//               <View key={n.id} style={S.row}>
//                 {isEditing ? (
//                   <TextInput
//                     style={[S.input, { flex: 1 }]}
//                     value={editingBody}
//                     onChangeText={setEditingBody}
//                     placeholder="Editar nota…"
//                     placeholderTextColor="#475569"
//                   />
//                 ) : (
//                   <View style={{ flex: 1 }}>
//                     <Text style={S.note}>{n.body}</Text>
//                     {n.created_by_name && (
//                       <Text style={S.noteMeta}>👤 {n.created_by_name}</Text>
//                     )}
//                   </View>
//                 )}

//                 {isEditing ? (
//                   <>
//                     <Pressable
//                       style={[S.btn, S.btnPrimary, mUpdate.isPending && { opacity: 0.7 }]}
//                       onPress={() => mUpdate.mutate()}
//                       disabled={mUpdate.isPending}
//                     >
//                       <Text style={S.btnText}>Guardar</Text>
//                     </Pressable>
//                     <Pressable
//                       style={[S.btn, S.btnMuted]}
//                       onPress={() => {
//                         setEditingId(null);
//                         setEditingBody("");
//                       }}
//                     >
//                       <Text style={S.btnText}>Cancelar</Text>
//                     </Pressable>
//                   </>
//                 ) : (
//                   <>
//                     <Pressable
//                       style={[S.btn, S.btnMuted]}
//                       onPress={() => {
//                         setEditingId(n.id);
//                         setEditingBody(n.body);
//                       }}
//                     >
//                       <Text style={S.btnText}>Editar</Text>
//                     </Pressable>
//                     <Pressable
//                       style={[S.btn, S.btnDanger]}
//                       onPress={() => mDelete.mutate(n.id)}
//                     >
//                       <Text style={S.btnText}>Borrar</Text>
//                     </Pressable>
//                   </>
//                 )}
//               </View>
//             );
//           })}

//           {(q.data ?? []).length === 0 && (
//             <Text style={{ color: "#475569", padding: 12 }}>No hay notas.</Text>
//           )}
//         </>
//       )}
//     </View>
//   );
// }

// const S = StyleSheet.create({
//   box: {
//     borderWidth: 1,
//     borderColor: "#CBD5E1",
//     backgroundColor: "#ECEFF4",
//     borderRadius: 12,
//     overflow: "hidden",
//   },
//   title: { color: "#0F172A", fontWeight: "900", fontSize: 16, padding: 12 },
//   row: {
//     padding: 12,
//     borderTopWidth: 1,
//     borderTopColor: "#CBD5E1",
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 8,
//   },
//   note: { color: "#0F172A", flex: 1, fontWeight: "600" },
//   noteMeta: { color: "#7C3AED", fontSize: 11, fontWeight: "700", marginTop: 4 },
//   input: {
//     flex: 1,
//     borderWidth: 1,
//     borderColor: "#CBD5E1",
//     backgroundColor: "#fff",
//     color: "#0F172A",
//     borderRadius: 10,
//     padding: 10,
//   },
//   btn: {
//     paddingVertical: 8,
//     paddingHorizontal: 12,
//     borderRadius: 10,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   btnText: { color: "#fff", fontWeight: "800" },
//   btnPrimary: { backgroundColor: "#7C3AED" },
//   btnMuted: { backgroundColor: "#334155" },
//   btnDanger: { backgroundColor: "#EF4444" },
// });
