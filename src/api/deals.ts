// src/api/deals.ts
import { api } from "@/src/api/http";

export type DealStage =
  | "nuevo"
  | "calificado"
  | "propuesta"
  | "negociacion"
  | "ganado"
  | "perdido";

export type Deal = {
  id: string;
  tenant_id?: string;
  title: string;

  // PostgreSQL puede devolver BIGINT como string.
  amount?: number | string | null;
  stage: DealStage;

  account_id?: string | null;
  account_name?: string | null;

  contact_id?: string | null;
  contact_name?: string | null;

  created_by?: string | null;
  created_by_name?: string | null;

  assigned_to?: string | null;
  assigned_to_name?: string | null;

  close_date?: number | string | null;
  closed_at?: number | string | null;
  lost_reason?: string | null;

  created_at: number | string;
  updated_at: number | string;

  can_manage_assignment?: boolean;
  can_delete?: boolean;
};

export type DealInput = {
  id: string;
  title: string;
  stage: DealStage;
  amount?: number | null;
  account_id?: string | null;
  contact_id?: string | null;
  assigned_to?: string | null;
  close_date?: number | null;
  lost_reason?: string | null;
};

export type DealPatch = Partial<Omit<DealInput, "id">> & {
  expected_updated_at?: number;
};

export type DealListParams = {
  limit?: number;
  offset?: number;
  assigned_to?: string;
  contact_id?: string;
  stage?: DealStage;
};

export type DealStageHistory = {
  id: string;
  tenant_id: string;
  deal_id: string;
  from_stage: DealStage | null;
  to_stage: DealStage;
  changed_by: string | null;
  changed_by_name: string | null;
  reason: string | null;
  created_at: number | string;
};

export function listDeals(
  params?: DealListParams
): Promise<Deal[]> {
  const query = new URLSearchParams();

  if (params?.limit !== undefined) {
    query.set("limit", String(params.limit));
  }

  if (params?.offset !== undefined) {
    query.set("offset", String(params.offset));
  }

  if (params?.assigned_to) {
    query.set("assigned_to", params.assigned_to);
  }

  if (params?.contact_id) {
    query.set("contact_id", params.contact_id);
  }

  if (params?.stage) {
    query.set("stage", params.stage);
  }

  const suffix = query.toString();

  return api.get<Deal[]>(
    suffix ? `/deals?${suffix}` : "/deals"
  );
}

export function getDeal(id: string): Promise<Deal> {
  return api.get<Deal>(
    `/deals/${encodeURIComponent(id)}`
  );
}

export function createDeal(input: DealInput): Promise<Deal> {
  return api.post<Deal>("/deals", input);
}

export function updateDeal(
  id: string,
  patch: DealPatch
): Promise<Deal> {
  return api.patch<Deal>(
    `/deals/${encodeURIComponent(id)}`,
    patch
  );
}

export function deleteDeal(id: string): Promise<void> {
  return api.delete(
    `/deals/${encodeURIComponent(id)}`
  );
}

export function getDealHistory(
  id: string
): Promise<DealStageHistory[]> {
  return api.get<DealStageHistory[]>(
    `/deals/${encodeURIComponent(id)}/history`
  );
}