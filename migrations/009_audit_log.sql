-- 009: bitacora de auditoria
CREATE TABLE audit_log (
  id        bigserial PRIMARY KEY,
  user_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  action    text NOT NULL,
  entity    text NOT NULL,
  entity_id text,
  meta      jsonb NOT NULL DEFAULT '{}'::jsonb,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_user_at_idx ON audit_log (user_id, at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);

COMMENT ON TABLE audit_log IS 'Acciones sensibles (login, emergencia, cambios de medicacion); sobrevive al borrado del usuario (user_id NULL)';
