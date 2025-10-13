// app/_layout.tsx
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

const queryClient = new QueryClient();

const COLORS = {
  bg: "#0E0F11",   // fondo app
  text: "#EAEAEA", // texto claro
  accent: "#FF6A00",
};

// Mantener las queries frescas cuando la app vuelve a primer plano (igual que antes)
function useAppFocusSync() {
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (Platform.OS !== "web") {
        focusManager.setFocused(state === "active");
      }
    });
    return () => {
      // @ts-ignore: RN nuevas versiones devuelven objeto con remove()
      sub?.remove?.();
    };
  }, []);
}

export default function RootLayout() {
  useAppFocusSync();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Status bar clara sobre fondo oscuro */}
      <StatusBar style="light" />

      <Stack
        screenOptions={{
          // Fondo de TODAS las pantallas (iOS/Android/Web dentro del árbol RN)
          contentStyle: { backgroundColor: COLORS.bg },

          // Header oscuro y sin sombra
          headerStyle: { backgroundColor: COLORS.bg },
          headerTitleStyle: { color: COLORS.text, fontWeight: "800" },
          headerTintColor: COLORS.text, // color de back/íconos
          headerShadowVisible: false,
        }}
      />
    </QueryClientProvider>
  );
}


// import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
// import { Stack } from "expo-router";
// import { StatusBar } from "expo-status-bar";
// import { AppState, Platform } from "react-native";

// const queryClient = new QueryClient();

// // refresca queries cuando vuelves a la app
// function onAppStateChange(status: string) {
//   if (Platform.OS !== "web") {
//     focusManager.setFocused(status === "active");
//   }
// }
// AppState.addEventListener("change", onAppStateChange);

// export default function RootLayout() {
//   return (
//     <QueryClientProvider client={queryClient}>
//       <StatusBar style="auto" />
//       <Stack screenOptions={{ headerShown: true }} />
//     </QueryClientProvider>
//   );
// }
