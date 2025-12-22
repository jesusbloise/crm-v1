module.exports = function requireRole(role) {
  return (req, res, next) => {
    // requireAuth ya debería haber puesto req.user
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Compat: role puede venir como user.role o user.workspace_role o user.tenant_role
    const userRole = user.role || user.workspace_role || user.tenant_role;

    if (!userRole) {
      return res.status(403).json({ error: "forbidden", message: "missing_role" });
    }

    // owner siempre pasa
    if (userRole === "owner") return next();

    // admin requerido
    if (role === "admin" && userRole !== "admin") {
      return res.status(403).json({ error: "forbidden", message: "admin_required" });
    }

    return next();
  };
};
