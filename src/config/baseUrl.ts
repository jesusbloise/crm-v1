// src/config/baseUrl.ts
import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Si defines EXPO_PUBLIC_API_URL, se usa tal cual (https://api.tuapp.com, http://192.168.1.10:3001, etc.)
 * Si no, se infiere según plataforma y entorno de Expo.
 */
export function getBaseURL() {
  // 1) Override explícito por env
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit && explicit.trim()) return explicit.trim();

  // 2) Puerto por defecto (puedes cambiarlo con EXPO_PUBLIC_API_PORT si quieres)
  const PORT = Number(process.env.EXPO_PUBLIC_API_PORT || 3001);

  // 3) Web (cuando corres con expo web / vite / next)
  if (Platform.OS === "web") {
    // Si sirve en el mismo host, usa hostname actual y puerto por defecto
    const host = (typeof window !== "undefined" && window.location?.hostname) || "localhost";
    return `http://${host}:${PORT}`;
  }

  // 4) Expo Go en LAN: tomar host del bundler
  const hostUri =
    (Constants as any)?.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoGo?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost ||
    "";

  const lanHost = typeof hostUri === "string" ? hostUri.split(":")[0] : "";

  if (lanHost && !/^localhost$|^127\.0\.0\.1$/i.test(lanHost)) {
    // Dispositivo físico o simulador conectado a tu LAN
    return `http://${lanHost}:${PORT}`;
  }

  // 5) Emulador Android
  if (Platform.OS === "android") {
    // 10.0.2.2 => host del PC desde el emulador
    return `http://10.0.2.2:${PORT}`;
  }

  // 6) iOS Simulator / fallback
  return `http://localhost:${PORT}`;
}

