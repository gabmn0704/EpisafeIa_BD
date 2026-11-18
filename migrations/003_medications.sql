-- 003: medicamentos y registro de tomas
CREATE TABLE medications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name           text NOT NULL,
  dose           numeric,
  unit           text NOT NULL DEFAULT 'mg',
  schedule_times text[] NOT NULL DEFAULT '{}',
  active         boolean NOT NULL DEFAULT true,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medications_dose_check CHECK (dose IS NULL OR dose > 0),
  CONSTRAINT medications_schedule_format_check
    CHECK (array_to_string(schedule_times, ',') ~ '^(([01][0-9]|2[0-3]):[0-5][0-9](,|$))*$')
);
CREATE INDEX medications_user_active_idx ON medications (user_id) WHERE active;
CREATE INDEX medications_name_idx ON medications (lower(name) text_pattern_ops);

COMMENT ON TABLE medications IS 'Tratamiento anticonvulsivo del usuario';
COMMENT ON COLUMN medications.schedule_times IS 'Horas diarias de toma en formato HH:MM (hora local del usuario)';

CREATE TABLE medication_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  medication_id uuid NOT NULL REFERENCES medications (id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  taken_at      timestamptz,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medication_logs_status_check CHECK (status IN ('taken', 'missed', 'skipped', 'pending')),
  CONSTRAINT medication_logs_taken_consistency_check CHECK ((status = 'taken') = (taken_at IS NOT NULL)),
  CONSTRAINT medication_logs_slot_unique UNIQUE (medication_id, scheduled_for)
);
CREATE INDEX medication_logs_user_scheduled_idx ON medication_logs (user_id, scheduled_for DESC);
CREATE INDEX medication_logs_user_status_idx ON medication_logs (user_id, status, scheduled_for DESC);

COMMENT ON TABLE medication_logs IS 'Una fila por toma programada; base del calculo de adherencia';
COMMENT ON CONSTRAINT medication_logs_taken_consistency_check ON medication_logs IS 'taken_at solo existe cuando status = taken';
