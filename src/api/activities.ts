import { API_BASE } from "@/src/config";
export type Activity = {
  id: string;
  type: "task" | "call" | "meeting";
  title: string;
  due_date?: number | null;
  status: "open" | "done" | "canceled";
  notes?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
  lead_id?: string | null;
  deal_id?: string | null;
  created_at: number;
  updated_at: number;
};

const API = API_BASE;

export async function listActivitiesByDeal(dealId: string): Promise<Activity[]> {
  const r = await fetch(`${API}/activities?deal_id=${encodeURIComponent(dealId)}`);
  if (!r.ok) throw new Error("Error listando actividades");
  return r.json();
}

export async function createActivity(body: Partial<Activity>) {
  const r = await fetch(`${API}/activities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Error creando actividad");
  return r.json();
}

export async function updateActivity(id: string, body: Partial<Activity>) {
  const r = await fetch(`${API}/activities/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Error actualizando actividad");
  return r.json();
}

export async function deleteActivity(id: string) {
  const r = await fetch(`${API}/activities/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Error eliminando actividad");
  return r.json();
}
