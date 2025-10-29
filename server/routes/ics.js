// server/routes/ics.js
const { Router } = require("express");
const db = require("../db/connection");
const ical = require("node-ical");

const r = Router();

function asUserId(req) {
  return String(req.user?.id ?? "");
}
function getUserRow(userId) {
  return db
    .prepare(
      `SELECT id, email, google_ics_url
       FROM users WHERE id = ?`
    )
    .get(String(userId));
}

/** GET /integrations/ics/me  -> { connected, url? } */
r.get("/integrations/ics/me", (req, res) => {
  try {
    const uid = asUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const row = getUserRow(uid);
    const url = row?.google_ics_url || null;
    return res.json({ connected: !!url, url });
  } catch (e) {
    console.error("ics/me error:", e);
    return res.status(500).json({ error: "ics_me_failed" });
  }
});

/**
 * POST /integrations/ics/save  -> Body: { url }
 * Guarda la URL secreta (iCal) del calendario a leer.
 */
r.post("/integrations/ics/save", async (req, res) => {
  try {
    const uid = asUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const { url } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "missing_url" });
    }

    // Validación simple (acepta feeds de Google Calendar o cualquier ICS)
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "invalid_url" });
    }

    db.prepare(`UPDATE users SET google_ics_url = ? WHERE id = ?`).run(url, uid);
    return res.json({ ok: true });
  } catch (e) {
    console.error("ics/save error:", e);
    return res.status(500).json({ error: "ics_save_failed" });
  }
});

/**
 * GET /integrations/ics/events?timeMin&timeMax
 * Lee eventos desde el feed ICS guardado y devuelve un array normalizado.
 */
r.get("/integrations/ics/events", async (req, res) => {
  try {
    const uid = asUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const row = getUserRow(uid);
    const url = row?.google_ics_url;
    if (!url) return res.status(400).json({ error: "ics_not_configured" });

    // Rango (si no mandan, usamos mes actual)
    const now = Date.now();
    const timeMin = req.query.timeMin
      ? new Date(String(req.query.timeMin))
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const timeMax = req.query.timeMax
      ? new Date(String(req.query.timeMax))
      : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);

    // Descarga y parsea ICS
    const data = await ical.async.fromURL(url);

    // Normaliza a array tipo Google-ish
    const items = [];
    for (const key of Object.keys(data)) {
      const ev = data[key];
      if (!ev || ev.type !== "VEVENT") continue;

      // Manejo RRULE/recurrencias: node-ical ya expande ocurrencias si usas .between, pero aquí haremos filtro simple
      const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
      const end = ev.end instanceof Date ? ev.end : new Date(ev.end);

      // filtro por ventana
      if (end < timeMin || start > timeMax) continue;

      items.push({
        id: ev.uid || key,
        summary: ev.summary || "(sin título)",
        location: ev.location || undefined,
        description: ev.description || undefined,
        start: ev.datetype === "date" || ev.allDay || isDateOnly(ev.start)
          ? { date: toIsoDate(start) }
          : { dateTime: start.toISOString() },
        end: ev.datetype === "date" || ev.allDay || isDateOnly(ev.end)
          ? { date: toIsoDate(end) }
          : { dateTime: end.toISOString() },
        // Extra opcional
        organizer: ev.organizer?.val || ev.organizer || undefined,
      });
    }

    // Orden por inicio
    items.sort((a, b) => {
      const sa = a.start?.dateTime || a.start?.date || "";
      const sb = b.start?.dateTime || b.start?.date || "";
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });

    return res.json({ items });
  } catch (e) {
    console.error("ics/events error:", e);
    return res.status(500).json({ error: "ics_events_failed", detail: e?.message || String(e) });
  }
});

function isDateOnly(d) {
  // Heurística: si la cadena original no trae "T", suele ser evento de día completo en ICS
  if (!d) return false;
  return typeof d === "string"
    ? !d.includes("T")
    : false;
}
function toIsoDate(d) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

module.exports = r;
