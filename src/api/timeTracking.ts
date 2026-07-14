import { api } from "@/src/api/http";

export type WorkItem = {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  is_active: number;
  created_by?: string | null;
  created_at: number;
  updated_at: number;
};

export type WorkProject = {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  client_name?: string | null;
  is_active: number;
  created_by?: string | null;
  created_at: number;
  updated_at: number;
};

export type TimeEntry = {
  id: string;
  tenant_id: string;
  user_id: string;
  project_id: string;
  project_name: string;
  item_id: string;
  item_name: string;
  work_date: string;
  hours: string | number;
  description?: string | null;
  created_by?: string | null;
  created_at: number;
  updated_at: number;
  user_name?: string | null;
  user_email?: string | null;
};

export type TimeEntriesResponse = {
  rows: TimeEntry[];
  total: number;
  total_hours: number;
};

export type CreateWorkItemInput = {
  name: string;
  description?: string | null;
};

export type UpdateWorkItemInput = {
  name?: string;
  description?: string | null;
  is_active?: number | boolean;
};

export type CreateWorkProjectInput = {
  name: string;
  description?: string | null;
  client_name?: string | null;
};

export type UpdateWorkProjectInput = {
  name?: string;
  description?: string | null;
  client_name?: string | null;
  is_active?: number | boolean;
};

export type CreateTimeEntryInput = {
  project_id: string;
  item_id: string;
  work_date: string;
  hours: number;
  description?: string | null;
};

export type TimeEntryFilters = {
  userId?: string;
  projectId?: string;
  itemId?: string;
  from?: string;
  to?: string;
};

/* =========================
   Work Items
   ========================= */

export async function listWorkItems(params?: {
  includeInactive?: boolean;
}): Promise<WorkItem[]> {
  const qs = new URLSearchParams();

  if (params?.includeInactive) {
    qs.set("includeInactive", "1");
  }

  const q = qs.toString();
  return api.get(q ? `/work-items?${q}` : "/work-items");
}

export async function createWorkItem(
  input: CreateWorkItemInput
): Promise<{ ok: boolean; message: string; work_item: WorkItem }> {
  return api.post("/work-items", input);
}

export async function updateWorkItem(
  id: string,
  patch: UpdateWorkItemInput
): Promise<{ ok: boolean; message: string; work_item: WorkItem }> {
  return api.patch(`/work-items/${id}`, patch);
}

/* =========================
   Work Projects
   ========================= */

export async function listWorkProjects(params?: {
  includeInactive?: boolean;
}): Promise<WorkProject[]> {
  const qs = new URLSearchParams();

  if (params?.includeInactive) {
    qs.set("includeInactive", "1");
  }

  const q = qs.toString();
  return api.get(q ? `/work-projects?${q}` : "/work-projects");
}

export async function createWorkProject(
  input: CreateWorkProjectInput
): Promise<{ ok: boolean; message: string; work_project: WorkProject }> {
  return api.post("/work-projects", input);
}

export async function updateWorkProject(
  id: string,
  patch: UpdateWorkProjectInput
): Promise<{ ok: boolean; message: string; work_project: WorkProject }> {
  return api.patch(`/work-projects/${id}`, patch);
}

/* =========================
   Time Entries
   ========================= */

function buildTimeEntryQuery(filters?: TimeEntryFilters) {
  const qs = new URLSearchParams();

  if (filters?.userId) qs.set("userId", filters.userId);
  if (filters?.projectId) qs.set("projectId", filters.projectId);
  if (filters?.itemId) qs.set("itemId", filters.itemId);
  if (filters?.from) qs.set("from", filters.from);
  if (filters?.to) qs.set("to", filters.to);

  return qs.toString();
}

export async function listTimeEntries(
  filters?: TimeEntryFilters
): Promise<TimeEntriesResponse> {
  const q = buildTimeEntryQuery(filters);
  return api.get(q ? `/time-entries?${q}` : "/time-entries");
}

export async function listMyTimeEntries(): Promise<TimeEntriesResponse> {
  return api.get("/time-entries/mine");
}

export async function createTimeEntry(
  input: CreateTimeEntryInput
): Promise<{ ok: boolean; message: string; time_entry: TimeEntry }> {
  return api.post("/time-entries", input);
}

export async function deleteTimeEntry(
  id: string
): Promise<{ ok: boolean; deleted: TimeEntry }> {
  return api.delete(`/time-entries/${id}`);
}
