-- 005: crisis epilepticas
CREATE TABLE seizures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  started_at       timestamptz NOT NULL,
  duration_seconds integer,
  severity         integer,
  seizure_type     text,
  triggers_noted   text[] NOT NULL DEFAULT '{}',
  location         text,
  notes            text,
  source           text NOT NULL DEFAULT 'manual',
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seizures_duration_check CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  CONSTRAINT seizures_severity_check CHECK (severity IS NULL OR severity BETWEEN 1 AND 5),
  CONSTRAINT seizures_source_check CHECK (source IN ('manual', 'emergency', 'wearable')),
  CONSTRAINT seizures_resolved_after_start_check CHECK (resolved_at IS NULL OR resolved_at >= started_at)
);
CREATE INDEX seizures_user_started_idx ON seizures (user_id, started_at DESC);
CREATE INDEX seizures_triggers_gin_idx ON seizures USING gin (triggers_noted);

COMMENT ON TABLE seizures IS 'Historial de crisis (manuales, de emergencia o detectadas por reloj)';
COMMENT ON COLUMN seizures.source IS 'manual | emergency (boton SOS) | wearable (deteccion automatica)';
