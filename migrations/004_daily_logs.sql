-- 004: registro diario de habitos
CREATE TABLE daily_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  log_date         date NOT NULL,
  sleep_hours      numeric(4,2),
  stress_level     integer,
  caffeine_mg      integer,
  exercise_minutes integer,
  mood             integer,
  alcohol_units    numeric,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_logs_user_date_unique UNIQUE (user_id, log_date),
  CONSTRAINT daily_logs_sleep_check CHECK (sleep_hours IS NULL OR sleep_hours BETWEEN 0 AND 24),
  CONSTRAINT daily_logs_stress_check CHECK (stress_level IS NULL OR stress_level BETWEEN 1 AND 10),
  CONSTRAINT daily_logs_caffeine_check CHECK (caffeine_mg IS NULL OR caffeine_mg >= 0),
  CONSTRAINT daily_logs_exercise_check CHECK (exercise_minutes IS NULL OR exercise_minutes >= 0),
  CONSTRAINT daily_logs_mood_check CHECK (mood IS NULL OR mood BETWEEN 1 AND 5),
  CONSTRAINT daily_logs_alcohol_check CHECK (alcohol_units IS NULL OR alcohol_units >= 0)
);
CREATE INDEX daily_logs_user_date_idx ON daily_logs (user_id, log_date DESC);

COMMENT ON TABLE daily_logs IS 'Habitos diarios (sueno, estres, cafeina...) usados como entradas del modelo de riesgo';
COMMENT ON COLUMN daily_logs.stress_level IS 'Escala 1 (calma) a 10 (maximo estres)';
COMMENT ON COLUMN daily_logs.mood IS 'Escala 1 (muy mal) a 5 (muy bien)';

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER daily_logs_set_updated_at
  BEFORE UPDATE ON daily_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
