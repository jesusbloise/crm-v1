import { api } from "@/src/api/http";

export type WorkAssignmentStatus = "assigned" | "done" | "cancelled";

export type WorkAssignment = {
  id: string;
  tenant_id: string;

  assigned_user_id: string;
  assigned_user_name?: string | null;
  assigned_user_email?: string | null;

  project_id: string;
  project_name: string;

  item_id: string;
  item_name: string;

  assignment_date: string;
  start_time?: string | null;
  end_time?: string | null;
  estimated_hours: string | number;

  description?: string | null;
  status: WorkAssignmentStatus;

  created_by?: string | null;
  created_by_name?: string | null;
  created_by_email?: string | null;

  created_at: number;
  updated_at: number;

  google_event_id?: string | null;
  email_sent_at?: number | null;
};

export type WorkAssignmentsResponse = {
  rows: WorkAssignment[];
  total: number;
  total_hours: number;
};

export type WorkAssignmentFilters = {
  userId?: string;
  projectId?: string;
  itemId?: string;
  from?: string;
  to?: string;
  status?: WorkAssignmentStatus;
};

export type CreateWorkAssignmentInput = {
  assigned_user_id: string;
  project_id: string;
  item_id: string;
  assignment_date: string;
  start_time?: string | null;
  end_time?: string | null;
  estimated_hours: number | string;
  description?: string | null;
};

export type UpdateWorkAssignmentInput = {
  assignment_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  estimated_hours?: number | string;
  description?: string | null;
  status?: WorkAssignmentStatus;
};



export async function listWorkAssignments(
  filters?: WorkAssignmentFilters
): Promise<WorkAssignmentsResponse> {
  return api.getp<WorkAssignmentsResponse>("/work-assignments", filters);
}

export async function listMyWorkAssignments(): Promise<WorkAssignmentsResponse> {
  return api.get<WorkAssignmentsResponse>("/work-assignments/mine");
}

export async function createWorkAssignment(
  input: CreateWorkAssignmentInput
): Promise<WorkAssignment> {
  return api.post<WorkAssignment>("/work-assignments", input);
}

export async function updateWorkAssignment(
  id: string,
  patch: UpdateWorkAssignmentInput
): Promise<WorkAssignment> {
  return api.patch<WorkAssignment>(`/work-assignments/${id}`, patch);
}

export async function deleteWorkAssignment(id: string): Promise<{ ok: boolean }> {
  return api.delete<{ ok: boolean }>(`/work-assignments/${id}`);
}