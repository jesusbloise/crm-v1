// src/api/http.ts
import { authHeaders } from "@/src/api/auth";
import { getBaseURL } from "@/src/config/baseUrl";

const base = getBaseURL();

type Json = Record<string, any>;

async function request<T = Json>(path: string, init: RequestInit = {}) {
  const headers = await authHeaders(init.headers || {});
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T = Json>(path: string) => request<T>(path, { method: "GET" }),
  post: <T = Json>(path: string, body?: any) =>
    request<T>(path, {
      method: "POST",
      body: body != null ? JSON.stringify(body) : undefined,
    }),
  put: <T = Json>(path: string, body?: any) =>
    request<T>(path, {
      method: "PUT",
      body: body != null ? JSON.stringify(body) : undefined,
    }),
  patch: <T = Json>(path: string, body?: any) =>
    request<T>(path, {
      method: "PATCH",
      body: body != null ? JSON.stringify(body) : undefined,
    }),
  delete: <T = Json>(path: string) => request<T>(path, { method: "DELETE" }),
};
