// server/routes/ics.js
const { Router } = require("express");
const db = require("../db/connection");
const ical = require("node-ical");

const r = Router();

/* ====== Utils ====== */
function asUserId(req) {
  return String(req.user?.id ?? "");
}
async function getUserRow(userId) {
  return await db
    .prepare(
      `SELECT id, email, google_ics_url
       FROM users WHERE id = ?`
    )
    .get(String(userId));
}

function safeParseDate(v) {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function clampWindow(min, max, limitDays = 90) {
  if (!min || !max) return { min, max };
  const ms = 24 * 60 * 60 * 1000;
  const diffDays = (max - min) / ms;
  if (diffDays > limitDays) {
    const clampedMax = new Date(min.getTime() + limitDays * ms - 1);
    return { min, max: clampedMax };
  }
  return { min, max };
}

function isAllDay(ev, start, end) {
  // Si node-ical parseó los params del campo, a veces están en ev.component.getFirstProperty("dtstart").getParameter("value")
  // pero en los objetos simples suele venir en ev.datetype === 'date'. Mantenemos tu heurística + un chequeo por params.
  try {
    if (ev && ev.datetype === "date") return true;
    // node-ical suele exponer ev.start.tz, ev.end.tz; si no hay hora (00:00) y duración en días, podría ser all-day.
    // Heurística: sin parte horaria en el texto original.
    if (ev && ev.start && typeof ev.start === "string" && !ev.start.includes("T")) return true;
    if (ev && ev.end && typeof ev.end === "string" && !ev.end.includes("T")) return true;
  } catch {}
  // fallback a heurística original
  return isDateOnly(start) || isDateOnly(end);
}

function isDateOnly(d) {
  if (!d) return false;
  return typeof d === "string" ? !d.includes("T") : false;
}

function toIsoDate(d) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

/** GET /integrations/ics/me  -> { connected, url? } */
r.get("/integrations/ics/me", async (req, res) => {
  try {
    const uid = asUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const row = await getUserRow(uid);
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

    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "invalid_url" });
    }

    await db.prepare(`UPDATE users SET google_ics_url = ? WHERE id = ?`).run(url, uid);
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

    const row = await getUserRow(uid);
    const url = row?.google_ics_url;
    if (!url) return res.status(400).json({ error: "ics_not_configured" });

    // Rango por defecto: mes actual
    const now = new Date();
    const defaultMin = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultMax = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Parse seguro de query
    let timeMin = safeParseDate(req.query.timeMin) || defaultMin;
    let timeMax = safeParseDate(req.query.timeMax) || defaultMax;

    // Asegurar orden
    if (timeMax < timeMin) {
      const t = timeMin;
      timeMin = timeMax;
      timeMax = t;
    }

    // Limitar a 90 días máximo para evitar respuestas enormes por error
    ({ min: timeMin, max: timeMax } = clampWindow(timeMin, timeMax, 90));

    // Descarga y parsea ICS (con timeout prudente)
    let data;
    try {
      data = await ical.async.fromURL(url, {
        // Node-ical usa node-fetch por debajo; respetará estas opciones si el agent lo permite.
        // Esto ayuda a no quedar colgado si el host no responde.
        requestOptions: { timeout: 15000 },
      });
    } catch (err) {
      console.error("fromURL failed:", err?.message || err);
      return res.status(502).json({ error: "ics_fetch_failed" });
    }

    const items = [];
    for (const key of Object.keys(data)) {
      const ev = data[key];
      if (!ev || ev.type !== "VEVENT") continue;

      const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
      const end = ev.end instanceof Date ? ev.end : new Date(ev.end);

      if (!start || Number.isNaN(start.getTime())) continue;
      if (!end || Number.isNaN(end.getTime())) continue;

      // filtro por ventana
      if (end < timeMin || start > timeMax) continue;

      const allDay = isAllDay(ev, ev.start, ev.end);

      items.push({
        id: ev.uid || key,
        summary: ev.summary || "(sin título)",
        location: ev.location || undefined,
        description: ev.description || undefined,
        start: allDay ? { date: toIsoDate(start) } : { dateTime: start.toISOString() },
        end: allDay ? { date: toIsoDate(end) } : { dateTime: end.toISOString() },
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
    return res
      .status(500)
      .json({ error: " ics_events_failed", detail: e?.message || String(e) });
  }
});

module.exports = r;
