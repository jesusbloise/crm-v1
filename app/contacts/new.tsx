// app/contacts/new.tsx
import { listAccounts } from "@/src/api/accounts";
import { createContact } from "@/src/api/contacts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/* 🎨 Tema consistente */
const BG       = "#0b0c10";
const CARD     = "#14151a";
const FIELD    = "#121318";
const BORDER   = "#272a33";
const TEXT     = "#e8ecf1";
const SUBTLE   = "#a9b0bd";
const ACCENT   = "#7c3aed";   // primario morado

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function NewContact() {
  const qc = useQueryClient();

  const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [name, setName]           = useState("");
  const [company, setCompany]     = useState("");
  const [position, setPosition]   = useState("");
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [err, setErr]             = useState<string | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      setErr(null);
      if (!name.trim()) throw new Error("Nombre requerido");
      await createContact({
        id: uid(),
        name: name.trim(),
        company: company || undefined,
        position: position || undefined,
        email: email || undefined,
        phone: phone || undefined,
        account_id: accountId || undefined,
      } as any);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contacts"] });
      router.back();
    },
    onError: (e: any) => setErr(String(e?.message || e)),
  });

  return (
    <>
      <Stack.Screen
        options={{
          title: "Nuevo Contacto",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT,
          headerTitleStyle: { color: TEXT, fontWeight: "800" },
        }}
      />
      <View style={styles.screen}>
        {err ? <Text style={styles.err}>⚠️ {err}</Text> : null}

        <View style={{ gap: 12 }}>
          <TextInput
            placeholder="Nombre*"
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholderTextColor={SUBTLE}
          />
          <TextInput
            placeholder="Empresa (texto)"
            value={company}
            onChangeText={setCompany}
            style={styles.input}
            placeholderTextColor={SUBTLE}
          />
          <TextInput
            placeholder="Cargo"
            value={position}
            onChangeText={setPosition}
            style={styles.input}
            placeholderTextColor={SUBTLE}
          />
          <TextInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={SUBTLE}
          />
          <TextInput
            placeholder="Teléfono"
            value={phone}
            onChangeText={setPhone}
            style={styles.input}
            keyboardType="phone-pad"
            placeholderTextColor={SUBTLE}
          />
        </View>

        {/* Selector de Cuenta — sin margen arriba/abajo y chips compactas */}
        <Text style={styles.label}>Cuenta (opcional)</Text>
        {qAcc.isLoading ? (
          <Text style={styles.subtle}>Cargando cuentas…</Text>
        ) : qAcc.isError ? (
          <Text style={styles.err}>
            Error cargando cuentas: {String((qAcc.error as any)?.message || qAcc.error)}
          </Text>
        ) : (
          <FlatList
            horizontal
            data={qAcc.data ?? []}
            keyExtractor={(a) => a.id}
            contentContainerStyle={{ paddingVertical: 0 }}   // 👈 sin margen vertical
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ width: 8 }} />} // espacio entre chips
            renderItem={({ item }) => {
              const selected = accountId === item.id;
              return (
                <Pressable
                  onPress={() => setAccountId(selected ? undefined : item.id)}
                  style={[styles.chip, selected && styles.chipActive]}
                  accessibilityRole="button"
                >
                  <Text
                    style={[styles.chipText, selected && styles.chipTextActive]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.subtle}>
                No hay cuentas aún. Crea una en “Cuentas”.
              </Text>
            }
          />
        )}

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
            m.isPending && { opacity: 0.9 },
          ]}
          onPress={() => m.mutate()}
          disabled={m.isPending}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>
            {m.isPending ? "Guardando..." : "Guardar"}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, gap: 12 },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: FIELD,
    color: TEXT,
    borderRadius: 12,
    padding: 12,
  },

  label: { color: TEXT, fontWeight: "800", marginTop: 10, marginBottom: 4 },
  subtle: { color: SUBTLE },

  // 🔽 Chips compactas y sin “alto raro”
  chip: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",    // evita estirarse verticalmente
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { color: TEXT, fontWeight: "800", fontSize: 12, maxWidth: 160 },
  chipTextActive: { color: "#fff" },

  primaryBtn: {
    marginTop: 8,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  pressed: { opacity: 0.9 },

  err: { color: "#fecaca" },
});

