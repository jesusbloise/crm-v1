// app/contacts/[id].tsx
import { listAccounts } from "@/src/api/accounts";
import { deleteContact, getContact, updateContact } from "@/src/api/contacts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

export default function ContactDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = Array.isArray(id) ? id[0] : id;

  if (!contactId || contactId === "index") {
    return (
      <>
        <Stack.Screen options={{ title: "Detalle Contacto" }} />
        <View style={styles.container}>
          <Text style={{ opacity: 0.7 }}>Ruta inválida</Text>
        </View>
      </>
    );
  }

  const qc = useQueryClient();

  // Contacto
  const q = useQuery({
    queryKey: ["contact", contactId],
    queryFn: () => getContact(contactId),
  });

  // Cuentas para el picker
  const qAcc = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

  // Estado local de edición
  const [companyText, setCompanyText] = useState("");
  const [accountId, setAccountId] = useState<string | undefined>(undefined);

  // Precargar valores cuando llega el contacto
  useEffect(() => {
    if (q.data) {
      setCompanyText(q.data.company ?? "");
      setAccountId(q.data.account_id ?? undefined);
    }
  }, [q.data?.company, q.data?.account_id, q.data]); // dependencias correctas

  const mUpd = useMutation({
    mutationFn: async () =>
      updateContact(contactId, {
        company: companyText || undefined,
        account_id: accountId || undefined,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contact", contactId] });
      await qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const mDel = useMutation({
    mutationFn: async () => deleteContact(contactId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contacts"] });
      router.back();
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: "Detalle Contacto" }} />
      <View style={styles.container}>
        {q.isLoading ? (
          <Text style={{ opacity: 0.7 }}>Cargando...</Text>
        ) : q.isError ? (
          <>
            <Text style={{ color: "crimson", marginBottom: 8 }}>
              Error: {String((q.error as any)?.message || q.error)}
            </Text>
            <Pressable
              style={[styles.btn, { backgroundColor: "#1e90ff" }]}
              onPress={() => q.refetch()}
            >
              <Text style={styles.btnText}>Reintentar</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { backgroundColor: "#6b7280" }]}
              onPress={() => router.back()}
            >
              <Text style={styles.btnText}>Volver</Text>
            </Pressable>
          </>
        ) : !q.data ? (
          <Text style={{ opacity: 0.7 }}>No encontrado</Text>
        ) : (
          <>
            <Text style={styles.title}>{q.data.name}</Text>
            {q.data.position ? <Text>Cargo: {q.data.position}</Text> : null}
            {q.data.email ? <Text>Email: {q.data.email}</Text> : null}
            {q.data.phone ? <Text>Tel: {q.data.phone}</Text> : null}

            {/* Empresa (texto libre, opcional) */}
            <Text style={{ marginTop: 12, fontWeight: "600" }}>Empresa (texto)</Text>
            <TextInput
              placeholder="Empresa"
              value={companyText}
              onChangeText={setCompanyText}
              style={styles.input}
            />

            {/* Cuenta (relación) */}
            <Text style={{ marginTop: 12, fontWeight: "600" }}>
              Cuenta (opcional)
            </Text>
            {qAcc.isLoading ? (
              <Text style={{ opacity: 0.7 }}>Cargando cuentas…</Text>
            ) : qAcc.isError ? (
              <Text style={{ color: "crimson" }}>
                Error cargando cuentas:{" "}
                {String((qAcc.error as any)?.message || qAcc.error)}
              </Text>
            ) : (
              <FlatList
                horizontal
                data={qAcc.data ?? []}
                keyExtractor={(a) => a.id}
                contentContainerStyle={{ paddingVertical: 4 }}
                renderItem={({ item }) => {
                  const selected = accountId === item.id;
                  return (
                    <Pressable
                      onPress={() => setAccountId(item.id)}
                      style={[
                        styles.chip,
                        selected && {
                          backgroundColor: "#1e90ff",
                          borderColor: "#1e90ff",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && { color: "#fff" },
                        ]}
                      >
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text style={{ opacity: 0.7 }}>
                    No hay cuentas. Crea una en “Cuentas”.
                  </Text>
                }
              />
            )}

            <Pressable
              style={[styles.btn, { backgroundColor: "#1e90ff" }]}
              onPress={() => mUpd.mutate()}
              disabled={mUpd.isPending}
            >
              <Text style={styles.btnText}>
                {mUpd.isPending ? "Guardando..." : "Guardar cambios"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.btn, { backgroundColor: "#ef4444" }]}
              onPress={() => mDel.mutate()}
              disabled={mDel.isPending}
            >
              <Text style={styles.btnText}>
                {mDel.isPending ? "Eliminando..." : "Eliminar"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  btn: { marginTop: 12, padding: 12, borderRadius: 8, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    marginRight: 8,
  },
  chipText: { color: "#000" },
});
