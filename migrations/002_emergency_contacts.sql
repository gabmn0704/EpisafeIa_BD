-- 002: contactos de emergencia
CREATE TABLE emergency_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name         text NOT NULL,
  relationship text,
  phone        text,
  email        text,
  priority     integer NOT NULL DEFAULT 1,
  notify_sms   boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emergency_contacts_priority_check CHECK (priority >= 1),
  CONSTRAINT emergency_contacts_reachable_check CHECK (phone IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX emergency_contacts_user_priority_idx ON emergency_contacts (user_id, priority);

COMMENT ON TABLE emergency_contacts IS 'Personas a notificar en una emergencia, ordenadas por prioridad (1 = primero)';
COMMENT ON COLUMN emergency_contacts.priority IS 'Menor numero = mas prioridad; alimenta la cola de prioridad del back';
