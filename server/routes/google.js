// server/routes/google.js
const { Router } = require("express");
const db = require("../db/connection");
const {
  exchangeCodeForTokens,
  getCalendarClientFromRefresh,
} = require("../lib/google");

const r = Router();

/** Util */
function asUserId(req) {
  return String(req.user?.id ?? "");
}

/** Util: obtiene las credenciales Google del user actual */
function getUserGoogleRow(userId) {
  return db
    .prepare(
      `SELECT id, email, google_email, google_refresh_token, google_calendar_id
       FROM users WHERE id = ?`
    )
    .get(String(userId));
}

/** GET /integrations/google/me */
r.get("/integrations/google/me", (req, res) => {
  try {
    const uid = asUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const row = getUserGoogleRow(uid);
    if (!row || !row.google_refresh_token) {
      return res.json({ connected: false, hasRefresh: false });
    }
    return res.json({
      connected: true,
      email: row.google_email || row.email || null,
      calendarId: row.google_calendar_id || null,
      hasRefresh: !!row.google_refresh_token,
    });
  } catch (e) {
    console.error("google/me error:", e);
    return res.status(500).json({ error: "me_failed" });
  }
});

/**
 * POST /integrations/google/exchange
 * Body: { code, verifier, redirectUri }
 * Intercambia authorization code+verifier por refresh_token y guarda email.
 */
r.post("/integrations/google/exchange", async (req, res) => {
  try {
    const uid = asUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const { code, verifier, redirectUri } = req.body || {};
    if (!code || !verifier || !redirectUri) {
      return res.status(400).json({ error: "missing_params", need: ["code", "verifier", "redirectUri"] });
    }

    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: verifier,
      redirectUri, // debe coincidir EXACTO con el usado en el auth request
    });

    let email = null;
    if (tokens?.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokens.id_token.split(".")[1], "base64").toString()
        );
        email = payload?.email || null;
      } catch (e) {
        console.warn("No se pudo parsear id_token:", e?.message);
      }
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("🔐 exchange tokens:", {
        has_access: !!tokens?.access_token,
        has_refresh: !!tokens?.refresh_token,
        scopes: tokens?.scope,
      });
    }

    if (!tokens?.refresh_token) {
      return res.status(400).json({ error: "no_refresh_token_returned" });
    }

    db.prepare(
      `UPDATE users
         SET google_refresh_token = ?,
             google_email = COALESCE(?, google_email)
       WHERE id = ?`
    ).run(tokens.refresh_token, email, uid);

    return res.json({ ok: true, email, hasRefresh: true });
  } catch (e) {
    const detail = e?.response?.data || e?.data || e?.message || e;
    console.error("exchange error:", detail);
    return res.status(500).json({ error: "exchange_failed", detail });
  }
});

/**
 * GET /integrations/google/calendars
 * Lista los calendarios del usuario (CalendarList).
 */
r.get("/integrations/google/calendars", async (req, res) => {
  try {
    const uid = asUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const row = getUserGoogleRow(uid);
    if (!row?.google_refresh_token) {
      return res.status(401).json({ error: "google_not_connected" });
    }

    const cal = await getCalendarClientFromRefresh(row.google_refresh_token);
    const { data } = await cal.calendarList.list({
      minAccessRole: "reader",
      maxResults: 250,
      showDeleted: false,
    });

    const items =
      (data.items || []).map((c) => ({
        id: c.id,
        summary: c.summary,
        primary: !!c.primary,
        accessRole: c.accessRole,
        backgroundColor: c.backgroundColor,
      })) ?? [];

    return res.json({ items });
  } catch (e) {
    const detail = e?.response?.data || e?.data || e?.message || e;
    console.error("calendars error:", detail);
    return res.status(500).json({ error: "calendars_failed", detail });
  }
});

/**
 * POST /integrations/google/calendars/use
 * Body: { calendarId }
 * Guarda el calendario preferido para este usuario (en users.google_calendar_id).
 */
r.post("/integrations/google/calendars/use", (req, res) => {
  try {
    const uid = asUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const { calendarId } = req.body || {};
    if (!calendarId) return res.status(400).json({ error: "missing_calendarId" });

    db.prepare(
      `UPDATE users SET google_calendar_id = ? WHERE id = ?`
    ).run(String(calendarId).trim(), uid);

    return res.json({ ok: true });
  } catch (e) {
    console.error("use calendar error:", e);
    return res.status(500).json({ error: "set_calendar_failed" });
  }
});

/**
 * GET /integrations/google/events?timeMin=...&timeMax=...&calendarId=optional
 * Devuelve eventos del calendario preferido o "primary" si no hay preferido.
 */
r.get("/integrations/google/events", async (req, res) => {
  try {
    const uid = asUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const row = getUserGoogleRow(uid);
    if (!row?.google_refresh_token) {
      return res.status(401).json({ error: "google_not_connected" });
    }

    // Normaliza rango de fechas
    const now = Date.now();
    let timeMin = req.query.timeMin ? String(req.query.timeMin) : new Date(now - 7 * 86400000).toISOString();
    let timeMax = req.query.timeMax ? String(req.query.timeMax) : new Date(now + 14 * 86400000).toISOString();
    if (new Date(timeMin) > new Date(timeMax)) {
      const tmp = timeMin; timeMin = timeMax; timeMax = tmp;
    }

    const calendarId =
      (req.query.calendarId ? String(req.query.calendarId).trim() : "") ||
      row.google_calendar_id ||
      "primary";

    const cal = await getCalendarClientFromRefresh(row.google_refresh_token);

    const { data } = await cal.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 2500,
    });

    return res.json({ items: data.items || [] });
  } catch (e) {
    const detail = e?.response?.data || e?.data || e?.message || e;
    console.error("events error:", detail);
    return res.status(500).json({ error: "events_failed", detail });
  }
});

/** ===== DEV ONLY =====
 * GET /integrations/google/status
 * Muestra estado rápido (no expone el token completo).
 */
r.get("/integrations/google/status", (req, res) => {
  try {
    const uid = asUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const row = getUserGoogleRow(uid);
    if (!row) return res.json({ exists: false });

    const mask = (t) => (t ? t.slice(0, 6) + "…" + t.slice(-4) : null);
    return res.json({
      exists: true,
      userId: row.id,
      email: row.email,
      google_email: row.google_email || null,
      hasRefresh: !!row.google_refresh_token,
      refresh_masked: mask(row.google_refresh_token),
      calendarId: row.google_calendar_id || null,
    });
  } catch (e) {
    console.error("status error:", e);
    return res.status(500).json({ error: "status_failed" });
  }
});

module.exports = r;
