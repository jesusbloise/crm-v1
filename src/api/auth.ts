// src/api/auth.ts
import { getBaseURL } from "@/src/config/baseUrl";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "auth.token";
const TENANT_KEY = "auth.tenant";
const DEFAULT_TENANT = "demo";

export type LoginBody = { email: string; password: string };
export type RegisterBody = { name: string; email: string; password: string };

type Json = Record<string, any>;

function base() {
  return getBaseURL();
}

/** Guarda/lee token */
export async function setToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}
export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

/** Tenant activo (lo mandamos por X-Tenant-Id) */
export async function setActiveTenant(tenantId: string) {
  await AsyncStorage.setItem(TENANT_KEY, tenantId);
}
export async function getActiveTenant() {
  return (await AsyncStorage.getItem(TENANT_KEY)) || DEFAULT_TENANT;
}
export async function clearActiveTenant() {
  await AsyncStorage.removeItem(TENANT_KEY);
}

/** Headers con auth + tenant */
export async function authHeaders(extra: HeadersInit = {}) {
  const token = await getToken();
  const tenant = await getActiveTenant();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenant ? { "X-Tenant-Id": tenant } : {}),
    ...extra,
  } as HeadersInit;
}

/** Wrapper de fetch que inyecta headers y parsea JSON */
export async function authFetch<T = Json>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = await authHeaders(init.headers || {});
  const res = await fetch(`${base()}${path}`, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };

  if (!res.ok) {
    const msg = (data as any)?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

/* -------------------------
   Auth endpoints
-------------------------- */

export async function login(body: LoginBody) {
  const res = await fetch(`${base()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Error al iniciar sesión");

  if (data?.active_tenant) {
    await setActiveTenant(data.active_tenant);
  }
  if (data?.token) {
    await setToken(data.token);
  }
  return data;
}

export async function register(body: RegisterBody) {
  const res = await fetch(`${base()}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Error al registrar");

  if (data?.active_tenant) {
    await setActiveTenant(data.active_tenant);
  }
  if (data?.token) {
    await setToken(data.token);
  }
  return data;
}

export async function me() {
  // usa el wrapper para enviar Authorization + X-Tenant-Id
  return authFetch<Json>("/auth/me");
}

export async function logout() {
  // 🔐 limpiar TODO rastro de sesión
  await clearToken();
  await clearActiveTenant();
}

/* -------------------------
   Helpers de UI
-------------------------- */

export async function isAuthenticated() {
  const t = await getToken();
  return Boolean(t);
}

/** Ejemplo: llamada de negocio con auth
 *  await apiGet("/contacts");
 */
export async function apiGet<T = Json>(path: string) {
  return authFetch<T>(path, { method: "GET" });
}
export async function apiPost<T = Json>(path: string, body: Json) {
  return authFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
export async function apiPut<T = Json>(path: string, body: Json) {
  return authFetch<T>(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
export async function apiDelete<T = Json>(path: string) {
  return authFetch<T>(path, { method: "DELETE" });
}
