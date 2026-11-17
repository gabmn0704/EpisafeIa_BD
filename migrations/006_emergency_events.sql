-- 006: eventos de emergencia y notificaciones
CREATE TABLE emergency_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seizure_id   uuid REFERENCES seizures (id) ON DELETE SET NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'active',
  latitude     numeric(9,6),
  longitude    numeric(9,6),
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emergency_events_status_check CHECK (status IN ('active', 'notified', 'resolved', 'false_alarm')),
  CONSTRAINT emergency_events_latitude_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT emergency_events_longitude_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT emergency_events_coords_pair_check CHECK ((latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX emergency_events_user_triggered_idx ON emergency_events (user_id, triggered_at DESC);
-- Consulta caliente: GET /emergency/active
CREATE INDEX emergency_events_active_idx ON emergency_events (user_id) WHERE status IN ('active', 'notified');
CREATE INDEX emergency_events_seizure_idx ON emergency_events (seizure_id) WHERE seizure_id IS NOT NULL;

COMMENT ON TABLE emergency_events IS 'Activaciones del boton SOS o escaladas desde alertas del reloj';
COMMENT ON COLUMN emergency_events.status IS 'active -> notified -> resolved, o false_alarm';

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  contact_id uuid REFERENCES emergency_contacts (id) ON DELETE SET NULL,
  event_id   uuid REFERENCES emergency_events (id) ON DELETE CASCADE,
  channel    text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  status     text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz,
  CONSTRAINT notifications_channel_check CHECK (channel IN ('email', 'sms', 'push', 'log')),
  CONSTRAINT notifications_status_check CHECK (status IN ('queued', 'sent', 'failed')),
  CONSTRAINT notifications_sent_consistency_check CHECK (status <> 'sent' OR sent_at IS NOT NULL)
);
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_event_idx ON notifications (event_id);
CREATE INDEX notifications_queued_idx ON notifications (created_at) WHERE status = 'queued';

COMMENT ON TABLE notifications IS 'Cola persistente de notificaciones a contactos (canal email/sms/push/log)';
