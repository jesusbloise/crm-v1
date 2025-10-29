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
  title: string;
  amount?: number;
  stage: DealStage;
  account_id?: string | null;
  contact_id?: string | null;
  close_date?: number | null; // timestamp
  created_at: number;
  updated_at: number;
};

// LIST
export function listDeals(): Promise<Deal[]> {
  return api.get<Deal[]>("/deals");
}

// GET ONE
export function getDeal(id: string): Promise<Deal> {
  return api.get<Deal>(`/deals/${id}`);
}

// CREATE
export function createDeal(
  input: Omit<Deal, "created_at" | "updated_at">
): Promise<void> {
  return api.post("/deals", input);
}

// UPDATE
export function updateDeal(
  id: string,
  patch: Partial<Deal>
): Promise<void> {
  return api.patch(`/deals/${id}`, patch);
}

// DELETE
export function deleteDeal(id: string): Promise<void> {
  return api.delete(`/deals/${id}`);
}
