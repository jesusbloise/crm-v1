// src/api/notes.ts
import { api } from "@/src/api";

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
  await api.del(`/notes/${id}`);
}

// import { API_BASE } from "@/src/config";

// export type Note = {
//   id: string;
//   body: string;
//   account_id?: string | null;
//   contact_id?: string | null;
//   lead_id?: string | null;
//   deal_id?: string | null;
//   created_at: number;
//   updated_at: number;
// };

// const API = API_BASE;

// async function safeFetch(input: RequestInfo, init?: RequestInit) {
//   const r = await fetch(input, {
//     keepalive: true,
//     ...init,
//     headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
//   });
//   if (!r.ok) {
//     let msg = `HTTP ${r.status}`;
//     try {
//       const data = await r.json();
//       msg = typeof (data as any)?.error === "string" ? (data as any).error : msg;
//     } catch {
//       try {
//         msg = await r.text();
//       } catch {}
//     }
//     throw new Error(msg || "Network error");
//   }
//   try {
//     return await r.json();
//   } catch {
//     return null as unknown as any;
//   }
// }

// /** Lista notas con filtros opcionales */
// export async function listNotes(params?: {
//   deal_id?: string;
//   contact_id?: string;
//   account_id?: string;
//   lead_id?: string;
// }): Promise<Note[]> {
//   const qs = new URLSearchParams();
//   if (params?.deal_id) qs.set("deal_id", params.deal_id);
//   if (params?.contact_id) qs.set("contact_id", params.contact_id);
//   if (params?.account_id) qs.set("account_id", params.account_id);
//   if (params?.lead_id) qs.set("lead_id", params.lead_id);

//   const url = `${API}/notes${qs.toString() ? `?${qs.toString()}` : ""}`;
//   return safeFetch(url);
// }

// /** Atajo: lista notas por deal */
// export function listNotesByDeal(dealId: string): Promise<Note[]> {
//   return listNotes({ deal_id: dealId });
// }

// /** Crea una nota */
// export function createNote(body: Partial<Note>) {
//   return safeFetch(`${API}/notes`, {
//     method: "POST",
//     body: JSON.stringify(body),
//   });
// }

// /** Elimina una nota */
// export function deleteNote(id: string) {
//   return safeFetch(`${API}/notes/${encodeURIComponent(id)}`, {
//     method: "DELETE",
//   });
// }


// import { API_BASE } from "@/src/config";
// export type Note = {
//   id: string;
//   body: string;
//   account_id?: string | null;
//   contact_id?: string | null;
//   lead_id?: string | null;
//   deal_id?: string | null;
//   created_at: number;
//   updated_at: number;
// };

// const API = API_BASE;

// export async function listNotesByDeal(dealId: string): Promise<Note[]> {
//   const r = await fetch(`${API}/notes?deal_id=${encodeURIComponent(dealId)}`);
//   if (!r.ok) throw new Error("Error listando notas");
//   return r.json();
// }

// export async function createNote(body: Partial<Note>) {
//   const r = await fetch(`${API}/notes`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(body),
//   });
//   if (!r.ok) throw new Error("Error creando nota");
//   return r.json();
// }

// export async function deleteNote(id: string) {
//   const r = await fetch(`${API}/notes/${id}`, { method: "DELETE" });
//   if (!r.ok) throw new Error("Error eliminando nota");
//   return r.json();
// }
