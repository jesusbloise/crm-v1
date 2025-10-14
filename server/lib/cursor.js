function enc(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function dec(s) {
  try { return JSON.parse(Buffer.from(String(s), "base64url").toString("utf8")); }
  catch { return null; }
}
module.exports = { enc, dec };
