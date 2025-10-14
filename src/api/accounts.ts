// src/api/accounts.ts
import { API_BASE } from "@/src/config";

export type Account = {
  id: string;
  name: string;
  website?: string | null;
  phone?: string | null;
  created_at?: number;
  updated_at?: number;
};

export type ListAccountsPagedInput = {
  q: string;
  cursor: string | null;     // id del último item de la página anterior
  limit: number;
};

export type AccountsPage = { items: Account[]; nextCursor: string | null };

const API = API_BASE;

/* ===== Listado simple (sin paginar) ===== */
export async function listAccounts(): Promise<Account[]> {
  const r = await fetch(`${API}/accounts`);
  if (!r.ok) throw new Error("Error listando cuentas");
  return r.json();
}

/* ===== Listado paginado (shim en cliente) =====
   Si tu server NO tiene paginación, esto pagina en memoria.
   Si más adelante agregas paginación real en server, cambia esta
   función para llamar `${API}/accounts?q=...&cursor=...&limit=...`
   y devolver { items, nextCursor } del backend.
*/
export async function listAccountsPaged(
  { q, cursor, limit }: ListAccountsPagedInput
): Promise<AccountsPage> {
  const all = await listAccounts();

  const qNorm = q.trim().toLowerCase();
  const filtered = qNorm
    ? all.filter(a =>
        (a.name ?? "").toLowerCase().includes(qNorm) ||
        (a.website ?? "").toLowerCase().includes(qNorm) ||
        (a.phone ?? "").toLowerCase().includes(qNorm)
      )
    : all;

  // Orden: updated_at desc, y luego nombre
  filtered.sort((a, b) => {
    const ua = a.updated_at ?? 0, ub = b.updated_at ?? 0;
    if (ua !== ub) return ub - ua;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  const start = cursor
    ? Math.max(0, filtered.findIndex(x => x.id === cursor) + 1)
    : 0;

  const items = filtered.slice(start, start + limit);
  const nextCursor =
    start + limit < filtered.length && items.length > 0
      ? items[items.length - 1].id
      : null;

  return { items, nextCursor };
}

/* ===== CRUD ===== */
export async function getAccount(id: string): Promise<Account> {
  const r = await fetch(`${API}/accounts/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error("Cuenta no encontrada");
  return r.json();
}

export async function createAccount(body: Partial<Account>) {
  const r = await fetch(`${API}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Error creando cuenta");
  return r.json();
}

export async function updateAccount(id: string, body: Partial<Account>) {
  const r = await fetch(`${API}/accounts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Error actualizando cuenta");
  return r.json();
}

export async function deleteAccount(id: string) {
  const r = await fetch(`${API}/accounts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error("Error eliminando cuenta");
  return r.json();
}



// let BASE_URL = "http://localhost:4000";
// if (typeof navigator !== "undefined" && (navigator as any).product === "ReactNative") {
//   BASE_URL = "http://10.0.2.2:4000";
// }
// if (process.env.EXPO_PUBLIC_API_BASE_URL) {
//   BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
// }

// export type Account = {
//   id: string;
//   name: string;
//   website?: string | null;
//   phone?: string | null;
//   created_at: number;
//   updated_at: number;
// };

// async function j<T>(r: Response): Promise<T> {
//   if (!r.ok) throw new Error(await r.text());
//   return r.json();
// }

// export async function listAccounts(): Promise<Account[]> {
//   return j(await fetch(`${BASE_URL}/accounts`));
// }
// export async function getAccount(id: string): Promise<Account> {
//   return j(await fetch(`${BASE_URL}/accounts/${id}`));
// }
// export async function createAccount(input: Omit<Account, "created_at" | "updated_at">) {
//   await fetch(`${BASE_URL}/accounts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }).then(j);
// }
// export async function updateAccount(id: string, patch: Partial<Account>) {
//   await fetch(`${BASE_URL}/accounts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then(j);
// }
// export async function deleteAccount(id: string) {
//   await fetch(`${BASE_URL}/accounts/${id}`, { method: "DELETE" }).then(j);
// }
