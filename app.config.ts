// app.config.ts
import "dotenv/config";
import type { ExpoConfig } from "expo/config";
import appJson from "./app.json";

// Heredamos TODO desde app.json (name, slug, android.package, icons, scheme, etc.)
const expo = (appJson as any).expo ?? {};

const config: ExpoConfig = {
  ...expo,

  // Necesario para EAS Update (no afecta tu APK ni Web)
  runtimeVersion: { policy: "sdkVersion" },

  // 👇 NUEVO: URL de EAS Update (la que te mostró el comando)
  updates: {
    url: "https://u.expo.dev/6dc0a3ba-017a-4452-9ee9-65b3c3199fcd",
  },

  extra: {
    ...(expo.extra ?? {}),
    // Conserva tu CLIENT_ID, permitiendo override por env si está definido
    EXPO_PUBLIC_GOOGLE_CLIENT_ID:
      process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ??
      (expo.extra?.EXPO_PUBLIC_GOOGLE_CLIENT_ID as any),

    // EAS projectId fijo para evitar avisos
    eas: {
      ...(expo.extra?.eas ?? {}),
      projectId: "6dc0a3ba-017a-4452-9ee9-65b3c3199fcd",
    },
  },
};

export default config;
