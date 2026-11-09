// src/api/dealDocuments.ts
import { authHeaders } from "@/src/api/auth";
import { api, ApiError } from "@/src/api/http";
import { getBaseURL } from "@/src/config/baseUrl";

export type DealDocument = {
  id: string;
  deal_id: string;
  original_name: string;
  extension: string;
  byte_size: number;
  version: number;
  is_current: boolean;
  quoted_amount: number | string | null;
  uploaded_by_name?: string | null;
  created_at: number | string;
};

function basePath(dealId: string) {
  return `/deals/${encodeURIComponent(dealId)}/documents`;
}

export function listDealDocuments(dealId: string) {
  return api.get<DealDocument[]>(basePath(dealId));
}

export function uploadDealDocument(
  dealId: string,
  id: string,
  file: File,
  amount: number | null
) {
  const form = new FormData();
  form.append("id", id);
  if (amount !== null) form.append("quoted_amount", String(amount));
  form.append("file", file);

  return api.post<DealDocument>(basePath(dealId), form, {
    timeoutMs: 60000,
  });
}

export function setCurrentDealDocument(dealId: string, documentId: string) {
  return api.patch<DealDocument>(
    `${basePath(dealId)}/${encodeURIComponent(documentId)}/current`,
    {}
  );
}

/**
 * Descarga con Authorization y workspace.
 * El archivo solo se entrega al navegador después de comprobar la sesión.
 */
export async function fetchDealDocument(
  dealId: string,
  documentId: string
): Promise<Blob> {
  const path =
    `${basePath(dealId)}/${encodeURIComponent(documentId)}/download`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const headers = await authHeaders({});
    const response = await fetch(
      `${getBaseURL().replace(/\/$/, "")}${path}`,
      { headers, signal: controller.signal }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => null);

      throw new ApiError(
        body?.message || "No se pudo descargar el documento.",
        { status: response.status, code: body?.error }
      );
    }

    return await response.blob();
  } finally {
    clearTimeout(timer);
  }
}
export function deleteDealDocument(
  dealId: string,
  documentId: string
) {
  return api.delete<{ ok: boolean }>(
    `${basePath(dealId)}/${encodeURIComponent(documentId)}`
  );
}