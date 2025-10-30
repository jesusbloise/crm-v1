// server/routes/google.js
const { Router } = require("express");
const db = require("../db/connection");
const {
  exchangeCodeForTokens,
  getCalendarClientFromRefresh,
} = require("../lib/google");

const r = Router();

/* ========== Utils ========== */
function asUserId(req) {
  return String(req.user?.id ?? "");
}
function getUserGoogleRow(userId) {
  return db
    .prepare(
      `SELECT id, email, google_email, google_refresh_token, google_calendar_id
       FROM users WHERE id = ?`
    )
    .get(String(userId));
}
function safeParseDateISO(v) {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
function clampRange(min, max, maxDays = 120) {
  if (!min || !max) return { min, max };
  if (max < min) [min, max] = [max, min];
  const day = 24 * 60 * 60 * 1000;
  if ((max - min) / day > maxDays) {
    max = new Date(min.getTime() + maxDays * day - 1);
  }
  return { min, max };
}
function capInt(v, def, min, max) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

/* ========== Rutas ========== */

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
 */
r.post("/integrations/google/exchange", async (req, res) => {
  try {
    const uid = asUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const { code, verifier, redirectUri } = req.body || {};
    if (!code || !verifier || !redirectUri) {
      return res
        .status(400)
        .json({ error: "missing_params", need: ["code", "verifier", "redirectUri"] });
    }

    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: verifier,
      redirectUri,
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
 * Lista los calendarios del usuario (CalendarList) con paginación.
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

    const maxResults = capInt(req.query.maxResults, 250, 1, 250);
    let pageToken = undefined;
    const items = [];

    do {
      /* eslint-disable no-await-in-loop */
      const { data } = await cal.calendarList.list({
        minAccessRole: "reader",
        maxResults,
        showDeleted: false,
        pageToken,
      });
      const batch =
        (data.items || []).map((c) => ({
          id: c.id,
          summary: c.summary,
          primary: !!c.primary,
          accessRole: c.accessRole,
          backgroundColor: c.backgroundColor,
        })) ?? [];
      items.push(...batch);
      pageToken = data.nextPageToken;
    } while (pageToken);

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
 */
r.post("/integrations/google/calendars/use", (req, res) => {
  try {
    const uid = asUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const { calendarId } = req.body || {};
    if (!calendarId || typeof calendarId !== "string") {
      return res.status(400).json({ error: "missing_calendarId" });
    }

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
 * GET /integrations/google/events?timeMin=&timeMax=&calendarId=&maxResults=
 * Devuelve eventos del calendario preferido o "primary".
 */
r.get("/integrations/google/events", async (req, res) => {
  try {
    const uid = asUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const row = getUserGoogleRow(uid);
    if (!row?.google_refresh_token) {
      return res.status(401).json({ error: "google_not_connected" });
    }

    // Rango por defecto: [-7, +14] días
    const now = new Date();
    let timeMin = safeParseDateISO(req.query.timeMin) || new Date(now.getTime() - 7 * 86400000);
    let timeMax = safeParseDateISO(req.query.timeMax) || new Date(now.getTime() + 14 * 86400000);
    ({ min: timeMin, max: timeMax } = clampRange(timeMin, timeMax, 120));

    const calendarId =
      (req.query.calendarId ? String(req.query.calendarId).trim() : "") ||
      row.google_calendar_id ||
      "primary";

    const cal = await getCalendarClientFromRefresh(row.google_refresh_token);

    const cap = capInt(req.query.maxResults, 2500, 1, 2500);
    let pageToken = undefined;
    const items = [];

    do {
      /* eslint-disable no-await-in-loop */
      const { data } = await cal.events.list({
        calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: Math.min(2500, cap),
        pageToken,
      });
      items.push(...(data.items || []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    return res.json({ items });
  } catch (e) {
    const detail = e?.response?.data || e?.data || e?.message || e;
    console.error("events error:", detail);
    return res.status(500).json({ error: "events_failed", detail });
  }
});

/** ===== DEV ONLY =====
 * GET /integrations/google/status
 * Oculto en producción.
 */
if (process.env.NODE_ENV !== "production") {
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
}

module.exports = r;
