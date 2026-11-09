// app/deals/index.tsx
import { getAuthStorageScope } from "@/src/api/auth";
import {
  listDeals,
  updateDeal,
  type Deal,
  type DealStage,
} from "@/src/api/deals";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { router, Stack, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const STAGES: DealStage[] = [
  "nuevo", "calificado", "propuesta",
  "negociacion", "ganado", "perdido",
];

const LABEL: Record<DealStage, string> = {
  nuevo: "Nuevo",
  calificado: "Calificado",
  propuesta: "Propuesta",
  negociacion: "Negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};

const COLOR: Record<DealStage, string> = {
  nuevo: "#8894a7",
  calificado: "#4386dd",
  propuesta: "#8b64d4",
  negociacion: "#dd9c36",
  ganado: "#28a77a",
  perdido: "#d75c71",
};

const PAGE_SIZE = 100;
const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function dateLabel(value?: number | string | null) {
  if (value == null) return null;
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("es-CL");
}

/**
 * El arrastre usa elementos HTML exclusivamente en web.
 * Las vistas nativas mantienen los controles de cambio de etapa.
 */
function DragCard({
  enabled,
  onStart,
  onEnd,
  children,
}: {
  enabled: boolean;
  onStart: () => void;
  onEnd: () => void;
  children: React.ReactNode;
}) {
  if (Platform.OS !== "web") return <View>{children}</View>;

  return React.createElement("div", {
    draggable: enabled,
    style: { cursor: enabled ? "grab" : "default" },
    onDragStart: (event: React.DragEvent<HTMLDivElement>) => {
      if (!enabled) {
        event.preventDefault();
        return;
      }

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "crm-opportunity");
      onStart();
    },
    onDragEnd: onEnd,
  }, children);
}

function DropColumn({
  onOver,
  onDrop,
  children,
}: {
  onOver: () => void;
  onDrop: () => void;
  children: React.ReactNode;
}) {
  if (Platform.OS !== "web") return <View>{children}</View>;

  return React.createElement("div", {
    style: { display: "flex", flexDirection: "column" },
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      onOver();
    },
    onDrop: (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      onDrop();
    },
  }, children);
}

export default function DealsBoard() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<string | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [hover, setHover] = useState<DealStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<{
    deal: Deal;
    stage: DealStage;
  } | null>(null);
  const [reason, setReason] = useState("");
  const dragged = useRef<Deal | null>(null);
  const dragEndedAt = useRef(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setScope(null);
    setScopeError(null);
    setMenu(null);
    setClosing(null);
    setOwner(null);

    getAuthStorageScope()
      .then((current) => {
        if (!active) return;
        if (!current) throw new Error("Vuelve a iniciar sesión.");
        setScope(current.storageKey);
      })
      .catch((err) => {
        if (active) setScopeError(String(err?.message || err));
      });

    return () => { active = false; };
  }, []));

  async function assertScope() {
    const current = await getAuthStorageScope();

    if (!scope || current?.storageKey !== scope) {
      throw new Error(
        "Cambió la sesión o el workspace. Reabre Oportunidades."
      );
    }
  }

  const q = useInfiniteQuery({
    queryKey: ["deals", "board", scope],
    enabled: Boolean(scope),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      await assertScope();
      const rows = await listDeals({
        limit: PAGE_SIZE,
        offset: pageParam,
      });
      await assertScope();
      return rows;
    },
    getNextPageParam: (last, pages) =>
      last.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    retry: false,
  });

  const deals = useMemo(() => {
    const unique = new Map<string, Deal>();

    for (const page of q.data?.pages ?? []) {
      for (const deal of page) unique.set(deal.id, deal);
    }

    return [...unique.values()];
  }, [q.data]);

  const owners = useMemo(() => {
    const result = new Map<string, string>();

    for (const deal of deals) {
      if (deal.assigned_to) {
        result.set(
          deal.assigned_to,
          deal.assigned_to_name || "Responsable sin nombre"
        );
      }
    }

    return [...result.entries()].sort((a, b) =>
      a[1].localeCompare(b[1])
    );
  }, [deals]);

  const visible = useMemo(() => {
    const term = normalize(search.trim());

    return deals.filter((deal) =>
      (!owner || deal.assigned_to === owner) &&
      (!term || normalize([
        deal.title,
        deal.contact_name,
        deal.account_name,
        deal.assigned_to_name,
        deal.created_by_name,
      ].filter(Boolean).join(" ")).includes(term))
    );
  }, [deals, search, owner]);

  const mutation = useMutation({
    mutationFn: async ({
      deal, stage, lostReason,
    }: {
      deal: Deal;
      stage: DealStage;
      lostReason?: string;
    }) => {
      await assertScope();

      const result = await updateDeal(deal.id, {
        stage,
        expected_updated_at: Number(deal.updated_at),
        ...(stage === "perdido" ? { lost_reason: lostReason } : {}),
      });

      await assertScope();
      return result;
    },
    onSuccess: async () => {
      setClosing(null);
      setReason("");
      setError(null);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["deals"] }),
        qc.invalidateQueries({ queryKey: ["deal"] }),
        qc.invalidateQueries({ queryKey: ["deal-history"] }),
        qc.invalidateQueries({ queryKey: ["activities"] }),
        qc.invalidateQueries({ queryKey: ["activities-all"] }),
      ]);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la etapa.");
      void qc.invalidateQueries({ queryKey: ["deals", "board", scope] });
    },
  });

  function changeStage(deal: Deal, stage: DealStage) {
    setMenu(null);
    if (mutation.isPending || q.isFetching || deal.stage === stage) return;
    setError(null);

    if (stage === "ganado" || stage === "perdido") {
      setReason("");
      setClosing({ deal, stage });
      return;
    }

    mutation.mutate({ deal, stage });
  }

  function finishDrag() {
    dragged.current = null;
    dragEndedAt.current = Date.now();
    setHover(null);
  }

  const busy = mutation.isPending || q.isFetching;
  const incomplete = Boolean(q.hasNextPage);

  return (
    <View style={S.screen}>
      <Stack.Screen options={{ title: "Oportunidades" }} />

      <View style={S.heading}>
        <View style={{ flex: 1 }}>
          <Text style={S.title}>Oportunidades</Text>
          <Text style={S.subtle}>
            Cada negociación, su responsable y su avance.
          </Text>
        </View>
        <Pressable style={S.primary} onPress={() => router.push("/deals/new")}>
          <Text style={S.primaryText}>＋ Nueva oportunidad</Text>
        </Pressable>
      </View>

      <View style={S.toolbar}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar negociación, cliente o responsable"
          placeholderTextColor="#8791a5"
          style={S.search}
        />
        <Pressable style={S.button} disabled={busy} onPress={() => {
          void q.refetch();
        }}>
          <Text style={S.buttonText}>Actualizar</Text>
        </Pressable>
      </View>

      {owners.length > 0 && (
        <ScrollView horizontal style={{ flexGrow: 0 }}>
          <View style={S.filters}>
            <Pressable style={[S.chip, !owner && S.chipActive]}
              onPress={() => setOwner(null)}>
              <Text style={S.buttonText}>Todos los responsables</Text>
            </Pressable>
            {owners.map(([id, name]) => (
              <Pressable key={id}
                style={[S.chip, owner === id && S.chipActive]}
                onPress={() => setOwner(id)}>
                <Text style={S.buttonText}>{name}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      <Text style={S.subtle}>
        {visible.length} oportunidades mostradas
        {incomplete ? " · Hay más por cargar; la búsqueda filtra las cargadas." : ""}
        {Platform.OS === "web" ? " · Arrastra una tarjeta para cambiar su etapa." : ""}
      </Text>

      {(error || scopeError) && (
        <Text accessibilityRole="alert" style={S.error}>{error || scopeError}</Text>
      )}

      {!scope && !scopeError || q.isLoading ? (
        <ActivityIndicator color="#7551c8" style={{ marginTop: 24 }} />
      ) : q.isError && !q.data ? (
        <Text style={S.error}>
          {q.error instanceof Error ? q.error.message : "No se pudieron cargar las oportunidades."}
        </Text>
      ) : scope ? (
        <ScrollView horizontal showsHorizontalScrollIndicator
          style={{ flex: 1 }} contentContainerStyle={S.board}>
          {STAGES.map((stage) => {
            const items = visible.filter((deal) => deal.stage === stage);

            return (
              <DropColumn key={stage}
                onOver={() => {
                  if (dragged.current && !busy) setHover(stage);
                }}
                onDrop={() => {
                  const deal = dragged.current;
                  finishDrag();
                  if (deal) changeStage(deal, stage);
                }}>
                <View style={[
                  S.column,
                  hover === stage && S.columnHover,
                  { borderTopColor: COLOR[stage] },
                ]}>
                  <View style={S.columnHeader}>
                    <Text style={S.columnTitle}>{LABEL[stage]}</Text>
                    <Text style={S.count}>{items.length}</Text>
                  </View>

                  <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 16 }}>
                    {items.length === 0 && (
                      <Text style={S.empty}>Sin oportunidades en esta etapa</Text>
                    )}

                    {items.map((deal) => (
                      <DragCard key={deal.id} enabled={!busy}
                        onStart={() => {
                          dragged.current = deal;
                          setMenu(null);
                        }}
                        onEnd={finishDrag}>
                        <View style={S.card}>
                          <Pressable onPress={() => {
                            if (Date.now() - dragEndedAt.current < 350) return;
                            router.push({
                              pathname: "/deals/[id]",
                              params: { id: deal.id },
                            });
                          }}>
                            <Text style={S.cardTitle}>{deal.title}</Text>
                            <Text style={S.customer}>
                              {deal.contact_name || deal.account_name || "Sin cliente vinculado"}
                            </Text>
                          </Pressable>

                          <Text style={S.amount}>
                            {deal.amount == null
                              ? "Monto por definir"
                              : Number(deal.amount).toLocaleString("es-CL")}
                          </Text>
                          <Text style={S.subtle}>
                            Responsable: {deal.assigned_to_name ||
                              (deal.assigned_to ? "Sin nombre" : "Sin asignar")}
                          </Text>
                          {deal.close_date != null && (
                            <Text style={S.subtle}>
                              Cierre previsto: {dateLabel(deal.close_date) || "Revisar fecha"}
                            </Text>
                          )}

                          <Pressable style={S.stageButton} disabled={busy}
                            accessibilityRole="button"
                            onPress={() => setMenu(menu === deal.id ? null : deal.id)}>
                            <Text style={S.stageText}>Cambiar etapa ▾</Text>
                          </Pressable>

                          {menu === deal.id && STAGES.map((target) => (
                            <Pressable key={target} style={S.option}
                              disabled={busy || target === deal.stage}
                              onPress={() => changeStage(deal, target)}>
                              <Text style={S.buttonText}>
                                {target === deal.stage ? "✓ " : ""}{LABEL[target]}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </DragCard>
                    ))}
                  </ScrollView>
                </View>
              </DropColumn>
            );
          })}
        </ScrollView>
      ) : null}

      {scope && q.data && (
        <View style={S.footer}>
          <Text style={S.subtle}>
            {mutation.isPending ? "Guardando etapa…" : `${deals.length} cargadas`}
          </Text>
          {q.hasNextPage && (
            <Pressable style={S.button} disabled={busy}
              onPress={() => { void q.fetchNextPage(); }}>
              <Text style={S.buttonText}>
                {q.isFetchingNextPage ? "Cargando…" : "Cargar más oportunidades"}
              </Text>
            </Pressable>
          )}
          {q.isError && <Text style={S.error}>No se pudo actualizar. Pulsa Actualizar.</Text>}
        </View>
      )}

      <Modal visible={Boolean(closing)} transparent animationType="fade"
        onRequestClose={() => {
          if (!mutation.isPending) setClosing(null);
        }}>
        <View style={S.backdrop}>
          <View style={S.modal}>
            <Text style={S.columnTitle}>
              {closing?.stage === "perdido" ? "Marcar como perdida" : "Confirmar oportunidad ganada"}
            </Text>
            <Text style={S.customer}>{closing?.deal.title}</Text>

            {closing?.stage === "perdido" && (
              <TextInput value={reason} onChangeText={setReason}
                placeholder="¿Por qué se perdió esta negociación?"
                multiline maxLength={2000} editable={!mutation.isPending}
                style={[S.search, { minHeight: 90, flex: undefined }]} />
            )}

            {error && <Text style={S.error}>{error}</Text>}

            <View style={S.toolbar}>
              <Pressable style={S.button} disabled={mutation.isPending}
                onPress={() => { setClosing(null); setError(null); }}>
                <Text style={S.buttonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={S.primary}
                disabled={mutation.isPending ||
                  (closing?.stage === "perdido" && !reason.trim())}
                onPress={() => {
                  if (!closing) return;
                  mutation.mutate({
                    ...closing,
                    lostReason: reason.trim(),
                  });
                }}>
                <Text style={S.primaryText}>
                  {mutation.isPending ? "Guardando…" : "Confirmar cierre"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f6fa", padding: 20, gap: 14 },
  heading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  title: { fontSize: 27, fontWeight: "800", color: "#252a3a" },
  subtle: { color: "#788399", fontSize: 12, lineHeight: 18 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  search: {
    flex: 1, minWidth: 180, backgroundColor: "#fff",
    borderWidth: 1, borderColor: "#dce0eb", borderRadius: 9,
    padding: 12, color: "#252a3a",
  },
  primary: { backgroundColor: "#7551c8", borderRadius: 9, padding: 12 },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  button: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce0eb",
    borderRadius: 9, padding: 11,
  },
  buttonText: { color: "#454d64", fontSize: 12, fontWeight: "600" },
  filters: { flexDirection: "row", gap: 8 },
  chip: {
    padding: 9, borderRadius: 20, borderWidth: 1,
    borderColor: "#dce0eb", backgroundColor: "#fff",
  },
  chipActive: { borderColor: "#7551c8", backgroundColor: "#eee8fb" },
  board: { gap: 14, paddingBottom: 12, alignItems: "stretch" },
  column: {
    width: 280, flex: 1, backgroundColor: "#eceef5",
    borderRadius: 12, borderWidth: 1, borderColor: "#e0e3ed",
    borderTopWidth: 4, padding: 10,
  },
  columnHover: { backgroundColor: "#e9defb", borderColor: "#7551c8" },
  columnHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", padding: 6, marginBottom: 12,
  },
  columnTitle: { color: "#30364a", fontWeight: "800", fontSize: 15 },
  count: {
    backgroundColor: "#fff", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3, color: "#687188",
  },
  empty: { color: "#8992a5", padding: 16, textAlign: "center", fontSize: 12 },
  card: {
    padding: 14, borderRadius: 10, backgroundColor: "#fff",
    borderWidth: 1, borderColor: "#e1e4ee", gap: 8,
  },
  cardTitle: { color: "#30364a", fontWeight: "700", fontSize: 15 },
  customer: { color: "#737f96", marginTop: 4, fontSize: 13 },
  amount: { color: "#3d4560", fontSize: 18, fontWeight: "700" },
  stageButton: { borderTopWidth: 1, borderColor: "#edf0f5", paddingTop: 10 },
  stageText: { color: "#7551c8", fontSize: 12, fontWeight: "700" },
  option: { padding: 9, backgroundColor: "#f7f5fc", borderRadius: 6 },
  error: { color: "#b52b46", fontSize: 13 },
  footer: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  backdrop: {
    flex: 1, backgroundColor: "rgba(20,25,40,0.35)",
    justifyContent: "center", alignItems: "center", padding: 20,
  },
  modal: {
    backgroundColor: "#fff", padding: 22, borderRadius: 14,
    width: "100%", maxWidth: 460, gap: 16,
  },
});