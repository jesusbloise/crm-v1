import { api } from "@/src/api";

export type Contact = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  position?: string | null;
  account_id?: string | null;
  created_at: number;
  updated_at: number;
};

export async function listContacts(): Promise<Contact[]> {
  return api.get("/contacts");
}
export async function getContact(id: string): Promise<Contact> {
  return api.get(`/contacts/${id}`);
}
export async function createContact(input: Omit<Contact,"created_at"|"updated_at">): Promise<void> {
  await api.post("/contacts", input);
}
export async function updateContact(id: string, patch: Partial<Contact>): Promise<void> {
  await api.patch(`/contacts/${id}`, patch);
}
export async function deleteContact(id: string): Promise<void> {
  await api.del(`/contacts/${id}`);
}


// import { API_BASE } from "@/src/config";

// export type Contact = {
//   id: string;
//   name: string;
//   email?: string | null;
//   phone?: string | null;
//   company?: string | null;    // seguimos soportando mientras migramos a accounts
//   position?: string | null;
//   account_id?: string | null; // relación con Account
//   created_at: number;
//   updated_at: number;
// };

// const API = API_BASE;

// async function asJson<T>(r: Response): Promise<T> {
//   if (!r.ok) {
//     const msg = await r.text().catch(() => r.statusText);
//     throw new Error(msg || `HTTP ${r.status}`);
//   }
//   return r.json();
// }

// /* ===== CRUD básico (compat) ===== */

// export async function listContacts(): Promise<Contact[]> {
//   return asJson(await fetch(`${API}/contacts`));
// }

// export async function getContact(id: string): Promise<Contact> {
//   return asJson(await fetch(`${API}/contacts/${encodeURIComponent(id)}`));
// }

// export async function createContact(
//   input: Omit<Contact, "created_at" | "updated_at">
// ): Promise<{ ok: true } | unknown> {
//   return asJson(
//     await fetch(`${API}/contacts`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(input),
//     })
//   );
// }

// export async function updateContact(
//   id: string,
//   patch: Partial<Contact>
// ): Promise<{ ok: true } | unknown> {
//   return asJson(
//     await fetch(`${API}/contacts/${encodeURIComponent(id)}`, {
//       method: "PATCH",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(patch),
//     })
//   );
// }

// export async function deleteContact(id: string): Promise<{ ok: true } | unknown> {
//   return asJson(
//     await fetch(`${API}/contacts/${encodeURIComponent(id)}`, { method: "DELETE" })
//   );
// }

// /* ===== Búsqueda + paginación infinita ===== */

// export type ContactsPage = { items: Contact[]; nextCursor: string | null };

// export async function listContactsPaged(params: {
//   q: string;
//   cursor: string | null;
//   limit: number;
// }): Promise<ContactsPage> {
//   const url = new URL(`${API}/contacts.search`);
//   if (params.q) url.searchParams.set("q", params.q);
//   if (params.cursor) url.searchParams.set("cursor", params.cursor);
//   url.searchParams.set("limit", String(params.limit || 20));

//   return asJson(await fetch(url.toString()));
// }


// // src/api/contacts.ts


// export type Contact = {
//   id: string;
//   name: string;
//   email?: string | undefined;
//   phone?: string | undefined;
//   company?: string | undefined;      // seguimos soportando mientras migramos
//   position?: string | undefined;
//   account_id?: string | undefined;   // 👈 relación con Account
//   created_at: number;
//   updated_at: number;
// };

// let BASE_URL = "http://localhost:4000";
// // Emulador Android (Expo Go): localhost de tu PC es 10.0.2.2
// if (typeof navigator !== "undefined" && (navigator as any).product === "ReactNative") {
//   BASE_URL = "http://10.0.2.2:4000";
// }
// // Override por .env si lo necesitas (teléfono físico, IP LAN, etc.)
// if (process.env.EXPO_PUBLIC_API_BASE_URL) {
//   BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
// }

// async function j<T>(r: Response): Promise<T> {
//   if (!r.ok) throw new Error(await r.text());
//   return r.json();
// }

// export async function listContacts(): Promise<Contact[]> {
//   return j(await fetch(`${BASE_URL}/contacts`));
// }

// export async function getContact(id: string): Promise<Contact> {
//   return j(await fetch(`${BASE_URL}/contacts/${id}`));
// }

// export async function createContact(input: Omit<Contact, "created_at" | "updated_at">) {
//   await fetch(`${BASE_URL}/contacts`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(input),
//   }).then(j);
// }

// export async function updateContact(id: string, patch: Partial<Contact>) {
//   await fetch(`${BASE_URL}/contacts/${id}`, {
//     method: "PATCH",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(patch),
//   }).then(j);
// }

// export async function deleteContact(id: string) {
//   await fetch(`${BASE_URL}/contacts/${id}`, { method: "DELETE" }).then(j);
// }
