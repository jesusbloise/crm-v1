const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const EXPIRES = "7d";

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}
function verify(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { sign, verify };
