/** Envuelve handlers async y manda errores al error handler. */
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
