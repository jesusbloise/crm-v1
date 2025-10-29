// server/db/seed.js
const db = require("./connection");

const DEFAULT_TENANT = process.env.DEFAULT_TENANT || "demo";

function nowPlus(minutes) {
  return Date.now() + minutes * 60 * 1000;
}

function upsertActivity(a) {
  const exists = db
    .prepare(`SELECT 1 FROM activities WHERE id = ? AND tenant_id = ? LIMIT 1`)
    .get(a.id, a.tenant_id);
  const ts = Date.now();
  if (exists) {
    db.prepare(
      `
      UPDATE activities SET
        type=?, title=?, due_date=?, remind_at_ms=?, status=?, notes=?,
        account_id=?, contact_id=?, lead_id=?, deal_id=?, updated_at=?
      WHERE id=? AND tenant_id=?
    `
    ).run(
      a.type, a.title, a.due_date ?? null, a.remind_at_ms ?? null, a.status, a.notes ?? null,
      a.account_id ?? null, a.contact_id ?? null, a.lead_id ?? null, a.deal_id ?? null,
      ts, a.id, a.tenant_id
    );
  } else {
    db.prepare(
      `
      INSERT INTO activities (
        id, type, title, due_date, remind_at_ms, status, notes,
        account_id, contact_id, lead_id, deal_id,
        tenant_id, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `
    ).run(
      a.id, a.type, a.title, a.due_date ?? null, a.remind_at_ms ?? null, a.status, a.notes ?? null,
      a.account_id ?? null, a.contact_id ?? null, a.lead_id ?? null, a.deal_id ?? null,
      a.tenant_id, ts, ts
    );
  }
}

function run() {
  db.exec("BEGIN");
  try {
    // Asegura tenant base
    const t = db
      .prepare(`SELECT 1 FROM tenants WHERE id = ? LIMIT 1`)
      .get(DEFAULT_TENANT);
    if (!t) {
      const ts = Date.now();
      db.prepare(
        `INSERT INTO tenants (id, name, created_at, updated_at, created_by) VALUES (?,?,?,?,?)`
      ).run(DEFAULT_TENANT, "Demo", ts, ts, "seed");
    }

    // Datos demo (10 y 30 min al futuro)
    const items = [
      {
        id: "seed-call-001",
        type: "call",
        title: "Llamar a cliente demo",
        due_date: null,
        remind_at_ms: nowPlus(10),
        status: "open",
        notes: "Hablar sobre propuesta",
        account_id: null,
        contact_id: null,
        lead_id: null,
        deal_id: null,
        tenant_id: DEFAULT_TENANT,
      },
      {
        id: "seed-task-002",
        type: "task",
        title: "Enviar cotización",
        due_date: null,
        remind_at_ms: nowPlus(30),
        status: "open",
        notes: "Adjuntar PDF",
        account_id: null,
        contact_id: null,
        lead_id: null,
        deal_id: null,
        tenant_id: DEFAULT_TENANT,
      },
      {
        id: "seed-note-003",
        type: "note",
        title: "Nota de seguimiento",
        due_date: null,
        remind_at_ms: nowPlus(1), // dispara rápido para probar
        status: "open",
        notes: "Recordar puntos clave",
        account_id: null,
        contact_id: null,
        lead_id: null,
        deal_id: null,
        tenant_id: DEFAULT_TENANT,
      },
    ];

    items.forEach(upsertActivity);

    db.exec("COMMIT");
    console.log("✅ Seed de activities insertado/actualizado");
  } catch (e) {
    db.exec("ROLLBACK");
    console.error("❌ Seed falló:", e);
    process.exitCode = 1;
  }
}

run();
