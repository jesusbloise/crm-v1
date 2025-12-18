// src/api/activities.ts
import { api } from "@/src/api/http";

export type ActivityType = "task" | "call" | "meeting" | "note";
export type ActivityStatus = "open" | "done" | "canceled";

export type Activity = {
  id: string;
  type: ActivityType;
  title: string;
  due_date?: number | null;
  remind_at_ms?: number | null;
  status: ActivityStatus;
  notes?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
  lead_id?: string | null;
  deal_id?: string | null;
  created_at: number;
  updated_at: number;

  created_by?: string | null;
  created_by_name?: string | null;
  created_by_email?: string | null;

  assigned_to?: string | null;
  assigned_to_name?: string | null;
  assigned_to_email?: string | null;

  assigned_to_2?: string | null;
  assigned_to_2_name?: string | null;
  assigned_to_2_email?: string | null;
};

export async function listActivities(filters?: {
  deal_id?: string;
  contact_id?: string;
  account_id?: string;
  lead_id?: string;
  status?: ActivityStatus;
  remind_after?: number;
}): Promise<Activity[]> {
  const qs = new URLSearchParams();

  if (filters) {
    if (filters.deal_id) qs.set("deal_id", filters.deal_id);
    if (filters.contact_id) qs.set("contact_id", filters.contact_id);
    if (filters.account_id) qs.set("account_id", filters.account_id);
    if (filters.lead_id) qs.set("lead_id", filters.lead_id);
    if (filters.status) qs.set("status", filters.status);
    if (filters.remind_after != null)
      qs.set("remind_after", String(filters.remind_after));
  }

  const q = qs.toString();
  return api.get(`/activities${q ? `?${q}` : ""}`);
}

export async function getActivity(id: string): Promise<Activity> {
  return api.get(`/activities/${id}`);
}

export async function listActivitiesByDeal(dealId: string): Promise<Activity[]> {
  return listActivities({ deal_id: dealId });
}

/**
 * Crea una actividad.
 * El backend acepta también:
 *  - assigned_to
 *  - assigned_to_2
 */
export async function createActivity(input: Partial<Activity>): Promise<void> {
  await api.post("/activities", input);
}

/** ✅ Patch extra flags (solo backend) */
export type ActivityPatch = Partial<Activity> & {
  notify_assignees?: boolean;
};

export async function updateActivity(id: string, patch: ActivityPatch): Promise<void> {
  await api.patch(`/activities/${id}`, patch);
}

export async function deleteActivity(id: string): Promise<void> {
  await api.delete(`/activities/${id}`);
}

export async function listOpenActivitiesWithReminder(
  nowMs: number
): Promise<
  { id: string; title: string; notes: string | null; remindAtMs: number }[]
> {
  const rows = await listActivities({ status: "open", remind_after: nowMs });
  return rows
    .filter((r) => r.remind_at_ms && r.remind_at_ms > nowMs)
    .map((r) => ({
      id: r.id,
      title: r.title,
      notes: r.notes ?? null,
      remindAtMs: r.remind_at_ms!,
    }));
}


// // src/api/activities.ts
// import { api } from "@/src/api/http";

// export type ActivityType = "task" | "call" | "meeting" | "note";
// export type ActivityStatus = "open" | "done" | "canceled";

// export type Activity = {
//   id: string;
//   type: ActivityType;
//   title: string;
//   due_date?: number | null;
//   remind_at_ms?: number | null;
//   status: ActivityStatus;
//   notes?: string | null;
//   account_id?: string | null;
//   contact_id?: string | null;
//   lead_id?: string | null;
//   deal_id?: string | null;
//   created_at: number;
//   updated_at: number;

//   /** 👉 quién la creó (id de usuario) */
//   created_by?: string | null;

//   /** 👉 info del creador (nombre/email) */
//   created_by_name?: string | null;
//   created_by_email?: string | null;

//   /** 👉 PRIMER responsable */
//   assigned_to?: string | null;
//   assigned_to_name?: string | null;
//   assigned_to_email?: string | null;

//   /** 👉 SEGUNDO responsable (nuevo campo en la tabla) */
//   assigned_to_2?: string | null;
//   assigned_to_2_name?: string | null;
//   assigned_to_2_email?: string | null;
// };

// export async function listActivities(filters?: {
//   deal_id?: string;
//   contact_id?: string;
//   account_id?: string;
//   lead_id?: string;
//   status?: ActivityStatus;
//   remind_after?: number;
// }): Promise<Activity[]> {
//   const qs = new URLSearchParams();

//   if (filters) {
//     if (filters.deal_id) qs.set("deal_id", filters.deal_id);
//     if (filters.contact_id) qs.set("contact_id", filters.contact_id);
//     if (filters.account_id) qs.set("account_id", filters.account_id);
//     if (filters.lead_id) qs.set("lead_id", filters.lead_id);
//     if (filters.status) qs.set("status", filters.status);
//     if (filters.remind_after != null)
//       qs.set("remind_after", String(filters.remind_after));
//   }

//   const q = qs.toString();
//   return api.get(`/activities${q ? `?${q}` : ""}`);
// }

// export async function getActivity(id: string): Promise<Activity> {
//   return api.get(`/activities/${id}`);
// }

// export async function listActivitiesByDeal(dealId: string): Promise<Activity[]> {
//   return listActivities({ deal_id: dealId });
// }

// /**
//  * Crea una actividad.
//  * El backend acepta también:
//  *  - assigned_to
//  *  - assigned_to_2
//  */
// export async function createActivity(input: Partial<Activity>): Promise<void> {
//   await api.post("/activities", input);
// }

// export async function updateActivity(
//   id: string,
//   patch: Partial<Activity>
// ): Promise<void> {
//   await api.patch(`/activities/${id}`, patch);
// }

// export async function deleteActivity(id: string): Promise<void> {
//   await api.delete(`/activities/${id}`);
// }

// export async function listOpenActivitiesWithReminder(
//   nowMs: number
// ): Promise<
//   { id: string; title: string; notes: string | null; remindAtMs: number }[]
// > {
//   const rows = await listActivities({ status: "open", remind_after: nowMs });
//   return rows
//     .filter((r) => r.remind_at_ms && r.remind_at_ms > nowMs)
//     .map((r) => ({
//       id: r.id,
//       title: r.title,
//       notes: r.notes ?? null,
//       remindAtMs: r.remind_at_ms!,
//     }));
// }

