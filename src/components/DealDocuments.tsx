// src/components/DealDocuments.tsx
import { getAuthStorageScope } from "@/src/api/auth";
import {
    deleteDealDocument,
    fetchDealDocument,
    listDealDocuments,
    setCurrentDealDocument,
    uploadDealDocument
} from "@/src/api/dealDocuments";
import { uid } from "@/src/utils/uid";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useRef, useState } from "react";
import {
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

type PendingFile = {
  id: string;
  file: File;
  amount: number | null;
};

export default function DealDocuments({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const working = useRef(false);

  useEffect(() => {
    let active = true;
    setScope(null);
    setPending(null);
    setError(null);
    setNotice(null);

    getAuthStorageScope()
      .then((current) => {
        if (!active) return;
        if (!current) throw new Error("Vuelve a iniciar sesión.");
        setScope(current.storageKey);
      })
      .catch((err) => {
        if (active) setError(String(err?.message || err));
      });

    return () => { active = false; };
  }, [dealId]);

  async function assertScope() {
    const current = await getAuthStorageScope();

    if (!scope || current?.storageKey !== scope) {
      throw new Error("Cambió la sesión o el workspace. Reabre la oportunidad.");
    }
  }

  const key = ["deal-documents", scope, dealId];

  const q = useQuery({
    queryKey: key,
    enabled: Boolean(scope),
    queryFn: async () => {
      await assertScope();
      const rows = await listDealDocuments(dealId);
      await assertScope();
      return rows;
    },
    retry: false,
  });

  async function perform(action: () => Promise<void>) {
    if (working.current) return;

    working.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await assertScope();
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la operación.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function selectFile() {
    await perform(async () => {
      const amount = amountText.trim() ? Number(amountText) : null;

      if (
        amount !== null &&
        (!/^\d+$/.test(amountText.trim()) || !Number.isSafeInteger(amount))
      ) {
        throw new Error("Escribe el importe sin puntos ni comas, o déjalo vacío.");
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;
      await assertScope();

      const asset = result.assets[0];
      const file = asset.file;

      if (!file) throw new Error("No se pudo leer el archivo seleccionado.");
      if (!file.size || file.size > 10 * 1024 * 1024) {
        throw new Error("El archivo debe tener contenido y pesar como máximo 10 MB.");
      }

      setPending({ id: uid(), file, amount });
    });
  }

  async function upload() {
    if (!pending) return;
    const selected = pending;

    await perform(async () => {
      await uploadDealDocument(
        dealId, selected.id, selected.file, selected.amount
      );
      await assertScope();

      setPending(null);
      setAmountText("");
      setNotice("Presupuesto adjuntado como versión vigente.");
      await qc.invalidateQueries({ queryKey: key });
    });
  }

  const web = Platform.OS === "web";

  return (
    <View style={S.box}>
      <Text style={S.title}>Presupuestos y documentos</Text>
      <Text style={S.subtle}>
        PDF, Word o Excel · Máximo 10 MB por archivo.
        Cada carga conserva las versiones anteriores.
      </Text>

      {web ? (
        <>
          <Text style={S.label}>Importe de esta versión, opcional</Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            editable={!busy && !pending}
            keyboardType="numeric"
            placeholder="Sin puntos ni comas"
            style={S.input}
          />
          <Text style={S.subtle}>
            Es un importe declarado: no se extrae del archivo ni modifica
            automáticamente el monto de la oportunidad.
          </Text>

          {pending ? (
            <View style={S.selected}>
              <Text style={S.label}>{pending.file.name}</Text>
              <Text style={S.subtle}>
                {(pending.file.size / 1024).toFixed(0)} KB
              </Text>
              <View style={S.actions}>
                <Pressable disabled={busy} style={S.primary} onPress={upload}>
                  <Text style={S.white}>{busy ? "Procesando…" : "Subir versión"}</Text>
                </Pressable>
                <Pressable disabled={busy} style={S.button}
                  onPress={() => setPending(null)}>
                  <Text style={S.link}>Quitar selección</Text>
                </Pressable>
              </View>
              <Text style={S.subtle}>
                Si falla la conexión, reintenta con esta selección para evitar
                duplicar la versión.
              </Text>
            </View>
          ) : (
            <Pressable disabled={busy || !scope} style={S.primary}
              onPress={selectFile}>
              <Text style={S.white}>＋ Seleccionar presupuesto</Text>
            </Pressable>
          )}
        </>
      ) : (
        <Text style={S.subtle}>
          La carga y descarga están disponibles desde el navegador del CRM.
        </Text>
      )}

      {!!error && <Text accessibilityRole="alert" style={S.error}>{error}</Text>}
      {!!notice && <Text style={S.success}>{notice}</Text>}

      {q.isLoading ? (
        <Text style={S.subtle}>Cargando documentos…</Text>
      ) : q.isError ? (
        <Pressable onPress={() => { void q.refetch(); }}>
          <Text style={S.error}>No se pudieron cargar. Reintentar</Text>
        </Pressable>
      ) : (
        (q.data ?? []).map((item) => (
          <View key={item.id} style={S.document}>
            <Text style={S.label}>
              Versión {item.version}{item.is_current ? " · Vigente" : ""}
            </Text>
            <Text style={S.name}>{item.original_name}</Text>
            <Text style={S.subtle}>
              {new Date(Number(item.created_at)).toLocaleString("es-CL")}
              {item.uploaded_by_name ? ` · ${item.uploaded_by_name}` : ""}
            </Text>
            {item.quoted_amount !== null && (
              <Text style={S.subtle}>
                Importe declarado: {Number(item.quoted_amount).toLocaleString("es-CL")}
              </Text>
            )}

            <View style={S.actions}>
              {web && (
                <Pressable disabled={busy} style={S.button}
                  onPress={() => perform(async () => {
                    const blob = await fetchDealDocument(dealId, item.id);
                    await assertScope();

                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = item.original_name;
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                  })}>
                  <Text style={S.link}>Descargar</Text>
                </Pressable>
              )}
              {web && (
  <Pressable
    disabled={busy}
    style={S.button}
    onPress={() => {
      const confirmed = window.confirm(
        `¿Eliminar definitivamente "${item.original_name}"?\n\n` +
        "Esta acción no se puede deshacer." +
        (item.is_current
          ? "\nLa oportunidad quedará sin presupuesto vigente."
          : "")
      );

      if (!confirmed) return;

      void perform(async () => {
        await deleteDealDocument(dealId, item.id);
        await assertScope();
        await qc.invalidateQueries({ queryKey: key });
        setNotice("Archivo eliminado.");
      });
    }}
  >
    <Text style={S.error}>Eliminar archivo</Text>
  </Pressable>
)}
              {!item.is_current && (
                <Pressable disabled={busy} style={S.button}
                  onPress={() => perform(async () => {
                    await setCurrentDealDocument(dealId, item.id);
                    await assertScope();
                    await qc.invalidateQueries({ queryKey: key });
                    setNotice("Se actualizó el presupuesto vigente.");
                  })}>
                  <Text style={S.link}>Marcar vigente</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))
      )}

      {q.isSuccess && q.data.length === 0 && (
        <Text style={S.subtle}>Todavía no hay presupuestos adjuntos.</Text>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  box: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#e0e4ed",
    borderRadius: 12, padding: 18, gap: 12,
  },
  title: { color: "#30364a", fontWeight: "800", fontSize: 17 },
  label: { color: "#30364a", fontWeight: "700", fontSize: 13 },
  name: { color: "#454d64", fontSize: 14 },
  subtle: { color: "#788399", fontSize: 12, lineHeight: 19 },
  input: {
    borderWidth: 1, borderColor: "#dce0eb", borderRadius: 9,
    padding: 12, color: "#252a3a",
  },
  selected: { backgroundColor: "#f7f4fc", borderRadius: 9, padding: 12, gap: 8 },
  document: { borderTopWidth: 1, borderColor: "#e7eaf1", paddingTop: 14, gap: 7 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  primary: { alignSelf: "flex-start", backgroundColor: "#7551c8", padding: 12, borderRadius: 9 },
  white: { color: "#fff", fontWeight: "700", fontSize: 13 },
  button: { padding: 10, borderWidth: 1, borderColor: "#e0e4ed", borderRadius: 8 },
  link: { color: "#7551c8", fontSize: 13, fontWeight: "700" },
  error: { color: "#b52b46", fontSize: 13 },
  success: { color: "#21845e", fontSize: 13 },
});