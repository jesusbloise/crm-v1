const express = require("express");
const cors = require("cors");
const { runMigrations, ensureContactsAccountId } = require("./db/migrate");
const wrap = require("./lib/wrap");

const app = express();

// Migrations & ALTERs idempotentes
runMigrations();
ensureContactsAccountId();

app.use(cors());
app.use(express.json());

// Rutas
app.use(require("./routes/health"));
app.use(require("./routes/events"));
app.use(require("./routes/leads"));
app.use(require("./routes/contacts"));
app.use(require("./routes/accounts"));
app.use(require("./routes/deals"));
app.use(require("./routes/activities"));
app.use(require("./routes/notes"));

// 404 final
app.use((_req, res) => res.status(404).json({ error: "not found" }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

module.exports = app;
