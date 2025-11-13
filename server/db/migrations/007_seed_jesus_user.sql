-- Migración: Crear usuario jesusbloise como owner global
-- Este usuario se crea automáticamente en producción

-- Insertar usuario si no existe
INSERT INTO users (id, email, name, password_hash, role, active, created_at, updated_at)
VALUES (
  'user_jesus_' || FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::TEXT,
  'jesusbloise@gmail.com',
  'Jesus Bloise',
  '', -- Password vacío (debe cambiar al registrarse)
  'owner',
  true,
  FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
)
ON CONFLICT (email) DO UPDATE 
SET role = 'owner', 
    name = COALESCE(users.name, 'Jesus Bloise'),
    active = true;

-- Crear workspace principal si no existe
INSERT INTO tenants (id, name, created_by, created_at, updated_at)
VALUES (
  'atomica',
  'Atomica',
  'jesusbloise@gmail.com',
  FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
)
ON CONFLICT (id) DO NOTHING;

-- Crear membership si el usuario existe
INSERT INTO memberships (user_id, tenant_id, role, created_at, updated_at)
SELECT 
  u.id,
  'atomica',
  'owner',
  FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
FROM users u
WHERE u.email = 'jesusbloise@gmail.com'
ON CONFLICT (user_id, tenant_id) DO UPDATE
SET role = 'owner';
