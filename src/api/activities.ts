import { api } from "@/src/api/http";

export type ActivityType = "task" | "call" | "meeting" | "note";

export type ActivityStatus =
  | "open"
  | "in_progress"
  | "done"
  | "canceled";

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
  completed_at?: number | string | null;

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
  const params = new URLSearchParams();

  if (filters) {
    if (filters.deal_id) params.set("deal_id", filters.deal_id);
    if (filters.contact_id) params.set("contact_id", filters.contact_id);
    if (filters.account_id) params.set("account_id", filters.account_id);
    if (filters.lead_id) params.set("lead_id", filters.lead_id);
    if (filters.status) params.set("status", filters.status);

    if (filters.remind_after != null) {
      params.set("remind_after", String(filters.remind_after));
    }
  }

  const query = params.toString();

  return api.get<Activity[]>(
    `/activities${query ? `?${query}` : ""}`
  );
}

export async function getActivity(id: string): Promise<Activity> {
  return api.get<Activity>(`/activities/${id}`);
}

export async function listActivitiesByDeal(
  dealId: string
): Promise<Activity[]> {
  return listActivities({ deal_id: dealId });
}

export async function createActivity(
  input: Partial<Activity>
): Promise<Activity> {
  return api.post("/activities", input);
}

export type ActivityPatch = Partial<Activity> & {
  notify_assignees?: boolean;
};

export async function updateActivity(
  id: string,
  patch: ActivityPatch
): Promise<void> {
  await api.patch(`/activities/${id}`, patch);
}

export async function deleteActivity(id: string): Promise<void> {
  await api.delete(`/activities/${id}`);
}

export async function listOpenActivitiesWithReminder(
  nowMs: number
): Promise<
  {
    id: string;
    title: string;
    notes: string | null;
    remindAtMs: number;
  }[]
> {
  const rows = await listActivities({
    status: "open",
    remind_after: nowMs,
  });

  return rows.flatMap((activity) => {
    const remindAtMs = Number(activity.remind_at_ms);

    if (
      activity.status !== "open" ||
      !Number.isFinite(remindAtMs) ||
      remindAtMs <= nowMs
    ) {
      return [];
    }

    return [
      {
        id: activity.id,
        title: activity.title,
        notes: activity.notes ?? null,
        remindAtMs,
      },
    ];
  });
}

export async function updateActivityStatus(
  id: string,
  status: ActivityStatus,
  expectedUpdatedAt: number
): Promise<Activity> {
  return api.patch<Activity>(
    `/activities/${encodeURIComponent(id)}/status`,
    {
      status,
      expected_updated_at: expectedUpdatedAt,
    }
  );
}

export type ActivityPageFilters = {
  deal_id?: string;
  contact_id?: string;
  account_id?: string;
  lead_id?: string;
  status?: ActivityStatus;

  scope?: "team" | "mine";
  q?: string;
  person_id?: string;

  due_from?: number;
  due_before?: number;
  undated?: boolean;
  pending?: boolean;

  sort?: "updated" | "due";
  limit?: number;
  offset?: number;
};

export type ActivityPage = {
  items: Activity[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export async function listActivitiesPage(
  filters: ActivityPageFilters = {}
): Promise<ActivityPage> {
  const params = new URLSearchParams({
    paginated: "1",
  });

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;

    if (typeof value === "boolean") {
      if (value) params.set(key, "1");
    } else {
      params.set(key, String(value));
    }
  }

  return api.get<ActivityPage>(
    `/activities?${params.toString()}`
  );
}

export type ActivityStatsCounts = {
  total: number;
  open: number;
  in_progress: number;
  done: number;
  canceled: number;
};

export type ActivityStats = {
  scope: "team" | "mine";
  can_view_team: boolean;
  date_basis: "due_date";
  generated_at: number;

  summary: ActivityStatsCounts & {
    overdue: number;
    undated: number;
    done_without_completion_date: number;
  };

  users: (ActivityStatsCounts & {
    user_id: string;
    name: string;
  })[];

  unassigned: number;
};

export type ActivityStatsFilters = {
  scope?: "team" | "mine";
  person_id?: string;
  q?: string;
  pending?: boolean;
  undated?: boolean;
  due_from?: number;
  due_before?: number;
};

export async function getActivityStats(
  filters: ActivityStatsFilters = {}
): Promise<ActivityStats> {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;

    if (typeof value === "boolean") {
      if (value) params.set(key, "1");
    } else {
      params.set(key, String(value));
    }
  }

  const query = params.toString();

  return api.get<ActivityStats>(
    `/activities/stats${query ? `?${query}` : ""}`
  );
}