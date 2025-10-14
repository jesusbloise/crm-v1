const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");

const router = Router();

router.get("/deals", wrap(async (_req, res) => {
  const rows = db.prepare("SELECT * FROM deals ORDER BY updated_at DESC").all();
  res.json(rows);
}));

router.get("/deals/:id", wrap(async (req, res) => {
  const row = db.prepare("SELECT * FROM deals WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
}));

router.post("/deals", wrap(async (req, res) => {
  const { id, title, amount, stage, account_id, contact_id, close_date } = req.body || {};
  if (!id || !title) return res.status(400).json({ error: "id and title required" });
  const now = Date.now();
  const s = stage || "nuevo";
  db.prepare(`
    INSERT INTO deals (id,title,amount,stage,account_id,contact_id,close_date,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(id, title, amount ?? null, s, account_id ?? null, contact_id ?? null, close_date ?? null, now, now);
  res.status(201).json({ ok: true });
}));

// Automatización: si cambia a "propuesta", crear tarea para mañana
router.patch("/deals/:id", wrap(async (req, res) => {
  const found = db.prepare("SELECT * FROM deals WHERE id = ?").get(req.params.id);
  if (!found) return res.status(404).json({ error: "not found" });
  const prevStage = found.stage;
  const next = { ...found, ...req.body, updated_at: Date.now() };

  db.prepare(`
    UPDATE deals SET title=?, amount=?, stage=?, account_id=?, contact_id=?, close_date=?, updated_at=? WHERE id=?
  `).run(
    next.title, next.amount ?? null, next.stage ?? "nuevo", next.account_id ?? null,
    next.contact_id ?? null, next.close_date ?? null, next.updated_at, req.params.id
  );

  if (prevStage !== "propuesta" && next.stage === "propuesta") {
    const in24h = Date.now() + 24 * 60 * 60 * 1000;
    const aid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    db.prepare(`
      INSERT INTO activities (id,type,title,due_date,status,deal_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(aid, "task", "Enviar propuesta", in24h, "open", req.params.id, Date.now(), Date.now());
  }

  res.json({ ok: true });
}));

router.delete("/deals/:id", wrap(async (req, res) => {
  db.prepare("DELETE FROM deals WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
