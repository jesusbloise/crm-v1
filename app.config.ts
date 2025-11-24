import "dotenv/config";
import type { ExpoConfig } from "expo/config";
import appJson from "./app.json";

const expo = (appJson as any).expo ?? {};

const isProd = process.env.EXPO_PUBLIC_ENV === "production";

const config: ExpoConfig = {
  ...expo,

  runtimeVersion: { policy: "sdkVersion" },

  updates: {
    url: "https://u.expo.dev/6dc0a3ba-017a-4452-9ee9-65b3c3199fcd",
  },

  extra: {
    ...(expo.extra ?? {}),

    // 👇 AQUÍ definimos SIEMPRE la URL del backend
    API_URL: isProd
      ? "https://crm-v1-b5rg.onrender.com"        // 🔴 PRODUCCIÓN (Render)
      : process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000", // 🟢 LOCAL

    HTTP_TIMEOUT: process.env.EXPO_PUBLIC_HTTP_TIMEOUT_MS ?? "25000",
    MULTI_TENANT_ENABLED: process.env.MULTI_TENANT_ENABLED ?? "false",
    DEFAULT_TENANT_ID: process.env.DEFAULT_TENANT_ID ?? "demo-tenant",
    DEFAULT_TENANT: process.env.DEFAULT_TENANT ?? "demo",

    EXPO_PUBLIC_GOOGLE_CLIENT_ID:
      process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ??
      (expo.extra?.EXPO_PUBLIC_GOOGLE_CLIENT_ID as any),

    eas: {
      ...(expo.extra?.eas ?? {}),
      projectId: "6dc0a3ba-017a-4452-9ee9-65b3c3199fcd",
    },
  },
};

export default config;
// // app.config.ts
// import "dotenv/config";
// import type { ExpoConfig } from "expo/config";
// import appJson from "./app.json";

// // Heredamos TODO desde app.json (name, slug, android.package, icons, scheme, etc.)
// const expo = (appJson as any).expo ?? {};

// const config: ExpoConfig = {
//   ...expo,

//   // Necesario para EAS Update (no afecta tu APK ni Web)
//   runtimeVersion: { policy: "sdkVersion" },

//   // 👇 NUEVO: URL de EAS Update (la que te mostró el comando)
//   updates: {
//     url: "https://u.expo.dev/6dc0a3ba-017a-4452-9ee9-65b3c3199fcd",
//   },

//   extra: {
//   API_URL: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000",
//   HTTP_TIMEOUT: process.env.EXPO_PUBLIC_HTTP_TIMEOUT_MS ?? "25000",
//   MULTI_TENANT_ENABLED: process.env.MULTI_TENANT_ENABLED ?? "false",
//   DEFAULT_TENANT_ID: process.env.DEFAULT_TENANT_ID ?? "demo-tenant",
//   DEFAULT_TENANT: process.env.DEFAULT_TENANT ?? "demo",
//   EXPO_PUBLIC_GOOGLE_CLIENT_ID:
//     process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ??
//     (expo.extra?.EXPO_PUBLIC_GOOGLE_CLIENT_ID as any),

//   eas: {
//     projectId: "6dc0a3ba-017a-4452-9ee9-65b3c3199fcd",
//   }
// }

// };

// export default config;
