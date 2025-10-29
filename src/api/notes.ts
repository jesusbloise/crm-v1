// src/api/notes.ts
import { api } from "@/src/api/http";

export type Note = {
  id: string;
  body: string;
  account_id?: string | null;
  contact_id?: string | null;
  lead_id?: string | null;
  deal_id?: string | null;
  created_at: number;
  updated_at: number;
};

/** Lista genérica con filtros opcionales. */
export async function listNotes(filters?: {
  deal_id?: string;
  contact_id?: string;
  account_id?: string;
  lead_id?: string;
}): Promise<Note[]> {
  const qs = new URLSearchParams();
  if (filters?.deal_id) qs.set("deal_id", filters.deal_id);
  if (filters?.contact_id) qs.set("contact_id", filters.contact_id);
  if (filters?.account_id) qs.set("account_id", filters.account_id);
  if (filters?.lead_id) qs.set("lead_id", filters.lead_id);
  const q = qs.toString();
  return api.get(`/notes${q ? `?${q}` : ""}`);
}

/** Atajos por entidad (compatibles con tu UI actual). */
export async function listNotesByDeal(dealId: string): Promise<Note[]> {
  return listNotes({ deal_id: dealId });
}

/** Detalle de una nota */
export async function getNote(id: string): Promise<Note> {
  return api.get(`/notes/${id}`);
}

/** Crear */
export async function createNote(
  input: Omit<Note, "created_at" | "updated_at">
): Promise<void> {
  await api.post("/notes", input);
}

/** Editar (parcial) */
export async function updateNote(
  id: string,
  patch: Partial<Note>
): Promise<void> {
  await api.patch(`/notes/${id}`, patch);
}

/** Eliminar */
export async function deleteNote(id: string): Promise<void> {
  await api.delete(`/notes/${id}`);
}
