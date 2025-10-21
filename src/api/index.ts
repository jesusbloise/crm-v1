// src/api/index.ts
// 🔁 Shim hacia el cliente nuevo con headers (token + X-Tenant-Id)

import { getBaseURL } from "@/src/config/baseUrl";
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  authFetch,
  // re-export útiles
  authHeaders,
  clearToken,
  isAuthenticated,
  login,
  logout,
  me,
  register,
  setActiveTenant,
  setToken,
} from "./auth";
import { api } from "./http";

export { api, getBaseURL };

/**
 * Compat: permite a código legacy “inyectar” token/tenant con la misma API antigua.
 * Ahora persiste en AsyncStorage y el cliente nuevo (./http) los usará en headers.
 */
export async function setAuth(token?: string, tenant?: string) {
  if (token) await setToken(token);
  else await clearToken();

  if (tenant) await setActiveTenant(tenant);
}

// Re-exporta helpers por conveniencia (por si existen imports desde aquí)
export {
  apiDelete, apiGet,
  apiPost,
  apiPut, authFetch, authHeaders, isAuthenticated, login, logout, me, register
};

