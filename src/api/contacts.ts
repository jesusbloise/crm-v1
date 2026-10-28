// src/api/contacts.ts
import { authFetch } from "@/src/api/auth";
import { api } from "@/src/api/http";

export type ClientType =
  | "productora"
  | "agencia"
  | "directo"
  | "proveedor"
  | null;

export type ContactVisibility =
  | "private"
  | "workspace"
  | "selected";

export type SharingSelection = {
  visibility: ContactVisibility | null;
  shared_user_ids: string[];
};

export type Contact = {
  id: string;
  tenant_id?: string;

  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  position?: string | null;
  client_type?: ClientType;
  account_id?: string | null;

  created_by?: string;
  created_by_name?: string;
  created_by_email?: string;

  created_at: number;
  updated_at: number;

  visibility?: ContactVisibility;
  shared_user_ids?: string[];
  can_manage_sharing?: boolean;
};

/* =========================
   Listado
========================= */

export async function listContacts(params?: {
  limit?: number;
  workspaceId?: string;
}): Promise<Contact[]> {
  const query = new URLSearchParams();

  if (
    typeof params?.limit === "number" &&
    Number.isFinite(params.limit) &&
    params.limit > 0
  ) {
    query.set("limit", String(params.limit));
  }

  const workspaceId = params?.workspaceId?.trim();

  if (workspaceId) {
    query.set("workspaceId", workspaceId);
  }

  const queryString = query.toString();

  return api.get<Contact[]>(
    queryString ? `/contacts?${queryString}` : "/contacts"
  );
}

/**
 * Contactos visibles del workspace activo.
 * El backend aplica los permisos de privacidad.
 */
export async function listAllContacts(): Promise<Contact[]> {
  return api.get<Contact[]>("/contacts-all");
}

/* =========================
   CRUD
========================= */

export async function getContact(id: string): Promise<Contact> {
  return api.get<Contact>(
    `/contacts/${encodeURIComponent(id)}`
  );
}

/**
 * Si se indica tenantId, crea el contacto en ese workspace
 * sin cambiar la sesión ni el workspace activo.
 */
export async function createContact(
  input: Omit<Contact, "created_at" | "updated_at">,
  tenantId?: string
): Promise<void> {
  if (tenantId) {
    await authFetch("/contacts", {
      method: "POST",
      headers: {
        "X-Tenant-Id": tenantId,
      },
      body: JSON.stringify(input),
    });

    return;
  }

  await api.post("/contacts", input);
}

export async function updateContact(
  id: string,
  patch: Partial<Contact>
): Promise<void> {
  await api.patch(
    `/contacts/${encodeURIComponent(id)}`,
    patch
  );
}

export async function deleteContact(id: string): Promise<void> {
  await api.delete(
    `/contacts/${encodeURIComponent(id)}`
  );
}

/* =========================
   Importación CSV
========================= */

export type ImportContactRow = {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  position?: string;
  client_type?: ClientType;
  account_id?: string;
};

export type ImportContactsResult = {
  ok: boolean;
  received: number;
  created: number;
  skipped: number;
  errors: number;

  items: Array<{
    index: number;
    ok: boolean;
    id?: string;
    name?: string;
    email?: string;
    reason?: string;
    message?: string;
  }>;
};

export async function importContacts(
  rows: ImportContactRow[]
): Promise<ImportContactsResult> {
  return api.post<ImportContactsResult>(
    "/contacts/import",
    { rows }
  );
}