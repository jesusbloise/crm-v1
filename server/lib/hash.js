const crypto = require("crypto");
const SALT = "dev-salt-change-me";

function hashPassword(pw) {
  return crypto.createHmac("sha256", SALT).update(String(pw || "")).digest("hex");
}
function comparePassword(pw, hash) {
  return hashPassword(pw) === hash;
}

module.exports = { hashPassword, comparePassword };
