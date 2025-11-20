// src/api/workspaceMembers.ts
import { api } from "@/src/api/http";

export type WorkspaceMember = {
  id: string;
  name: string;
  email?: string | null;
};

export async function listWorkspaceMembers(): Promise<WorkspaceMember[]> {
  return api.get("/workspace/members");
}
