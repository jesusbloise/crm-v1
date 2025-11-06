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

/* =========
   Storage
========= */
export async function setToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}
export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function setActiveTenant(tenantId: string) {
  await AsyncStorage.setItem(TENANT_KEY, tenantId);
}
export async function getActiveTenant() {
  return (await AsyncStorage.getItem(TENANT_KEY)) || DEFAULT_TENANT;
}
export async function getActiveTenantDetails() {
  try {
    const response = await authFetch<{ 
      tenant: { 
        id: string; 
        name: string;
        owner_name?: string;
        owner_email?: string;
      } 
    }>("/tenants/current");
    return response.tenant;
  } catch (error) {
    const tenantId = await getActiveTenant();
    return { id: tenantId };
  }
}
export async function clearActiveTenant() {
  await AsyncStorage.removeItem(TENANT_KEY);
}

/* =========
   Headers
========= */
export async function authHeaders(extra: HeadersInit = {}) {
  const token = await getToken();
  const tenantId = await getActiveTenant();
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenantId ? { "X-Tenant-Id": tenantId } : {}),
    ...extra,
  } as HeadersInit;
}

/* =======================================================
   (Compat) authFetch — para llamadas sueltas.
   Para negocio usa mejor api.* de src/api/http.ts
======================================================= */
export async function authFetch<T = Json>(path: string, init: RequestInit = {}) {
  const headers = await authHeaders(init.headers || {});
  const res = await fetch(`${base()}${path}`, { ...init, headers });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return (data as T) ?? ({} as T);
}

/* =======================
   Auth endpoints
======================= */
export async function login(body: LoginBody) {
  const res = await fetch(`${base()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Error al iniciar sesión");

  if (data?.token) await setToken(data.token);
  if (data?.active_tenant) await setActiveTenant(data.active_tenant);

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

  if (data?.token) await setToken(data.token);
  if (data?.active_tenant) await setActiveTenant(data.active_tenant);

  return data;
}

export async function me() {
  return authFetch<Json>("/auth/me", { method: "GET" });
}

export async function logout() {
  await clearToken();
  await clearActiveTenant();
}

export async function isAuthenticated() {
  const t = await getToken();
  return Boolean(t);
}

/* =======================
   Workspaces helpers
======================= */

/** Carga token/tenant si ya estaban guardados al abrir la app. */
export async function bootstrapAuth() {
  const token = await getToken();
  const tenant = await getActiveTenant();
  return { token, tenant };
}

/** Lista de tenants del usuario (incluye cuál está activo). */
export async function fetchTenants() {
  return authFetch<{ 
    items: Array<{ 
      id: string; 
      name: string; 
      role: string; 
      owner_name?: string;
      owner_email?: string;
      is_active?: boolean 
    }>; 
    active_tenant?: string 
  }>(
    "/me/tenants",
    { method: "GET" }
  );
}

/** Cambia de workspace (valida membresía y devuelve nuevo JWT). */
export async function switchTenant(tenant_id: string) {
  const res = await authFetch<{ token: string; active_tenant: string; tenant?: { id: string; name: string; role: string } }>(
    "/me/tenant/switch",
    {
      method: "POST",
      body: JSON.stringify({ tenant_id }),
    }
  );
  if (res?.token) await setToken(res.token);
  if (res?.active_tenant) await setActiveTenant(res.active_tenant);
  return res;
}

/** Obtiene el rol del usuario en el workspace activo. */
export async function getCurrentUserRole() {
  try {
    const tenants = await fetchTenants();
    const activeTenant = await getActiveTenant();
    const current = tenants.items?.find(t => t.id === activeTenant);
    return current?.role || null;
  } catch (error) {
    console.warn("Error getting user role:", error);
    return null;
  }
}

/** Verifica si el usuario actual es admin u owner. */
export async function isAdmin() {
  const role = await getCurrentUserRole();
  return role === "admin" || role === "owner";
}

/* =======================
   Admin functions
======================= */

/** Obtiene todos los usuarios de un workspace (solo admin/owner). */
export async function getWorkspaceUsers(tenantId: string) {
  return authFetch<{ 
    tenant: { id: string; name: string; created_by: string; created_at: number };
    items: Array<{ 
      id: string; 
      name: string; 
      email: string; 
      avatar_url?: string;
      headline?: string;
      role: string;
      member_since: number;
      member_updated_at: number;
    }> 
  }>(
    `/tenants/${tenantId}/members`,
    { method: "GET" }
  );
}

/** Cambia el rol de un usuario en el workspace (solo admin/owner). */
export async function changeUserRole(tenantId: string, userId: string, role: "owner" | "admin" | "member") {
  return authFetch<{ 
    ok: boolean; 
    message: string;
    member: {
      id: string;
      name: string;
      email: string;
      avatar_url?: string;
      role: string;
      updated_at: number;
    }
  }>(
    `/tenants/${tenantId}/members/${userId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }
  );
}

/** Obtiene TODOS los usuarios registrados en el sistema (solo admin/owner). */
export async function getAllUsers() {
  return authFetch<{ 
    total: number;
    items: Array<{ 
      id: string; 
      name: string; 
      email: string; 
      avatar_url?: string;
      headline?: string;
      is_active: boolean;
      created_at: number;
      updated_at: number;
      last_login_at?: number;
      memberships: Array<{ tenant_id: string; role: string }>;
    }> 
  }>(
    `/admin/users`,
    { method: "GET" }
  );
}

/** Activa o desactiva un usuario (solo admin/owner). */
export async function toggleUserActive(userId: string) {
  return authFetch<{ 
    ok: boolean; 
    message: string;
    user: {
      id: string;
      name: string;
      email: string;
      avatar_url?: string;
      is_active: boolean;
      updated_at: number;
      memberships: Array<{ tenant_id: string; role: string }>;
    }
  }>(
    `/admin/users/${userId}/toggle`,
    { method: "PATCH" }
  );
}

/* =======================
   Shorthands opcionales
======================= */
export async function apiGet<T = Json>(path: string) {
  return authFetch<T>(path, { method: "GET" });
}
export async function apiPost<T = Json>(path: string, body: Json) {
  return authFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
}
export async function apiPut<T = Json>(path: string, body: Json) {
  return authFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });
}
export async function apiDelete<T = Json>(path: string) {
  return authFetch<T>(path, { method: "DELETE" });
}

