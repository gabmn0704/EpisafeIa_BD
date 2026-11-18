-- 008: salidas del motor de IA
CREATE TABLE risk_assessments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  assessed_on   date NOT NULL,
  score         integer NOT NULL,
  level         text NOT NULL,
  factors       jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_version text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_assessments_user_day_unique UNIQUE (user_id, assessed_on),
  CONSTRAINT risk_assessments_score_check CHECK (score BETWEEN 0 AND 100),
  CONSTRAINT risk_assessments_level_check CHECK (level IN ('low', 'moderate', 'high', 'critical')),
  CONSTRAINT risk_assessments_factors_array_check CHECK (jsonb_typeof(factors) = 'array')
);
CREATE INDEX risk_assessments_user_day_idx ON risk_assessments (user_id, assessed_on DESC);

COMMENT ON TABLE risk_assessments IS 'Riesgo diario 0-100 calculado por el servicio IA (una fila por usuario y dia)';
COMMENT ON COLUMN risk_assessments.factors IS 'Arreglo de {name, impact, direction, detail}';

CREATE TABLE insights (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  evidence   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX insights_user_created_idx ON insights (user_id, created_at DESC);
CREATE INDEX insights_user_kind_idx ON insights (user_id, kind);

COMMENT ON TABLE insights IS 'Hallazgos de patrones personales (p. ej. crisis tras dormir menos de 5 h)';
COMMENT ON COLUMN insights.evidence IS 'Estadisticas de soporte: n, lift, intervalo de Wilson, confianza';
