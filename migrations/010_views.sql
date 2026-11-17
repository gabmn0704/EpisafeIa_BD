-- 010: vistas de lectura para el back y el servicio IA

-- Una fila por usuario y dia con las entradas del modelo de riesgo.
CREATE VIEW v_daily_risk_inputs AS
WITH meds AS (
  SELECT ml.user_id,
         (ml.scheduled_for AT TIME ZONE u.timezone)::date AS day,
         count(*) FILTER (WHERE ml.status = 'missed')      AS missed_meds,
         count(*) FILTER (WHERE ml.status IN ('taken', 'missed')) AS due_meds
  FROM medication_logs ml
  JOIN users u ON u.id = ml.user_id
  GROUP BY ml.user_id, (ml.scheduled_for AT TIME ZONE u.timezone)::date
), sz AS (
  SELECT s.user_id,
         (s.started_at AT TIME ZONE u.timezone)::date AS day,
         count(*) AS seizure_count,
         max(s.severity) AS max_severity
  FROM seizures s
  JOIN users u ON u.id = s.user_id
  GROUP BY s.user_id, (s.started_at AT TIME ZONE u.timezone)::date
), ws AS (
  SELECT w.user_id,
         (w.sampled_at AT TIME ZONE u.timezone)::date AS day,
         avg(w.heart_rate)::numeric(6,2)       AS hr_avg,
         avg(w.hrv_ms)::numeric(6,2)           AS hrv_avg_ms,
         avg(w.motion_intensity)::numeric(6,3) AS motion_avg
  FROM wearable_samples w
  JOIN users u ON u.id = w.user_id
  GROUP BY w.user_id, (w.sampled_at AT TIME ZONE u.timezone)::date
)
SELECT d.user_id,
       d.log_date,
       d.sleep_hours,
       d.stress_level,
       d.caffeine_mg,
       d.exercise_minutes,
       d.mood,
       d.alcohol_units,
       COALESCE(m.missed_meds, 0)  AS missed_meds,
       COALESCE(m.due_meds, 0)     AS due_meds,
       ws.hr_avg,
       ws.hrv_avg_ms,
       ws.motion_avg,
       COALESCE(sz.seizure_count, 0) AS seizures_same_day,
       -- Etiqueta de entrenamiento: crisis dentro de las 24 h siguientes al dia registrado
       COALESCE(nx.seizure_count, 0) > 0 AS seizure_next_day
FROM daily_logs d
LEFT JOIN meds m  ON m.user_id = d.user_id AND m.day = d.log_date
LEFT JOIN ws      ON ws.user_id = d.user_id AND ws.day = d.log_date
LEFT JOIN sz      ON sz.user_id = d.user_id AND sz.day = d.log_date
LEFT JOIN sz nx   ON nx.user_id = d.user_id AND nx.day = d.log_date + 1;

COMMENT ON VIEW v_daily_risk_inputs IS 'Features diarias por usuario (habitos, tomas omitidas, reloj) y etiqueta seizure_next_day';

-- Adherencia de los ultimos 30 dias por medicamento.
CREATE VIEW v_adherence_30d AS
SELECT m.user_id,
       m.id AS medication_id,
       m.name AS medication_name,
       count(*) FILTER (WHERE ml.status = 'taken')   AS taken,
       count(*) FILTER (WHERE ml.status = 'missed')  AS missed,
       count(*) FILTER (WHERE ml.status = 'skipped') AS skipped,
       count(*) FILTER (WHERE ml.status = 'pending')  AS pending,
       CASE
         WHEN count(*) FILTER (WHERE ml.status IN ('taken', 'missed')) = 0 THEN NULL
         ELSE round(
           100.0 * count(*) FILTER (WHERE ml.status = 'taken')
           / count(*) FILTER (WHERE ml.status IN ('taken', 'missed')), 1)
       END AS adherence_pct
FROM medications m
LEFT JOIN medication_logs ml
  ON ml.medication_id = m.id
 AND ml.scheduled_for >= now() - interval '30 days'
 AND ml.scheduled_for <= now()
WHERE m.active
GROUP BY m.user_id, m.id, m.name;

COMMENT ON VIEW v_adherence_30d IS 'Adherencia = tomadas / (tomadas + omitidas) en 30 dias; saltadas y pendientes no cuentan';

-- Resumen de crisis por usuario para el dashboard.
CREATE VIEW v_seizure_summary AS
SELECT s.user_id,
       count(*)                                          AS total,
       count(*) FILTER (WHERE s.started_at >= now() - interval '30 days') AS last_30d,
       max(s.started_at)                                 AS last_seizure_at,
       floor(extract(epoch FROM (now() - max(s.started_at))) / 86400)::int AS days_since_last,
       round(avg(s.duration_seconds)::numeric, 0)        AS avg_duration_seconds,
       round(avg(s.severity)::numeric, 2)                AS avg_severity
FROM seizures s
GROUP BY s.user_id;

COMMENT ON VIEW v_seizure_summary IS 'Totales, ultima crisis y racha sin crisis por usuario';

-- Emergencias abiertas con sus notificaciones pendientes.
CREATE VIEW v_active_emergencies AS
SELECT e.id AS event_id,
       e.user_id,
       e.status,
       e.triggered_at,
       e.latitude,
       e.longitude,
       count(n.id) FILTER (WHERE n.status = 'queued') AS queued_notifications,
       count(n.id) FILTER (WHERE n.status = 'sent')   AS sent_notifications
FROM emergency_events e
LEFT JOIN notifications n ON n.event_id = e.id
WHERE e.status IN ('active', 'notified')
GROUP BY e.id;

COMMENT ON VIEW v_active_emergencies IS 'Emergencias en curso y estado de su cola de notificaciones';
