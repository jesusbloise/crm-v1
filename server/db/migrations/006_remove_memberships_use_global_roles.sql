-- Migración: Eliminar sistema de roles por workspace (memberships)
-- Usar solo roles globales: owner (1), admin (pueden crear workspaces), member (usuarios normales)

-- NOTA: Esta migración NO elimina la tabla memberships por seguridad
-- Solo la marca como obsoleta. Si quieres eliminarla manualmente después:
-- DROP TABLE IF EXISTS memberships CASCADE;

-- Crear comentario en la tabla para marcarla como obsoleta
COMMENT ON TABLE memberships IS 'OBSOLETA: Sistema simplificado usa solo users.role (owner/admin/member)';

-- La tabla memberships quedará sin uso pero no se elimina por seguridad
-- Los workspaces ahora solo tienen created_by (owner del workspace)
-- Los permisos se manejan a nivel global con users.role
