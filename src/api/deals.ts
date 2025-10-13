// src/api/deals.ts
export type DealStage = "nuevo" | "calificado" | "propuesta" | "negociacion" | "ganado" | "perdido";

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

let BASE_URL = "http://localhost:4000";
if (typeof navigator !== "undefined" && (navigator as any).product === "ReactNative") {
  BASE_URL = "http://10.0.2.2:4000";
}
if (process.env.EXPO_PUBLIC_API_BASE_URL) {
  BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
}

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listDeals(): Promise<Deal[]> {
  return j(await fetch(`${BASE_URL}/deals`));
}
export async function getDeal(id: string): Promise<Deal> {
  return j(await fetch(`${BASE_URL}/deals/${id}`));
}
export async function createDeal(input: Omit<Deal,"created_at"|"updated_at">) {
  await fetch(`${BASE_URL}/deals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then(j);
}
export async function updateDeal(id: string, patch: Partial<Deal>) {
  await fetch(`${BASE_URL}/deals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then(j);
}
export async function deleteDeal(id: string) {
  await fetch(`${BASE_URL}/deals/${id}`, { method: "DELETE" }).then(j);
}
