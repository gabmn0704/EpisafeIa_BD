-- 001: usuarios y tokens de refresco
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  full_name     text NOT NULL,
  birth_date    date,
  timezone      text NOT NULL DEFAULT 'America/Bogota',
  role          text NOT NULL DEFAULT 'patient',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_role_check CHECK (role IN ('patient', 'caregiver', 'admin'))
);

COMMENT ON TABLE users IS 'Cuentas de la plataforma (pacientes, cuidadores, admins)';
COMMENT ON COLUMN users.email IS 'El back normaliza a minusculas antes de guardar';
COMMENT ON COLUMN users.password_hash IS 'Hash bcrypt; nunca la contrasena en claro';
COMMENT ON COLUMN users.timezone IS 'Zona horaria IANA para interpretar horarios de medicacion';

CREATE TABLE refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX refresh_tokens_hash_key ON refresh_tokens (token_hash);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id) WHERE NOT revoked;
CREATE INDEX refresh_tokens_expires_idx ON refresh_tokens (expires_at);

COMMENT ON TABLE refresh_tokens IS 'Refresh tokens (7 dias) guardados como hash, con soporte de revocacion';
