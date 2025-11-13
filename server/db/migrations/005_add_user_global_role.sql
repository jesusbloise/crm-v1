-- Migración: Agregar rol global a la tabla users
-- Todos los usuarios tienen un rol global (independiente de workspaces)
-- Roles: 'member' (default), 'admin', 'owner'

-- Agregar columna role con default 'member'
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner'));

-- Actualizar usuarios existentes que NO sean jesusbloise a 'member'
UPDATE users 
SET role = 'member' 
WHERE role IS NULL 
  AND email != 'jesusbloise@gmail.com';

-- jesusbloise@gmail.com siempre es 'owner' global
UPDATE users 
SET role = 'owner' 
WHERE email = 'jesusbloise@gmail.com';

-- Crear índice para búsquedas por rol
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
