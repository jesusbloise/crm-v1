// src/api/auth.ts
import { getBaseURL } from "@/src/config/baseUrl";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** =========================
 *  Constantes de storage
 * ========================= */
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
      };
    }>("/tenants/current");
    return response.tenant;
  } catch {
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
   authFetch — centraliza headers y manejo de errores
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
    // Limpieza defensiva en 401/403
    if (res.status === 401 || res.status === 403) {
      await clearToken().catch(() => {});
      // OJO: no navegamos aquí; solo limpiamos para evitar loops
    }
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
      is_active?: boolean;
    }>;
    active_tenant?: string;
  }>("/me/tenants", { method: "GET" });
}

/** Cambia de workspace (valida membresía y devuelve nuevo JWT). */
export async function switchTenant(tenant_id: string) {
  const res = await authFetch<{
    token: string;
    active_tenant: string;
    tenant?: { id: string; name: string; role: string };
  }>("/me/tenant/switch", {
    method: "POST",
    body: JSON.stringify({ tenant_id }),
  });
  if (res?.token) await setToken(res.token);
  if (res?.active_tenant) await setActiveTenant(res.active_tenant);
  return res;
}

/** 
 * Elimina un workspace 
 * 🔒 Solo admin/owner del workspace pueden eliminarlo
 */
export async function deleteTenant(tenant_id: string) {
  return authFetch<{
    ok: boolean;
    message: string;
    deleted_workspace: { id: string; name: string };
  }>(`/tenants/${tenant_id}`, {
    method: "DELETE",
  });
}

/** Obtiene el rol del usuario en el workspace activo (vía endpoint dedicado). */
export async function getRoleNow(): Promise<"owner" | "admin" | "member" | null> {
  try {
    const data = await authFetch<{ tenant_id: string | null; role: string | null }>(
      "/tenants/role?_=" + Date.now(),
      { method: "GET" }
    );
    const r = (data?.role || "").toLowerCase();
    if (r === "owner" || r === "admin" || r === "member") return r;
    return null;
  } catch (e) {
    return null;
  }
}

/** Fallback: deduce el rol leyendo /me/tenants. */
export async function getCurrentUserRole() {
  try {
    const tenants = await fetchTenants();
    const activeTenant = await getActiveTenant();
    const current = tenants.items?.find((t) => t.id === activeTenant);
    return (current?.role || null) as string | null;
  } catch (error) {
    console.warn("Error getting user role:", error);
    return null;
  }
}

/** Verifica si el usuario actual es admin u owner (usa roleNow y cae a fallback). */
export async function isAdmin() {
  const roleNow = await getRoleNow();
  if (roleNow) return roleNow === "admin" || roleNow === "owner";
  const role = await getCurrentUserRole();
  return role === "admin" || role === "owner";
}

/* =======================
   Admin functions (alineadas con la UI)
======================= */

/** Lista TODOS los usuarios (para el panel de admin). */
export async function adminListUsers() {
  // Respuesta esperada por app/more/admin-users.tsx: { users: User[] }
  return authFetch<{ users: any[] }>("/admin/users", { method: "GET" });
}

/** Activa/Desactiva un usuario. */
export async function adminToggleActive(userId: string) {
  // POST /admin/users/:userId/toggle-active
  return authFetch<{ ok?: boolean; message?: string }>(
    `/admin/users/${userId}/toggle-active`,
    { method: "POST" }
  );
}

/** Cambia el rol de un usuario en un workspace. */
export async function adminChangeRole(
  userId: string,
  tenantId: string,
  newRole: "admin" | "member"
) {
  // POST /admin/users/:userId/change-role  { tenantId, newRole }
  return authFetch<{ ok?: boolean; message?: string }>(
    `/admin/users/${userId}/change-role`,
    {
      method: "POST",
      body: JSON.stringify({ tenantId, newRole }),
    }
  );
}

/* =======================
   Extra opcionales
======================= */
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
    }>;
  }>(`/tenants/${tenantId}/members`, { method: "GET" });
}

export async function changeUserRole(
  tenantId: string,
  userId: string,
  role: "owner" | "admin" | "member"
) {
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
    };
  }>(`/tenants/${tenantId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

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
    }>;
  }>("/admin/users", { method: "GET" });
}

export async function toggleUserActive(userId: string) {
  // Compat antigua (PATCH /admin/users/:id/toggle)
  // Mejor usar adminToggleActive(userId)
  return authFetch<{ ok: boolean; message: string; user: any }>(
    `/admin/users/${userId}/toggle`,
    { method: "PATCH" }
  );
}

/* =======================
   Shorthands
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
