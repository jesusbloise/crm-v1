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

/** Fetch con mejores mensajes de error (no cambia el contrato del server) */
async function safeFetch(input: RequestInfo, init?: RequestInit) {
  const r = await fetch(input, {
    // evita problemas de CORS en web y cuelgues en móviles
    keepalive: true,
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const data = await r.json();
      msg = typeof data?.error === "string" ? data.error : msg;
    } catch {
      try {
        msg = await r.text();
      } catch {}
    }
    throw new Error(msg || "Network error");
  }
  // algunos DELETE devuelven {ok:true}
  try {
    return await r.json();
  } catch {
    return null as unknown as any;
  }
}

/** Lista actividades con filtros opcionales */
export async function listActivities(params?: {
  deal_id?: string;
  contact_id?: string;
  account_id?: string;
  lead_id?: string;
  status?: "open" | "done" | "canceled";
}): Promise<Activity[]> {
  const qs = new URLSearchParams();
  if (params?.deal_id) qs.set("deal_id", params.deal_id);
  if (params?.contact_id) qs.set("contact_id", params.contact_id);
  if (params?.account_id) qs.set("account_id", params.account_id);
  if (params?.lead_id) qs.set("lead_id", params.lead_id);
  if (params?.status) qs.set("status", params.status);

  const url = `${API}/activities${qs.toString() ? `?${qs.toString()}` : ""}`;
  return safeFetch(url);
}

/** Atajo: lista por deal */
export function listActivitiesByDeal(dealId: string): Promise<Activity[]> {
  return listActivities({ deal_id: dealId });
}

/** Crea actividad (respetando el contrato del server) */
export async function createActivity(body: Partial<Activity>) {
  return safeFetch(`${API}/activities`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Actualiza actividad por id */
export async function updateActivity(id: string, body: Partial<Activity>) {
  return safeFetch(`${API}/activities/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Borra actividad por id */
export async function deleteActivity(id: string) {
  return safeFetch(`${API}/activities/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Helper opcional: alterna open/done (útil para botones) */
export async function toggleActivityStatus(a: Activity) {
  const next = a.status === "open" ? "done" : "open";
  return updateActivity(a.id, { status: next });
}


// import { API_BASE } from "@/src/config";
// export type Activity = {
//   id: string;
//   type: "task" | "call" | "meeting";
//   title: string;
//   due_date?: number | null;
//   status: "open" | "done" | "canceled";
//   notes?: string | null;
//   account_id?: string | null;
//   contact_id?: string | null;
//   lead_id?: string | null;
//   deal_id?: string | null;
//   created_at: number;
//   updated_at: number;
// };

// const API = API_BASE;

// export async function listActivitiesByDeal(dealId: string): Promise<Activity[]> {
//   const r = await fetch(`${API}/activities?deal_id=${encodeURIComponent(dealId)}`);
//   if (!r.ok) throw new Error("Error listando actividades");
//   return r.json();
// }

// export async function createActivity(body: Partial<Activity>) {
//   const r = await fetch(`${API}/activities`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(body),
//   });
//   if (!r.ok) throw new Error("Error creando actividad");
//   return r.json();
// }

// export async function updateActivity(id: string, body: Partial<Activity>) {
//   const r = await fetch(`${API}/activities/${id}`, {
//     method: "PATCH",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(body),
//   });
//   if (!r.ok) throw new Error("Error actualizando actividad");
//   return r.json();
// }

// export async function deleteActivity(id: string) {
//   const r = await fetch(`${API}/activities/${id}`, { method: "DELETE" });
//   if (!r.ok) throw new Error("Error eliminando actividad");
//   return r.json();
// }
