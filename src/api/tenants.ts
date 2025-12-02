// src/api/tenants.ts
import { api } from "@/src/api/http";

export type TenantMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: "owner" | "admin" | "member";
  member_since?: number;
  member_updated_at?: number;
};

export async function listTenantMembers(): Promise<TenantMember[]> {
  // El backend /tenants/members responde:
  // { tenant: { id }, items: [ { id, name, email, role, ... } ] }
  const data = await api.get("/tenants/members");
  return Array.isArray((data as any).items)
    ? (data as any).items
    : (data as any);
}

// 🔹 NEW: listar workspaces (tenants) visibles para el usuario actual
export type TenantWorkspace = {
  id: string;
  name: string;
  created_by: string;
  owner_name?: string | null;
  owner_email?: string | null;
  is_owner?: boolean;
};

export async function listTenants(): Promise<TenantWorkspace[]> {
  // El backend /tenants responde: { items: [...], active_tenant: "xxx" }
  const data = await api.get("/tenants");
  if (!data) return [];
  const items = (data as any).items;
  return Array.isArray(items) ? (items as TenantWorkspace[]) : [];
}



// // src/api/tenants.ts
// import { api } from "@/src/api/http";

// export type TenantMember = {
//   id: string;
//   name: string | null;
//   email: string | null;
//   role: "owner" | "admin" | "member";
//   member_since?: number;
//   member_updated_at?: number;
// };

// export async function listTenantMembers(): Promise<TenantMember[]> {
//   // El backend /tenants/members responde:
//   // { tenant: { id }, items: [ { id, name, email, role, ... } ] }
//   const data = await api.get("/tenants/members");
//   return Array.isArray((data as any).items) ? (data as any).items : (data as any);
// }
