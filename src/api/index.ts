// src/api/index.ts
import Constants from "expo-constants";
import { Platform } from "react-native";

function resolveBaseURL() {
  // Web: localhost ok
  if (Platform.OS === "web") return "http://localhost:4000";

  // Expo: intenta deducir el host LAN cuando corres en la misma red
  const hostUri =
    (Constants as any)?.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoGo?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost || "";

  const lanHost = typeof hostUri === "string" ? hostUri.split(":")[0] : "";

  if (lanHost && !/^localhost|127\.0\.0\.1$/i.test(lanHost)) {
    return `http://${lanHost}:4000`;
  }

  // Emulador Android (localhost de la MÁQUINA es 10.0.2.2)
  if (Platform.OS === "android") return "http://10.0.2.2:4000";

  // iOS simulator suele resolver localhost, pero por si acaso:
  return "http://localhost:4000";
}

const BASE_URL = resolveBaseURL();

// ——— cliente mínimo con headers de auth/tenant ———
let AUTH_TOKEN: string | undefined;
let TENANT_ID: string | undefined;

export function setAuth(token?: string, tenant?: string) {
  AUTH_TOKEN = token;
  TENANT_ID = tenant;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: any = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  if (TENANT_ID) headers["X-Tenant-Id"] = TENANT_ID;

  const resp = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`${resp.status} ${resp.statusText}${txt ? ` | ${txt}` : ""}`);
  }
  return (await resp.json()) as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: any) =>
    request<T>(url, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(url: string, body?: any) =>
    request<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};

export { BASE_URL };


// // src/api/index.ts
// const BASE_URL =
//   process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:4000";

// type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

// let AUTH: { token?: string; tenant?: string } = {
//   token:
//     typeof localStorage !== "undefined" ? localStorage.getItem("auth.token") || undefined : undefined,
//   tenant:
//     typeof localStorage !== "undefined" ? localStorage.getItem("auth.tenant") || undefined : undefined,
// };

// export function setAuth(token?: string, tenant?: string) {
//   AUTH.token = token;
//   AUTH.tenant = tenant;
//   try {
//     if (typeof localStorage !== "undefined") {
//       if (token) localStorage.setItem("auth.token", token);
//       if (tenant) localStorage.setItem("auth.tenant", tenant);
//     }
//   } catch {}
// }

// function buildHeaders(extra?: Record<string, string>) {
//   const h: Record<string, string> = {
//     "Content-Type": "application/json",
//     ...extra,
//   };
//   if (AUTH.token) h.Authorization = `Bearer ${AUTH.token}`;
//   if (AUTH.tenant) h["X-Tenant-Id"] = AUTH.tenant;
//   return h;
// }

// async function request<T>(
//   path: string,
//   method: HttpMethod,
//   body?: any,
//   extraHeaders?: Record<string, string>
// ): Promise<T> {
//   const res = await fetch(`${BASE_URL}${path}`, {
//     method,
//     headers: buildHeaders(extraHeaders),
//     body: body != null ? JSON.stringify(body) : undefined,
//   });

//   // Intenta parsear JSON siempre, incluso en errores
//   let data: any = null;
//   try {
//     data = await res.json();
//   } catch {
//     // ignora si no es json
//   }

//   if (!res.ok) {
//     const err = new Error(
//       data?.error
//         ? `${res.status} ${res.statusText} (${data.error})`
//         : `${res.status} ${res.statusText}`
//     ) as any;
//     err.status = res.status;
//     err.payload = data;
//     throw err;
//   }
//   return data as T;
// }

// export const api = {
//   get: <T>(path: string) => request<T>(path, "GET"),
//   post: <T>(path: string, body?: any) => request<T>(path, "POST", body),
//   patch: <T>(path: string, body?: any) => request<T>(path, "PATCH", body),
//   del: <T>(path: string) => request<T>(path, "DELETE"),
// };

// // Helpers de negocio comunes
// export const withAuthReady = async () => {
//   // por si quieres gatear manualmente en algún lugar
//   if (!AUTH.token || !AUTH.tenant) {
//     throw new Error("auth_not_ready");
//   }
// };

// —— Ejemplos de uso ——
// export function listContacts() { return api.get<Contact[]>("/contacts"); }


// // src/api/index.ts
// import { API_BASE } from "@/src/config";

// type Json = any;

// function tenantId() {
//   // en PROD lo cambiará el login; por ahora, usa env o "demo"
//   return process.env.EXPO_PUBLIC_TENANT_ID || "demo";
// }

// async function handle<T = Json>(res: Response): Promise<T> {
//   if (!res.ok) {
//     // intenta parsear json, si no hay devuelve texto
//     const txt = await res.text();
//     try { return Promise.reject(JSON.parse(txt)); } catch { return Promise.reject(txt); }
//   }
//   return res.json();
// }

// async function get<T = Json>(path: string): Promise<T> {
//   const res = await fetch(`${API_BASE}${path}`, {
//     headers: {
//       "Content-Type": "application/json",
//       "X-Tenant-Id": tenantId(),
//     },
//   });
//   return handle<T>(res);
// }

// async function post<T = Json>(path: string, body?: any): Promise<T> {
//   const res = await fetch(`${API_BASE}${path}`, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       "X-Tenant-Id": tenantId(),
//     },
//     body: body ? JSON.stringify(body) : undefined,
//   });
//   return handle<T>(res);
// }

// async function patch<T = Json>(path: string, body?: any): Promise<T> {
//   const res = await fetch(`${API_BASE}${path}`, {
//     method: "PATCH",
//     headers: {
//       "Content-Type": "application/json",
//       "X-Tenant-Id": tenantId(),
//     },
//     body: body ? JSON.stringify(body) : undefined,
//   });
//   return handle<T>(res);
// }

// async function del<T = Json>(path: string): Promise<T> {
//   const res = await fetch(`${API_BASE}${path}`, {
//     method: "DELETE",
//     headers: {
//       "Content-Type": "application/json",
//       "X-Tenant-Id": tenantId(),
//     },
//   });
//   return handle<T>(res);
// }

// export const api = { get, post, patch, del };


// // src/api/index.ts
// export async function tenantHeaders() {
//   const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
//   const tenant = (await AsyncStorage.getItem("tenant_id")) || "demo-tenant";
//   return { "x-tenant-id": tenant };
// }
