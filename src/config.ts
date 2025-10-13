// src/config.ts
import { Platform } from "react-native";

const envApi = process.env.EXPO_PUBLIC_API_URL; // opcional, sobreescribe todo

// ⚙️ Cambia esto a TU IP LAN si quieres hardcodear
const LAN_IP = "192.168.229.191"; // <- tu ipconfig
const PORT = 4000;

function resolveBase() {
  if (envApi) return envApi; // si la defines, manda ella

  if (Platform.OS === "web") {
    // web puede hablarle a localhost sin problema
    return `http://localhost:${PORT}`;
  }

  // simulador iOS (Mac): localhost funciona
  if (Platform.OS === "ios") {
    return `http://localhost:${PORT}`;
  }

  // Android:
  // - Emulador oficial: 10.0.2.2
  // - Dispositivo físico: usa la IP LAN de tu PC
  if (__DEV__) {
    // Si estás en emulador Android, descomenta la línea de 10.0.2.2
    // return `http://10.0.2.2:${PORT}`;
  }
  return `http://${LAN_IP}:${PORT}`;
}

export const API_BASE = resolveBase();
