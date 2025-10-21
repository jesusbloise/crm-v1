// src/api/leads.ts
import { api } from "@/src/api/http";

// Flujo de estados
export const STATUS_FLOW = [
  "nuevo",
  "contactado",
  "interesado",
  "calificado",
  "perdido",
] as const;

export type LeadStatus = (typeof STATUS_FLOW)[number];

export type Lead = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  status?: LeadStatus | null;
  created_at: number;
  updated_at: number;
};

// LIST
export async function listLeads(): Promise<Lead[]> {
  return api.get("/leads");
}

// GET ONE
export async function getLead(id: string): Promise<Lead> {
  return api.get(`/leads/${id}`);
}

// CREATE
export async function createLead(
  input: Omit<Lead, "created_at" | "updated_at">
): Promise<void> {
  await api.post("/leads", input);
}

// UPDATE
export async function updateLead(
  id: string,
  patch: Partial<Lead>
): Promise<void> {
  await api.patch(`/leads/${id}`, patch);
}

// DELETE
export async function deleteLead(id: string): Promise<void> {
  await api.delete(`/leads/${id}`);
}
