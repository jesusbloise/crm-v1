// src/google/oauth.ts
import * as AuthSession from "expo-auth-session";
import { Platform } from "react-native";

export const discovery = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID!;
if (!GOOGLE_CLIENT_ID) {
  console.warn(
    "Falta EXPO_PUBLIC_GOOGLE_CLIENT_ID en .env. Reinicia con: npx expo start -c"
  );
}

/**
 * REDIRECTS
 * - Web: usa EXACTAMENTE el origin visible en el navegador (debe estar en Google Console).
 * - Nativo: usa makeRedirectUri (Expo scheme). Asegúrate de tener el scheme configurado en app.json/app.config.
 */
const WEB_REDIRECT =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:8081";

const NATIVE_REDIRECT = AuthSession.makeRedirectUri({
  preferLocalhost: true,
  isTripleSlashed: true,
});

export const GOOGLE_REDIRECT_URI =
  Platform.OS === "web" ? WEB_REDIRECT : NATIVE_REDIRECT;

if (process.env.NODE_ENV !== "production") {
  console.log("Google CLIENT_ID:", GOOGLE_CLIENT_ID);
  console.log("Google REDIRECT_URI:", GOOGLE_REDIRECT_URI);
}

/**
 * Lanza el flujo OAuth con PKCE.
 * Devuelve { code, verifier, redirectUri } para que el backend haga el intercambio.
 */
export async function startGoogleAuth(): Promise<{
  code: string;
  verifier: string;
  redirectUri: string;
}> {
  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_CLIENT_ID, // Debe ser un CLIENT_ID de tipo "Web application"
    redirectUri: GOOGLE_REDIRECT_URI, // Debe coincidir EXACTO con lo autorizado en Google
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
    extraParams: {
      // Para forzar refresh_token en la mayoría de los casos
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
  });

  // En Web NO usamos proxy. En Nativo podemos dejar que Expo lo maneje (sin useProxy).
  const res = await request.promptAsync(discovery);

  if (res.type === "success" && res.params.code) {
    return {
      code: res.params.code,
      verifier: request.codeVerifier!,
      redirectUri: GOOGLE_REDIRECT_URI,
    };
  }

  // Mejora de debugging
  if (res.type === "error") {
    const msg =
      (res.params && (res.params.error_description || res.params.error)) ||
      "Google auth error";
    throw new Error(msg);
  }

  throw new Error("Google login cancelado o fallido");
}
