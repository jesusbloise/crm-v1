// server/lib/google.js
const { google } = require("googleapis");

/** ========= Helpers de entorno ========= */
function envClientId() {
  // Permite usar GOOGLE_CLIENT_ID_WEB o GOOGLE_CLIENT_ID
  return (
    process.env.GOOGLE_CLIENT_ID_WEB ||
    process.env.GOOGLE_CLIENT_ID ||
    null
  );
}

function envClientSecret() {
  // Opcional: si tienes cliente "Web", es buena práctica usar el secret
  return (
    process.env.GOOGLE_CLIENT_SECRET_WEB ||
    process.env.GOOGLE_CLIENT_SECRET ||
    null
  );
}

function envRedirectUri() {
  // Debe coincidir EXACTO con el origin/redirect que usa tu front
  return process.env.GOOGLE_REDIRECT_URI || null;
}

/** Normaliza el redirect (prefiere el que llega del cliente) */
function resolveRedirectUri(overrideRedirectUri) {
  const r = overrideRedirectUri || envRedirectUri();
  if (!r) throw new Error("Falta GOOGLE_REDIRECT_URI (o redirectUri en la llamada)");
  return r;
}

/** ========= Cliente OAuth2 =========
 * Soporta ambos flujos:
 *  - PKCE: client_secret = undefined
 *  - Clásico Web: client_secret presente
 */
function oauthClient(overrideRedirectUri) {
  const clientId = envClientId();
  if (!clientId) throw new Error("Falta GOOGLE_CLIENT_ID_WEB / GOOGLE_CLIENT_ID en .env");
  const redirectUri = resolveRedirectUri(overrideRedirectUri);
  const clientSecret = envClientSecret() || undefined; // si no hay, usa PKCE

  if (process.env.NODE_ENV !== "production") {
    console.log("🔧 Google OAuth client", {
      clientId: clientId.slice(0, 8) + "…",
      hasSecret: !!clientSecret,
      redirectUri,
      mode: clientSecret ? "web+secret" : "pkce",
    });
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** ========= Intercambio code → tokens (PKCE o clásico) ========= */
async function exchangeCodeForTokens({ code, codeVerifier, redirectUri }) {
  if (!code) throw new Error("missing_code");
  const oauth2 = oauthClient(redirectUri);

  const payload = {
    code,
    redirect_uri: resolveRedirectUri(redirectUri),
    // Si viene PKCE, lo incluimos; si no, Google usa client_secret si existe
    codeVerifier: codeVerifier || undefined,
  };

  try {
    const { tokens } = await oauth2.getToken(payload);
    if (process.env.NODE_ENV !== "production") {
      console.log(
        "🔐 Tokens recibidos:",
        JSON.stringify(
          {
            has_access: !!tokens?.access_token,
            has_refresh: !!tokens?.refresh_token,
            scope: tokens?.scope,
            expires_in_s: tokens?.expiry_date
              ? Math.max(0, Math.floor((tokens.expiry_date - Date.now()) / 1000))
              : null,
            id_token: tokens?.id_token ? "yes" : "no",
          },
          null,
          2
        )
      );
    }
    return tokens;
  } catch (e) {
    const msg =
      e?.response?.data?.error_description ||
      e?.response?.data?.error ||
      e?.message ||
      String(e);

    if (process.env.NODE_ENV !== "production") {
      console.error("❌ Google getToken error:", e?.response?.data || e);
    }

    // Tips comunes
    const hints = [];
    if (/invalid_grant/i.test(msg)) {
      hints.push(
        "Revisa que redirectUri del servidor sea EXACTAMENTE el mismo que usó el cliente.",
        "Si ya otorgaste permisos antes sin prompt=consent, puede que no llegue refresh_token; vuelve a consentir.",
        "Verifica que el authorization code no haya sido usado o expirado."
      );
    }
    throw Object.assign(new Error("google_token_exchange_failed"), {
      detail: msg,
      hints,
    });
  }
}

/** ========= Client Calendar desde refresh_token ========= */
async function getCalendarClientFromRefresh(refreshToken, redirectUri) {
  if (!refreshToken) throw new Error("missing_refresh_token");
  const oauth2 = oauthClient(redirectUri);
  oauth2.setCredentials({ refresh_token: refreshToken });

  // (Opcional) fuerza un refresh inmediato para detectar errores temprano
  try {
    await oauth2.getAccessToken();
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("⚠️ Falló refresh previo a Calendar:", e?.response?.data || e?.message || e);
    }
    // seguimos; googleapis refrescará al primer request si puede
  }

  return google.calendar({ version: "v3", auth: oauth2 });
}

/** Obtener access_token fresco a partir de refresh_token (útil para llamadas manuales) */
async function getAccessTokenFromRefresh(refreshToken, redirectUri) {
  if (!refreshToken) throw new Error("missing_refresh_token");
  const oauth2 = oauthClient(redirectUri);
  oauth2.setCredentials({ refresh_token: refreshToken });
  const { token } = await oauth2.getAccessToken();
  if (!token) throw new Error("unable_to_refresh_access_token");
  return token;
}

/** ========= Email desde id_token (base64url safe) ========= */
function base64UrlDecode(input) {
  // Convierte base64url a base64 estándar
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 2 ? "==" : b64.length % 4 === 3 ? "=" : "";
  return Buffer.from(b64 + pad, "base64").toString();
}

function getEmailFromIdToken(idToken) {
  if (!idToken) return null;
  try {
    const [, payloadB64] = idToken.split(".");
    if (!payloadB64) return null;
    const json = base64UrlDecode(payloadB64);
    const payload = JSON.parse(json);
    return payload?.email || null;
  } catch {
    return null;
  }
}

/** ========= Revocar refresh_token ========= */
async function revokeRefreshToken(refreshToken, redirectUri) {
  if (!refreshToken) return;
  try {
    const oauth2 = oauthClient(redirectUri);
    await oauth2.revokeToken(refreshToken);
    if (process.env.NODE_ENV !== "production") {
      console.log("♻️  Google refresh_token revocado");
    }
  } catch (e) {
    console.warn("No se pudo revocar refresh_token:", e?.message || e);
  }
}

module.exports = {
  oauthClient,
  exchangeCodeForTokens,
  getCalendarClientFromRefresh,
  getAccessTokenFromRefresh,
  getEmailFromIdToken,
  revokeRefreshToken,
};
