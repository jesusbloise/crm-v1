import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppState, Platform } from "react-native";

const queryClient = new QueryClient();

// refresca queries cuando vuelves a la app
function onAppStateChange(status: string) {
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
}
AppState.addEventListener("change", onAppStateChange);

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: true }} />
    </QueryClientProvider>
  );
}
