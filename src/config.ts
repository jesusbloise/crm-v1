
// src/config.ts
import { isMultiTenantOn } from "@/src/features/multitenant";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/** Permite override por env (por ejemplo en web o builds) */
const envApi = process.env.EXPO_PUBLIC_API_URL;

/** ⚙️ Cambia esto a TU IP LAN si usas dispositivo Android físico en dev */
const LAN_IP = "192.168.229.191";
const PORT = 4000;

function resolveBase() {
  // 1) Si viene por env, manda esa
  if (envApi) return envApi;

  // 2) Web puede hablar a localhost
  if (Platform.OS === "web") return `http://localhost:${PORT}`;

  // 3) iOS (simulador) → localhost funciona
  if (Platform.OS === "ios") return `http://localhost:${PORT}`;

  // 4) Android:
  //    - Emulador oficial: 10.0.2.2
  //    - Dispositivo físico: IP LAN de tu PC
  if (__DEV__) {
    // Si usas emulador oficial, descomenta:
    // return `http://10.0.2.2:${PORT}`;
  }
  return `http://${LAN_IP}:${PORT}`;
}

export const API_BASE = resolveBase();

/** Lee el tenant actual desde AsyncStorage. */
async function currentTenantId(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem("tenant_id");
    // Si el flag MT está ON y no hay valor, usa uno de prueba (opcional)
    if (isMultiTenantOn()) return v || "demo-tenant";
    // Si MT está OFF, no enviamos header
    return null;
  } catch {
    return isMultiTenantOn() ? "demo-tenant" : null;
  }
}

/** Wrapper fetch que añade JSON + x-tenant-id */
export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const tenantId = await currentTenantId();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (tenantId) headers["x-tenant-id"] = tenantId;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  // Manejo de error simple
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg = text || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  // Si no hay cuerpo (204/empty), evita JSON.parse de vacío
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return undefined as T;

  return (await res.json()) as T;
}

/* Helpers opcionales (útiles para tus APIs) */
export const api = {
  get: <T = any>(path: string) => apiFetch<T>(path),
  post: <T = any>(path: string, body?: any) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T = any>(path: string, body?: any) =>
    apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del:  <T = any>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

export const TENANT_ID_HEADER = "x-tenant-id";

