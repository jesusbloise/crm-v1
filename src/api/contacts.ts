// src/api/contacts.ts
import { api } from "@/src/api/http";

export type ClientType = "productora" | "agencia" | "directo" | null;

export type Contact = {
  id: string;
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
};

/* =========================
   Listado / CRUD existente
   ========================= */

export async function listContacts(params?: {
  /** si lo pasas explícito, se envía. si no, NO se manda y el server devuelve todo */
  limit?: number;
  workspaceId?: string;
}): Promise<Contact[]> {
  const workspaceId = params?.workspaceId?.trim();

  const qs = new URLSearchParams();

  // ✅ NO default a 100.
  // ✅ Solo envía limit si viene explícito (y es válido).
  if (typeof params?.limit === "number" && Number.isFinite(params.limit) && params.limit > 0) {
    qs.set("limit", String(params.limit));
  }

  if (workspaceId) qs.set("workspaceId", workspaceId);

  const q = qs.toString();
  return api.get(q ? `/contacts?${q}` : "/contacts");
}

// 👇 vista admin (todos los tenants)
export async function listAllContacts(): Promise<Contact[]> {
  return api.get("/contacts-all");
}

export async function getContact(id: string): Promise<Contact> {
  return api.get(`/contacts/${id}`);
}

export async function createContact(
  input: Omit<Contact, "created_at" | "updated_at">
): Promise<void> {
  await api.post("/contacts", input);
}

export async function updateContact(
  id: string,
  patch: Partial<Contact>
): Promise<void> {
  await api.patch(`/contacts/${id}`, patch);
}

export async function deleteContact(id: string): Promise<void> {
  await api.delete(`/contacts/${id}`);
}

/* =========================
   🚀 IMPORTAR CONTACTOS CSV
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
  return api.post("/contacts/import", { rows });
}

