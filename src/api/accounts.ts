// src/api/accounts.ts
import { api } from "@/src/api/http";

export type Account = {
  id: string;
  name: string;
  website?: string | null;
  phone?: string | null;
  created_at: number;
  updated_at: number;
};

export type AccountsPage = {
  items: Account[];
  nextCursor: string | null;
};

// ✅ Acepta array (legacy) o formato paginado
export async function listAccountsPaged(params: {
  q?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<AccountsPage> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const data: any = await api.get(`/accounts${suffix}`);

  if (Array.isArray(data)) {
    return { items: data as Account[], nextCursor: null };
  }
  if (data && Array.isArray(data.items)) {
    return data as AccountsPage;
  }
  return { items: [], nextCursor: null };
}

/* --- CRUD --- */
export async function listAccounts(): Promise<Account[]> {
  return api.get("/accounts");
}
export async function getAccount(id: string): Promise<Account> {
  return api.get(`/accounts/${id}`);
}
export async function createAccount(
  input: Omit<Account, "created_at" | "updated_at">
): Promise<void> {
  await api.post("/accounts", input);
}
export async function updateAccount(
  id: string,
  patch: Partial<Account>
): Promise<void> {
  await api.patch(`/accounts/${id}`, patch);
}
export async function deleteAccount(id: string): Promise<void> {
  await api.delete(`/accounts/${id}`);
}
