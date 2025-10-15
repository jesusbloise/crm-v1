// src/config/flags.ts
import Constants from "expo-constants";

function readEnv(name: string): string | undefined {
  // 1) process.env (web/metro con plugins o EXPO_PUBLIC_)
  const fromProcess = (process.env as any)?.[name];
  if (typeof fromProcess === "string") return fromProcess;

  // 2) EXPO_PUBLIC_*
  const fromPublic = (process.env as any)?.[`EXPO_PUBLIC_${name}`];
  if (typeof fromPublic === "string") return fromPublic;

  // 3) app.json/app.config extra
  // @ts-ignore - distintas claves según versión de expo
  const extra = Constants?.expoConfig?.extra || Constants?.manifest?.extra;
  if (extra && typeof extra[name] === "string") return extra[name];

  return undefined;
}

const raw = (readEnv("MULTI_TENANT_ENABLED") || "false").toString().toLowerCase();

export const flags = {
  multiTenantEnabled: raw === "true" || raw === "1",
};
