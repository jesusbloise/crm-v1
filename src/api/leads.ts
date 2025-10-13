// src/api/leads.ts
export const STATUS_FLOW = ["nuevo","contactado","calificado","ganado","perdido"] as const;
export type LeadStatus = typeof STATUS_FLOW[number];

export type Lead = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  status?: LeadStatus;
  created_at: number;
  updated_at: number;
};

// 💡 Ajusta BASE_URL:
// - En emulador Android usa: http://10.0.2.2:4000
// - En teléfono físico: http://<IP_DE_TU_PC>:4000
// - En Web/PC: http://localhost:4000
const PLATFORM = typeof navigator !== "undefined" ? navigator.product : "unknown";
let BASE_URL = "http://localhost:4000";
if (PLATFORM === "ReactNative") {
  // Expo Go Android Emulator
  BASE_URL = "http://10.0.2.2:4000";
}
// Si usas teléfono físico, reemplaza manualmente:
if (process.env.EXPO_PUBLIC_API_BASE_URL) {
  BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
}

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listLeads(): Promise<Lead[]> {
  return j(await fetch(`${BASE_URL}/leads`));
}

export async function getLead(id: string): Promise<Lead> {
  return j(await fetch(`${BASE_URL}/leads/${id}`));
}

export async function createLead(input: Omit<Lead, "created_at" | "updated_at">) {
  await fetch(`${BASE_URL}/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then(j);
}

export async function updateLead(id: string, patch: Partial<Lead>) {
  await fetch(`${BASE_URL}/leads/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then(j);
}

export async function deleteLead(id: string) {
  await fetch(`${BASE_URL}/leads/${id}`, { method: "DELETE" }).then(j);
}
