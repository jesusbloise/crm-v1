// server/scripts/seedDevAuth.js
const db = require("../db/connection");
const crypto = require("crypto");

function now(){ return Date.now(); }
function hash(p){ return crypto.createHash("sha256").update(p).digest("hex"); }

const TENANT_ID = "demo";
const USER_ID = "u_admin_demo";
const EMAIL = "admin@demo.local";
const PASS = "demo";

db.exec(`
  INSERT OR IGNORE INTO tenants (id,name,created_at,updated_at)
  VALUES ('${TENANT_ID}','Demo',${now()},${now()});

  INSERT OR IGNORE INTO users (id,email,name,password_hash,created_at,updated_at)
  VALUES ('${USER_ID}','${EMAIL}','Admin Demo','${hash(PASS)}',${now()},${now()});

  INSERT OR IGNORE INTO memberships (user_id,tenant_id,role,created_at)
  VALUES ('${USER_ID}','${TENANT_ID}','owner',${now()});
`);

console.log("✅ Seed dev auth listo:", { EMAIL, PASS, TENANT_ID });
