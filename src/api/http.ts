// src/api/http.ts
import { authHeaders } from "@/src/api/auth";
import { getBaseURL } from "@/src/config/baseUrl";

const BASE = getBaseURL();
const DEFAULT_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_HTTP_TIMEOUT_MS || 25000);

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

export function qs(params?: Record<string, any>): string {
  if (!params) return "";
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v == null) return;
    if (Array.isArray(v)) v.forEach((item) => usp.append(k, String(item)));
    else usp.set(k, String(v));
  });
  const s = usp.toString();
  return s ? `?${s}` : "";
}

function toUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path; // absoluta
  if (BASE.endsWith("/") && path.startsWith("/")) return BASE + path.slice(1);
  if (!BASE.endsWith("/") && !path.startsWith("/")) return `${BASE}/${path}`;
  return BASE + path;
}

function isFormData(x: any): x is FormData {
  return typeof FormData !== "undefined" && x instanceof FormData;
}

async function request<T = Json>(
  path: string,
  init: RequestInit = {},
  opts?: { timeoutMs?: number }
) {
  const url = toUrl(path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const baseHeaders: HeadersInit = {
    Accept: "application/json",
    ...(init.body && !isFormData(init.body) ? { "Content-Type": "application/json" } : {}),
  };

  // Normalizar headers proporcionados
  const provided =
    (init.headers as Record<string, string> | undefined) ?? ({} as Record<string, string>);

  // Evitar duplicar Authorization si el caller ya lo pasó
  const providedHasAuth = Object.keys(provided).some((k) => k.toLowerCase() === "authorization");

  // (Authorization + X-Tenant-Id) — delega en tu helper
  const headers = await authHeaders({
    ...baseHeaders,
    ...(!providedHasAuth ? {} : {}), // si ya trae Authorization, no añadimos nada extra aquí
    ...provided,
  });

  const finalInit: RequestInit = {
    ...init,
    headers,
    signal: controller.signal,
  };
  if (init.body != null && !isFormData(init.body)) {
    finalInit.body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  }

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("🌐 HTTP →", finalInit.method || "GET", url);
    console.log("🧩 Headers:", headers);
    if (finalInit.body) console.log("📦 Body:", finalInit.body);
  }

  let res: Response;
  try {
    res = await fetch(url, finalInit);
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("📥 HTTP Response:", res.status, res.statusText);
    }
  } catch (e: any) {
    clearTimeout(timeout);
    const msg = e?.name === "AbortError" ? "Request timeout" : e?.message || "Network error";
    console.error("❌ HTTP Error:", msg, e);
    throw new ApiError(msg, { status: 0, body: null });
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 204 || res.status === 304) return undefined as unknown as T;

  let data: any = null;
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text; // devuelve texto crudo si no es JSON
    }
  }

  if (!res.ok) {
    const code = (data && typeof data === "object" && (data as any).error) || undefined;
    const message =
      (data && typeof data === "object" && ((data as any).message || (data as any).detail)) ||
      (typeof code === "string" && code) ||
      `HTTP ${res.status}`;
    console.error("❌ HTTP Error Response:", { status: res.status, code, message, data });
    throw new ApiError(String(message), { status: res.status, code, body: data });
  }

  return (data as T) ?? ({} as T);
}

export const api = {
  get:   <T = Json>(path: string, cfg?: { timeoutMs?: number }) =>
    request<T>(path, { method: "GET" }, cfg),
  getp:  <T = Json>(path: string, params?: Record<string, any>, cfg?: { timeoutMs?: number }) =>
    request<T>(`${path}${qs(params)}`, { method: "GET" }, cfg),
  post:  <T = Json>(path: string, body?: any, cfg?: { timeoutMs?: number }) =>
    request<T>(path, { method: "POST", body }, cfg),
  put:   <T = Json>(path: string, body?: any, cfg?: { timeoutMs?: number }) =>
    request<T>(path, { method: "PUT", body }, cfg),
  patch: <T = Json>(path: string, body?: any, cfg?: { timeoutMs?: number }) =>
    request<T>(path, { method: "PATCH", body }, cfg),
  delete:<T = Json>(path: string, cfg?: { timeoutMs?: number }) =>
    request<T>(path, { method: "DELETE" }, cfg),
};



// // src/api/http.ts
// import { authHeaders } from "@/src/api/auth";
// import { getBaseURL } from "@/src/config/baseUrl";

// const BASE = getBaseURL();
// const DEFAULT_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_HTTP_TIMEOUT_MS || 25000);

// type Json = Record<string, any>;

// export class ApiError extends Error {
//   status: number;
//   code?: string;
//   body?: unknown;

//   constructor(message: string, opts: { status: number; code?: string; body?: unknown }) {
//     super(message);
//     this.name = "ApiError";
//     this.status = opts.status;
//     this.code = opts.code;
//     this.body = opts.body;
//   }
// }

// /** Convierte un objeto plano en querystring (escape seguro). */
// export function qs(params?: Record<string, any>): string {
//   if (!params) return "";
//   const usp = new URLSearchParams();
//   Object.entries(params).forEach(([k, v]) => {
//     if (v === undefined || v === null) return;
//     if (Array.isArray(v)) v.forEach((item) => usp.append(k, String(item)));
//     else usp.set(k, String(v));
//   });
//   const s = usp.toString();
//   return s ? `?${s}` : "";
// }

// function toUrl(path: string) {
//   if (/^https?:\/\//i.test(path)) return path; // absoluta
//   // asegura que no dupliquemos slash
//   if (BASE.endsWith("/") && path.startsWith("/")) return BASE + path.slice(1);
//   if (!BASE.endsWith("/") && !path.startsWith("/")) return `${BASE}/${path}`;
//   return BASE + path;
// }

// function isFormData(x: any): x is FormData {
//   return typeof FormData !== "undefined" && x instanceof FormData;
// }

// /** Fetch con timeout y manejo robusto de errores/JSON. */
// async function request<T = Json>(
//   path: string,
//   init: RequestInit = {},
//   opts?: { timeoutMs?: number }
// ) {
//   const url = toUrl(path);
//   const controller = new AbortController();
//   const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

//   // Base headers
//   const baseHeaders: HeadersInit = {
//     Accept: "application/json",
//     // Nota: *no* imponemos Content-Type si es FormData
//     ...(init.body && !isFormData(init.body) ? { "Content-Type": "application/json" } : {}),
//   };

//   // Normalizar headers proporcionados
//   const provided =
//     (init.headers as Record<string, string> | undefined) ??
//     ({} as Record<string, string>);

//   // Autenticación (Authorization + X-Tenant-Id) — delega en tu helper
//   const headers = await authHeaders({ ...baseHeaders, ...provided });

//   // Serializar body si es objeto y no FormData
//   const finalInit: RequestInit = {
//     ...init,
//     headers,
//     signal: controller.signal,
//   };
//   if (init.body != null && !isFormData(init.body)) {
//     finalInit.body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
//   }

//   if (typeof __DEV__ !== "undefined" && __DEV__) {
//     // Log discreto en dev
//     console.log("🌐 HTTP →", finalInit.method || "GET", url);
//     if (finalInit.body) {
//       console.log("📦 Body:", finalInit.body);
//     }
//   }

//   let res: Response;
//   try {
//     res = await fetch(url, finalInit);
//     if (typeof __DEV__ !== "undefined" && __DEV__) {
//       console.log("📥 HTTP Response:", res.status, res.statusText);
//     }
//   } catch (e: any) {
//     clearTimeout(timeout);
//     // Error de red / CORS / timeout (AbortError)
//     const msg =
//       e?.name === "AbortError"
//         ? "Request timeout"
//         : e?.message || "Network error";
//     console.error("❌ HTTP Error:", msg, e);
//     throw new ApiError(msg, { status: 0, body: null });
//   } finally {
//     clearTimeout(timeout);
//   }

//   // No Content
//   if (res.status === 204) return undefined as unknown as T;

//   // 304 Not Modified (algunos backends la usan con ETags)
//   if (res.status === 304) return undefined as unknown as T;

//   // Intento de parseo JSON defensivo
//   let data: any = null;
//   const text = await res.text().catch(() => "");
//   if (text) {
//     try {
//       data = JSON.parse(text);
//     } catch {
//       // Si no es JSON, devolvemos texto crudo
//       data = text;
//     }
//   }

//   if (!res.ok) {
//     const code =
//       (data && typeof data === "object" && (data as any).error) || undefined;
//     const message =
//       (data && typeof data === "object" && ((data as any).message || (data as any).detail)) ||
//       (typeof code === "string" && code) ||
//       `HTTP ${res.status}`;
//     console.error("❌ HTTP Error Response:", { status: res.status, code, message, data });
//     throw new ApiError(String(message), { status: res.status, code, body: data });
//   }

//   return (data as T) ?? ({} as T);
// }

// export const api = {
//   get:   <T = Json>(path: string, cfg?: { timeoutMs?: number }) =>
//     request<T>(path, { method: "GET" }, cfg),

//   /** GET con params (opcional, por comodidad). Ej:
//    *   api.getp('/integrations/google/events', { timeMin, timeMax })
//    */
//   getp:  <T = Json>(path: string, params?: Record<string, any>, cfg?: { timeoutMs?: number }) =>
//     request<T>(`${path}${qs(params)}`, { method: "GET" }, cfg),

//   post:  <T = Json>(path: string, body?: any, cfg?: { timeoutMs?: number }) =>
//     request<T>(path, { method: "POST", body }, cfg),

//   put:   <T = Json>(path: string, body?: any, cfg?: { timeoutMs?: number }) =>
//     request<T>(path, { method: "PUT", body }, cfg),

//   patch: <T = Json>(path: string, body?: any, cfg?: { timeoutMs?: number }) =>
//     request<T>(path, { method: "PATCH", body }, cfg),

//   delete:<T = Json>(path: string, cfg?: { timeoutMs?: number }) =>
//     request<T>(path, { method: "DELETE" }, cfg),
// };

