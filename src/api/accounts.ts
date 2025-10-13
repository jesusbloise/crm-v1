let BASE_URL = "http://localhost:4000";
if (typeof navigator !== "undefined" && (navigator as any).product === "ReactNative") {
  BASE_URL = "http://10.0.2.2:4000";
}
if (process.env.EXPO_PUBLIC_API_BASE_URL) {
  BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
}

export type Account = {
  id: string;
  name: string;
  website?: string | null;
  phone?: string | null;
  created_at: number;
  updated_at: number;
};

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listAccounts(): Promise<Account[]> {
  return j(await fetch(`${BASE_URL}/accounts`));
}
export async function getAccount(id: string): Promise<Account> {
  return j(await fetch(`${BASE_URL}/accounts/${id}`));
}
export async function createAccount(input: Omit<Account, "created_at" | "updated_at">) {
  await fetch(`${BASE_URL}/accounts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }).then(j);
}
export async function updateAccount(id: string, patch: Partial<Account>) {
  await fetch(`${BASE_URL}/accounts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then(j);
}
export async function deleteAccount(id: string) {
  await fetch(`${BASE_URL}/accounts/${id}`, { method: "DELETE" }).then(j);
}
