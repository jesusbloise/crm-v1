// src/api/contacts.ts
import { api } from "@/src/api/http";

export type ClientType = "productora" | "agencia" | null;

export type Contact = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  position?: string | null;
  client_type?: ClientType;
  account_id?: string | null;
  created_by?: string;
  created_by_name?: string;
  created_by_email?: string;
  created_at: number;
  updated_at: number;
};

export async function listContacts(): Promise<Contact[]> {
  // vista “normal” (la que usas en index.tsx)
  return api.get("/contacts");
}

// 👇 ESTA es la que usa all.tsx para traer TODOS
export async function listAllContacts(): Promise<Contact[]> {
  return api.get("/contacts-all");
}

export async function getContact(id: string): Promise<Contact> {
  return api.get(`/contacts/${id}`);
}

export async function createContact(
  input: Omit<Contact, "created_at" | "updated_at">
): Promise<void> {
  await api.post("/contacts", input);
}

export async function updateContact(
  id: string,
  patch: Partial<Contact>
): Promise<void> {
  await api.patch(`/contacts/${id}`, patch);
}

export async function deleteContact(id: string): Promise<void> {
  await api.delete(`/contacts/${id}`);
}




 // src/api/contacts.ts
// import { api } from "@/src/api/http";

// export type ClientType = "productora" | "agencia" | null;

// export type Contact = {
//   id: string;
//   name: string;
//   email?: string | null;
//   phone?: string | null;
//   company?: string | null;
//   position?: string | null;

//   // 👇 Nuevo campo para el tipo de cliente
//   client_type?: ClientType;

//   // (opcional) si todavía usas cuentas en otros lados,
//   // lo dejamos para no romper nada
//   account_id?: string | null;

//   created_by?: string;
//   created_by_name?: string;
//   created_by_email?: string;
//   created_at: number;
//   updated_at: number;
// };

// export async function listContacts(): Promise<Contact[]> {
//   return api.get("/contacts");
// }

// export async function getContact(id: string): Promise<Contact> {
//   return api.get(`/contacts/${id}`);
// }

// // createContact ya puede recibir client_type porque está en Contact
// export async function createContact(
//   input: Omit<Contact, "created_at" | "updated_at">
// ): Promise<void> {
//   await api.post("/contacts", input);
// }

// export async function updateContact(
//   id: string,
//   patch: Partial<Contact>
// ): Promise<void> {
//   await api.patch(`/contacts/${id}`, patch);
// }

// export async function deleteContact(id: string): Promise<void> {
//   await api.delete(`/contacts/${id}`);
// }
