// src/api/workspaceMembers.ts
import { authFetch } from "./auth";

export type WorkspaceMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  member_since: number;
  member_updated_at: number;
};

export async function listWorkspaceMembers(): Promise<WorkspaceMember[]> {
  const res = await authFetch<{
    tenant: { id: string };
    items: WorkspaceMember[];
  }>("/tenants/members", { method: "GET" });

  return res.items || [];
}
