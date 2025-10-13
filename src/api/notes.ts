import { API_BASE } from "@/src/config";
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

const API = API_BASE;

export async function listNotesByDeal(dealId: string): Promise<Note[]> {
  const r = await fetch(`${API}/notes?deal_id=${encodeURIComponent(dealId)}`);
  if (!r.ok) throw new Error("Error listando notas");
  return r.json();
}

export async function createNote(body: Partial<Note>) {
  const r = await fetch(`${API}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Error creando nota");
  return r.json();
}

export async function deleteNote(id: string) {
  const r = await fetch(`${API}/notes/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Error eliminando nota");
  return r.json();
}
