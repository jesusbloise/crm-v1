// src/features/multitenant/index.ts
import { flags } from "@/src/config/flags";

export function isMultiTenantOn() {
  return flags.multiTenantEnabled;
}
