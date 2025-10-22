// src/api/http.ts
import { authHeaders } from "@/src/api/auth";
import { getBaseURL } from "@/src/config/baseUrl";

const base = getBaseURL();

type Json = Record<string, any>;

export class ApiError extends Error {
  status: number;
  code?: string;
  body?: unknown;

  constructor(message: string, opts: { status: number; code?: string; body?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.body = opts.body;
  }
}

async function request<T = Json>(path: string, init: RequestInit = {}) {
  // Headers base (JSON) + los que pasen + los que inyecta authHeaders (Authorization + X-Tenant-Id)
  const baseHeaders: HeadersInit = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // Si el caller pasó Headers/Record, lo normalizamos a objeto simple
  const provided = init.headers
    ? (init.headers as Record<string, string>)
    : ({} as Record<string, string>);

  const headers = await authHeaders({ ...baseHeaders, ...provided });

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
  });

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    // tratamos de sacar un mensaje razonable
    const code = (data?.error as string | undefined) || undefined;
    const msg =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      `HTTP ${res.status}`;
    throw new ApiError(msg, { status: res.status, code, body: data });
  }

  return (data as T) ?? ({} as T);
}

export const api = {
  get:  <T = Json>(path: string) => request<T>(path, { method: "GET" }),
  post: <T = Json>(path: string, body?: any) =>
    request<T>(path, {
      method: "POST",
      body: body != null ? JSON.stringify(body) : undefined,
    }),
  put:  <T = Json>(path: string, body?: any) =>
    request<T>(path, {
      method: "PUT",
      body: body != null ? JSON.stringify(body) : undefined,
    }),
  patch:<T = Json>(path: string, body?: any) =>
    request<T>(path, {
      method: "PATCH",
      body: body != null ? JSON.stringify(body) : undefined,
    }),
  delete:<T = Json>(path: string) => request<T>(path, { method: "DELETE" }),
};

// // src/api/http.ts
// import { authHeaders } from "@/src/api/auth";
// import { getBaseURL } from "@/src/config/baseUrl";

// const base = getBaseURL();

// type Json = Record<string, any>;

// async function request<T = Json>(path: string, init: RequestInit = {}) {
//   const headers = await authHeaders(init.headers || {});
//   const res = await fetch(`${base}${path}`, { ...init, headers });
//   const data = (await res.json().catch(() => ({}))) as T & { error?: string };

//   if (!res.ok) {
//     throw new Error(data?.error || `HTTP ${res.status}`);
//   }
//   return data as T;
// }

// export const api = {
//   get: <T = Json>(path: string) => request<T>(path, { method: "GET" }),
//   post: <T = Json>(path: string, body?: any) =>
//     request<T>(path, {
//       method: "POST",
//       body: body != null ? JSON.stringify(body) : undefined,
//     }),
//   put: <T = Json>(path: string, body?: any) =>
//     request<T>(path, {
//       method: "PUT",
//       body: body != null ? JSON.stringify(body) : undefined,
//     }),
//   patch: <T = Json>(path: string, body?: any) =>
//     request<T>(path, {
//       method: "PATCH",
//       body: body != null ? JSON.stringify(body) : undefined,
//     }),
//   delete: <T = Json>(path: string) => request<T>(path, { method: "DELETE" }),
// };
