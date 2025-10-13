// src/api/contacts.ts
export type Contact = {
  id: string;
  name: string;
  email?: string | undefined;
  phone?: string | undefined;
  company?: string | undefined;      // seguimos soportando mientras migramos
  position?: string | undefined;
  account_id?: string | undefined;   // 👈 relación con Account
  created_at: number;
  updated_at: number;
};

let BASE_URL = "http://localhost:4000";
// Emulador Android (Expo Go): localhost de tu PC es 10.0.2.2
if (typeof navigator !== "undefined" && (navigator as any).product === "ReactNative") {
  BASE_URL = "http://10.0.2.2:4000";
}
// Override por .env si lo necesitas (teléfono físico, IP LAN, etc.)
if (process.env.EXPO_PUBLIC_API_BASE_URL) {
  BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
}

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listContacts(): Promise<Contact[]> {
  return j(await fetch(`${BASE_URL}/contacts`));
}

export async function getContact(id: string): Promise<Contact> {
  return j(await fetch(`${BASE_URL}/contacts/${id}`));
}

export async function createContact(input: Omit<Contact, "created_at" | "updated_at">) {
  await fetch(`${BASE_URL}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then(j);
}

export async function updateContact(id: string, patch: Partial<Contact>) {
  await fetch(`${BASE_URL}/contacts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then(j);
}

export async function deleteContact(id: string) {
  await fetch(`${BASE_URL}/contacts/${id}`, { method: "DELETE" }).then(j);
}
