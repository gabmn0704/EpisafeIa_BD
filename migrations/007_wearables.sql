-- 007: dispositivos y muestras de wearables
CREATE TABLE wearable_devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider     text NOT NULL,
  device_name  text NOT NULL,
  external_id  text,
  last_seen_at timestamptz,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wearable_devices_provider_check
    CHECK (provider IN ('web_bluetooth', 'fitbit', 'google_health', 'apple_health', 'garmin', 'manual'))
);
CREATE INDEX wearable_devices_user_idx ON wearable_devices (user_id) WHERE active;
CREATE UNIQUE INDEX wearable_devices_external_key
  ON wearable_devices (user_id, provider, external_id) WHERE external_id IS NOT NULL;

COMMENT ON TABLE wearable_devices IS 'Relojes y pulseras vinculados al usuario';

CREATE TABLE wearable_samples (
  id               bigserial PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_id        uuid REFERENCES wearable_devices (id) ON DELETE SET NULL,
  sampled_at       timestamptz NOT NULL,
  heart_rate       integer,
  hrv_ms           numeric,
  spo2             numeric,
  motion_intensity numeric,
  skin_temp_c      numeric,
  steps            integer,
  CONSTRAINT wearable_samples_hr_check CHECK (heart_rate IS NULL OR heart_rate BETWEEN 20 AND 260),
  CONSTRAINT wearable_samples_hrv_check CHECK (hrv_ms IS NULL OR hrv_ms >= 0),
  CONSTRAINT wearable_samples_spo2_check CHECK (spo2 IS NULL OR spo2 BETWEEN 0 AND 100),
  CONSTRAINT wearable_samples_motion_check CHECK (motion_intensity IS NULL OR motion_intensity >= 0),
  CONSTRAINT wearable_samples_steps_check CHECK (steps IS NULL OR steps >= 0)
);
CREATE INDEX wearable_samples_user_sampled_idx ON wearable_samples (user_id, sampled_at DESC);
CREATE INDEX wearable_samples_device_idx ON wearable_samples (device_id) WHERE device_id IS NOT NULL;

COMMENT ON TABLE wearable_samples IS 'Serie temporal de signos vitales y movimiento (ingesta por lotes de hasta 200)';
COMMENT ON COLUMN wearable_samples.motion_intensity IS 'Magnitud normalizada del acelerometro (0 = reposo)';

CREATE TABLE wearable_alerts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_id            uuid REFERENCES wearable_devices (id) ON DELETE SET NULL,
  detected_at          timestamptz NOT NULL DEFAULT now(),
  kind                 text NOT NULL,
  confidence           numeric(4,3) NOT NULL DEFAULT 0.5,
  payload              jsonb NOT NULL DEFAULT '{}'::jsonb,
  converted_event_id   uuid REFERENCES emergency_events (id) ON DELETE SET NULL,
  CONSTRAINT wearable_alerts_kind_check CHECK (kind IN ('tachycardia', 'motion_convulsive', 'hr_anomaly', 'fall')),
  CONSTRAINT wearable_alerts_confidence_check CHECK (confidence BETWEEN 0 AND 1)
);
CREATE INDEX wearable_alerts_user_detected_idx ON wearable_alerts (user_id, detected_at DESC);
CREATE INDEX wearable_alerts_open_idx ON wearable_alerts (user_id) WHERE converted_event_id IS NULL;

COMMENT ON TABLE wearable_alerts IS 'Anomalias detectadas por reglas en streaming; pueden escalarse a emergency_events';
