// app/deals/new.tsx
import { listAccounts } from "@/src/api/accounts";
import { getAuthStorageScope } from "@/src/api/auth";
import { listContacts, type Contact } from "@/src/api/contacts";
import { createDeal, type DealStage } from "@/src/api/deals";
import { listWorkspaceMembers } from "@/src/api/workspaceMembers";
import DealDocuments from "@/src/components/DealDocuments";
import { uid } from "@/src/utils/uid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const LABEL: Record<DealStage, string> = {
  nuevo: "Nuevo",
  calificado: "Calificado",
  propuesta: "Propuesta",
  negociacion: "Negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};

const STAGES = Object.keys(LABEL) as DealStage[];

function parseCloseDate(value: string): number | null {
  if (!value.trim()) return null;

  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw new Error("La fecha debe tener formato DD/MM/AAAA.");

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    year < 1900 ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("La fecha prevista de cierre no es válida.");
  }

  return date.getTime();
}

export default function NewDeal() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<string | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<DealStage>("nuevo");
  const [closeDate, setCloseDate] = useState("");
  const [lostReason, setLostReason] = useState("");

  const [contact, setContact] = useState<Contact | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [term, setTerm] = useState("");

  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");

  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;

    getAuthStorageScope()
      .then((current) => {
        if (!active) return;
        if (!current) throw new Error("Vuelve a iniciar sesión.");
        setScope(current.storageKey);
      })
      .catch((err) => {
        if (active) {
          setScopeError(
            err instanceof Error ? err.message : "No se pudo comprobar la sesión."
          );
        }
      });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(contactSearch.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [contactSearch]);

  async function assertScope() {
    const current = await getAuthStorageScope();

    if (!scope || current?.storageKey !== scope) {
      throw new Error("Cambió la sesión o el workspace. Reabre este formulario.");
    }
  }

  const qContacts = useQuery({
    queryKey: ["contact-search", scope, term],
    enabled: Boolean(scope) && !contact && term.length >= 2,
    queryFn: async () => {
      await assertScope();
      const rows = await listContacts({ q: term, limit: 20 });
      await assertScope();
      return rows;
    },
    retry: false,
  });

  const qMembers = useQuery({
    queryKey: ["workspaceMembers", "new-deal", scope],
    enabled: Boolean(scope),
    queryFn: async () => {
      await assertScope();
      const rows = await listWorkspaceMembers();
      await assertScope();
      return rows;
    },
    retry: false,
  });

  const qAccounts = useQuery({
    queryKey: ["accounts", "new-deal", scope],
    enabled: Boolean(scope) && accountOpen,
    queryFn: async () => {
      await assertScope();
      const rows = await listAccounts();
      await assertScope();
      return rows;
    },
    retry: false,
  });

  const members = qMembers.data ?? [];
  const accounts = qAccounts.data ?? [];

  const selectedMember = members.find((member) => member.id === assignedTo);
  const selectedAccount = accounts.find((account) => account.id === accountId);

  const filteredMembers = members.filter((member) =>
    `${member.name || ""} ${member.email || ""}`
      .toLowerCase()
      .includes(memberSearch.trim().toLowerCase())
  );

  const filteredAccounts = accounts.filter((account) =>
    account.name.toLowerCase().includes(accountSearch.trim().toLowerCase())
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (submitting.current || created) {
        throw new Error("La creación ya está en curso o fue completada.");
      }

      submitting.current = true;

      try {
        await assertScope();

        if (!title.trim()) throw new Error("El título es obligatorio.");

        const value = amount.trim() ? Number(amount) : null;

        if (
          value !== null &&
          (!/^\d+$/.test(amount.trim()) ||
            !Number.isSafeInteger(value) ||
            value < 0)
        ) {
          throw new Error("Escribe el monto en números enteros, sin puntos ni comas.");
        }

        if (stage === "perdido" && !lostReason.trim()) {
          throw new Error("Indica el motivo de pérdida.");
        }

        const result = await createDeal({
          id: uid(),
          title: title.trim(),
          amount: value,
          stage,
          account_id: accountId,
          contact_id: contact?.id ?? null,
          assigned_to: assignedTo,
          close_date: parseCloseDate(closeDate),
          lost_reason: stage === "perdido" ? lostReason.trim() : null,
        });

        setCreated(true);
        setCreatedId(result.id);
        return result;
      } finally {
        submitting.current = false;
      }
    },
   onSuccess: async (result) => {
  setCreatedId(result.id);

  await qc.invalidateQueries({ queryKey: ["deals"] });

  const current = await getAuthStorageScope();

  if (current?.storageKey !== scope) {
    setCreatedId(null);
    setError(
      "La oportunidad se creó en el workspace anterior. Cierra este formulario."
    );
    return;
  }

  setError(null);
},
    onError: (err) => {
      setError(err instanceof Error ? err.message : "No se pudo crear la oportunidad.");
    },
  });

  const locked = mutation.isPending || created;

  function chooseContact(item: Contact) {
    setContact(item);
    setContactSearch("");
    setTerm("");

    // Vincula la cuenta del contacto cuando este ya tiene una.
    setAccountId(item.account_id || null);
  }

  return (
    <View style={S.screen}>
      <Stack.Screen options={{ title: "Nueva oportunidad" }} />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={S.container}
      >
        <Text style={S.title}>Nueva oportunidad</Text>
        <Text style={S.subtle}>
          Define la negociación, su cliente y quién llevará el seguimiento.
        </Text>

        {scopeError && <Text style={S.error}>{scopeError}</Text>}

        {!scope && !scopeError ? (
          <ActivityIndicator color="#7551c8" />
        ) : scope ? (
          <View style={S.card}>
            <Text style={S.label}>Título de la negociación *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              editable={!locked}
              maxLength={300}
              placeholder="Ej: Campaña de verano para Acme"
              placeholderTextColor="#8791a5"
              style={S.input}
            />

            <Text style={S.label}>Contacto</Text>
            <Text style={S.subtle}>
              Busca por nombre, empresa o correo. Su privacidad se conserva.
            </Text>

            {contact ? (
              <View style={S.selected}>
                <Text style={S.label}>{contact.name}</Text>
                <Text style={S.subtle}>
                  {[contact.company, contact.email].filter(Boolean).join(" · ")}
                </Text>
                <Pressable disabled={locked} onPress={() => {
                  setContact(null);
                  setAccountId(null);
                }}>
                  <Text style={S.link}>Cambiar contacto</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  value={contactSearch}
                  onChangeText={setContactSearch}
                  editable={!locked}
                  maxLength={120}
                  placeholder="Escribe al menos 2 caracteres"
                  placeholderTextColor="#8791a5"
                  style={S.input}
                />

                {contactSearch.trim().length >= 2 && (
                  contactSearch.trim() !== term || qContacts.isFetching ? (
                    <Text style={S.subtle}>Buscando contactos…</Text>
                  ) : qContacts.isError ? (
                    <View style={S.selected}>
                      <Text style={S.error}>No se pudieron buscar los contactos.</Text>
                      <Pressable onPress={() => { void qContacts.refetch(); }}>
                        <Text style={S.link}>Reintentar</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <ScrollView nestedScrollEnabled style={S.list}
                      keyboardShouldPersistTaps="handled">
                      {(qContacts.data ?? []).map((item) => (
                        <Pressable key={item.id} disabled={locked}
                          style={S.option} onPress={() => chooseContact(item)}>
                          <Text style={S.label}>{item.name}</Text>
                          <Text style={S.subtle}>
                            {[item.company, item.email].filter(Boolean).join(" · ")}
                          </Text>
                        </Pressable>
                      ))}
                      {qContacts.data?.length === 0 && (
                        <Text style={S.subtle}>No hay coincidencias.</Text>
                      )}
                      {qContacts.data?.length === 20 && (
                        <Text style={S.subtle}>
                          Se muestran hasta 20 resultados. Afina la búsqueda.
                        </Text>
                      )}
                    </ScrollView>
                  )
                )}
              </>
            )}

            <Text style={S.label}>Cuenta / empresa relacionada</Text>
            <Pressable style={S.input} disabled={locked}
              onPress={() => setAccountOpen((open) => !open)}>
              <Text style={S.value}>
                {selectedAccount?.name ||
                  (accountId ? "Cuenta vinculada al contacto" : "Sin cuenta")}
                {"  ▾"}
              </Text>
            </Pressable>

            {accountOpen && (
              <View style={S.selected}>
                <TextInput value={accountSearch} onChangeText={setAccountSearch}
                  editable={!locked} placeholder="Buscar entre las cuentas cargadas"
                  style={S.input} />
                {qAccounts.isLoading ? (
                  <Text style={S.subtle}>Cargando cuentas…</Text>
                ) : qAccounts.isError ? (
                  <Pressable onPress={() => { void qAccounts.refetch(); }}>
                    <Text style={S.link}>No se pudieron cargar. Reintentar</Text>
                  </Pressable>
                ) : (
                  <ScrollView nestedScrollEnabled style={S.list}
                    keyboardShouldPersistTaps="handled">
                    <Pressable style={S.option} disabled={locked}
                      onPress={() => { setAccountId(null); setAccountOpen(false); }}>
                      <Text style={S.value}>Sin cuenta</Text>
                    </Pressable>
                    {filteredAccounts.map((account) => (
                      <Pressable key={account.id} style={S.option}
                        disabled={locked} onPress={() => {
                          setAccountId(account.id);
                          // Evita conservar un contacto de otra cuenta.
                          if (contact && contact.account_id !== account.id) {
                            setContact(null);
                          }
                          setAccountOpen(false);
                        }}>
                        <Text style={S.value}>{account.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            <Text style={S.label}>Responsable de la oportunidad</Text>
            <Text style={S.subtle}>
              Lleva la negociación. Las actividades tienen sus propios asignados.
            </Text>
            <Pressable style={S.input} disabled={locked}
              onPress={() => setMemberOpen((open) => !open)}>
              <Text style={S.value}>
                {selectedMember?.name || selectedMember?.email || "Sin asignar"}
                {"  ▾"}
              </Text>
            </Pressable>

            {memberOpen && (
              <View style={S.selected}>
                <TextInput value={memberSearch} onChangeText={setMemberSearch}
                  editable={!locked} placeholder="Buscar persona"
                  style={S.input} />
                {qMembers.isLoading ? (
                  <Text style={S.subtle}>Cargando personas…</Text>
                ) : qMembers.isError ? (
                  <Pressable onPress={() => { void qMembers.refetch(); }}>
                    <Text style={S.link}>No se pudieron cargar. Reintentar</Text>
                  </Pressable>
                ) : (
                  <ScrollView nestedScrollEnabled style={S.list}
                    keyboardShouldPersistTaps="handled">
                    <Pressable style={S.option} disabled={locked}
                      onPress={() => { setAssignedTo(null); setMemberOpen(false); }}>
                      <Text style={S.value}>Sin asignar</Text>
                    </Pressable>
                    {filteredMembers.map((member) => (
                      <Pressable key={member.id} style={S.option}
                        disabled={locked} onPress={() => {
                          setAssignedTo(member.id);
                          setMemberOpen(false);
                        }}>
                        <Text style={S.label}>
                          {member.name || member.email || member.id}
                        </Text>
                        {!!member.email && (
                          <Text style={S.subtle}>{member.email}</Text>
                        )}
                      </Pressable>
                    ))}
                    {filteredMembers.length === 0 && (
                      <Text style={S.subtle}>No hay coincidencias.</Text>
                    )}
                  </ScrollView>
                )}
              </View>
            )}

            <Text style={S.subtle}>
              El responsable debe pertenecer al workspace y tener acceso al contacto.
            </Text>

            <View style={S.columns}>
              <View style={S.field}>
                <Text style={S.label}>Monto estimado</Text>
                <TextInput value={amount} onChangeText={setAmount}
                  editable={!locked} keyboardType="numeric"
                  placeholder="Ej: 1500000, sin separadores"
                  placeholderTextColor="#8791a5" style={S.input} />
              </View>
              <View style={S.field}>
                <Text style={S.label}>Cierre previsto</Text>
                <TextInput value={closeDate} onChangeText={setCloseDate}
                  editable={!locked} placeholder="DD/MM/AAAA"
                  placeholderTextColor="#8791a5"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10} style={S.input} />
              </View>
            </View>

            <Text style={S.label}>Etapa inicial</Text>
            <View style={S.pills}>
              {STAGES.map((item) => (
                <Pressable key={item} disabled={locked}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item === stage }}
                  style={[S.pill, item === stage && S.pillActive]}
                  onPress={() => setStage(item)}>
                  <Text style={[S.value, item === stage && S.white]}>
                    {LABEL[item]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {stage === "perdido" && (
              <>
                <Text style={S.label}>Motivo de pérdida *</Text>
                <TextInput value={lostReason} onChangeText={setLostReason}
                  editable={!locked} multiline maxLength={2000}
                  placeholder="Explica por qué no se concretó"
                  style={[S.input, { minHeight: 90 }]} />
              </>
            )}
{!created && (
  <Text style={S.subtle}>
    Al crear la oportunidad podrás adjuntar su presupuesto aquí mismo.
    También puedes añadirlo después desde el detalle.
  </Text>
)}

{created && createdId && (
  <View style={{ gap: 14 }}>
    <View style={S.selected}>
      <Text style={S.label}>Oportunidad creada correctamente</Text>
      <Text style={S.subtle}>
        Los datos ya están guardados. Puedes adjuntar el presupuesto ahora
        o continuar sin archivo.
      </Text>
    </View>

    <DealDocuments key={createdId} dealId={createdId} />

    <Pressable
      style={S.secondary}
      onPress={async () => {
        try {
          await assertScope();

          router.replace({
            pathname: "/deals/[id]",
            params: { id: createdId },
          });
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo abrir la oportunidad."
          );
        }
      }}
    >
      <Text style={S.link}>Abrir detalle de la oportunidad →</Text>
    </Pressable>
  </View>
)}
            {error && <Text accessibilityRole="alert" style={S.error}>{error}</Text>}

            <View style={S.actions}>
              <Pressable disabled={locked} style={S.primary}
                onPress={() => {
                  setError(null);
                  mutation.mutate();
                }}>
                <Text style={S.white}>
                  {created ? "Oportunidad creada" :
                    mutation.isPending ? "Creando…" : "Crear oportunidad"}
                </Text>
              </Pressable>
              <Pressable disabled={mutation.isPending} style={S.secondary}
                onPress={() => router.back()}>
                <Text style={S.value}>{created ? "Volver" : "Cancelar"}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f6fa" },
  container: {
    width: "100%", maxWidth: 1000, alignSelf: "center",
    padding: 24, paddingBottom: 80, gap: 14,
  },
  title: { fontSize: 27, fontWeight: "800", color: "#252a3a" },
  card: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#e0e4ed",
    borderRadius: 14, padding: 22, gap: 12, marginTop: 8,
  },
  label: { color: "#30364a", fontWeight: "700", fontSize: 13 },
  subtle: { color: "#788399", fontSize: 12, lineHeight: 19 },
  value: { color: "#454d64", fontSize: 13 },
  input: {
    borderWidth: 1, borderColor: "#dce0eb", backgroundColor: "#fff",
    borderRadius: 9, padding: 12, color: "#252a3a", fontSize: 14,
  },
  selected: {
    borderWidth: 1, borderColor: "#e3dcf3",
    backgroundColor: "#faf8fe", borderRadius: 10, padding: 12, gap: 8,
  },
  list: { maxHeight: 240 },
  option: { padding: 12, gap: 4, borderBottomWidth: 1, borderColor: "#e7eaf1" },
  link: { color: "#7551c8", fontSize: 13, fontWeight: "700" },
  columns: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  field: { flex: 1, minWidth: 190, gap: 10 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1, borderColor: "#dce0eb", borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  pillActive: { backgroundColor: "#7551c8", borderColor: "#7551c8" },
  white: { color: "#fff", fontSize: 13, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  primary: { backgroundColor: "#7551c8", borderRadius: 9, padding: 13 },
  secondary: {
    borderWidth: 1, borderColor: "#dce0eb", borderRadius: 9, padding: 13,
  },
  error: { color: "#b52b46", fontSize: 13, lineHeight: 20 },
});