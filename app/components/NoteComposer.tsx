import { createNote } from "@/src/api/notes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

/* 🎨 Paleta morado/cian */
const PRIMARY = "#7C3AED";
const BG      = "#0F1115";
const CARD    = "#171923";
const BORDER  = "#2B3140";
const TEXT    = "#F3F4F6";
const SUBTLE  = "#A4ADBD";

type Props = {
  account_id?: string;
  deal_id?: string;
  contact_id?: string;
  lead_id?: string;
  invalidateKeys?: any[]; // e.g. [["notes", {deal_id}], ["deal", deal_id]]
};

export default function NoteComposer({
  account_id,
  deal_id,
  contact_id,
  lead_id,
  invalidateKeys = [],
}: Props) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      if (!body.trim()) throw new Error("Escribe una nota");
      await createNote({
        id: crypto.randomUUID(),
        body,
        account_id: account_id ?? null,
        deal_id: deal_id ?? null,
        contact_id: contact_id ?? null,
        lead_id: lead_id ?? null,
        created_at: Date.now(),
        updated_at: Date.now(),
      } as any);
    },
    onSuccess: async () => {
      setBody("");
      // refresca listas y la entidad si te interesa
      for (const key of invalidateKeys) {
        await qc.invalidateQueries({ queryKey: key as any });
      }
    },
  });

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Agregar nota</Text>
      <TextInput
        placeholder="Escribe una nota…"
        placeholderTextColor={SUBTLE}
        style={styles.input}
        multiline
        value={body}
        onChangeText={setBody}
      />
      {m.isError ? (
        <Text style={styles.error}>{(m.error as any)?.message || "Error"}</Text>
      ) : null}
      <Pressable
        onPress={() => m.mutate()}
        disabled={m.isPending}
        style={({ pressed }) => [
          styles.btn,
          pressed && { opacity: 0.92 },
          m.isPending && { opacity: 0.8 },
        ]}
      >
        <Text style={styles.btnText}>{m.isPending ? "Guardando…" : "Guardar nota"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  title: { color: TEXT, fontWeight: "900" },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 10,
    color: TEXT,
    minHeight: 64,
    textAlignVertical: "top",
    backgroundColor: "#12141b",
  },
  btn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  btnText: { color: "#fff", fontWeight: "900" },
  error: { color: "#fecaca", fontSize: 12 },
});
