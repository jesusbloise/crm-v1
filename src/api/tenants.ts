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
  return Array.isArray((data as any).items) ? (data as any).items : (data as any);
}
