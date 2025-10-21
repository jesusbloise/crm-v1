// src/config/index.ts
import Constants from "expo-constants";
import { Platform } from "react-native";

export function getBaseURL() {
  if (Platform.OS === "web") return "http://localhost:4000";

  const hostUri =
    (Constants as any)?.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoGo?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost ||
    "";
  const lanHost = typeof hostUri === "string" ? hostUri.split(":")[0] : "";

  if (lanHost && !/^localhost|127\.0\.0\.1$/i.test(lanHost)) {
    return `http://${lanHost}:4000`;
  }
  if (Platform.OS === "android") return "http://10.0.2.2:4000";
  return "http://localhost:4000";
}
