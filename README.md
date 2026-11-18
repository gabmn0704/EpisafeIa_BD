# EpisafeIa_BD

Esquema PostgreSQL, migraciones y datos semilla de **EpiSafe IA**, sistema inteligente de prevención y asistencia para personas con epilepsia. Este repo es el dueño del esquema; el back (`EpisafeIa_back`) lo consume.

## Requisitos

- Node.js 20 o superior
- Docker (para `postgres:16` local) o cualquier PostgreSQL 13+ (se usa `gen_random_uuid()`)

## Inicio rápido

```bash
npm install
cp .env.example .env        # credenciales de desarrollo
docker compose up -d        # postgres:16 en localhost:5432
npm run migrate             # aplica migrations/*.sql
npm run seed                # usuario demo + 90 días de datos
```

Conexión local: `postgres://episafe:episafe_dev@localhost:5432/episafe` (solo desarrollo).

Usuario demo: `demo@episafe.app` / `Demo1234!`

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run migrate` | Aplica las migraciones pendientes (cada una en su transacción) |
| `npm run migrate:status` | Lista migraciones como `applied`, `pending` o `modified` |
| `npm run seed` | Inserta el usuario demo y sus datos (idempotente: reemplaza al demo previo) |
| `npm run reset` | Borra el esquema `public`, migra y siembra de nuevo (se niega en bases no locales) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest sobre PGlite (PostgreSQL en memoria, sin Docker) |
| `npm run db:up` | Levanta solo el contenedor de Postgres |

## Migraciones

Archivos `migrations/NNN_nombre.sql`, aplicados en orden. El runner (`src/migrate.ts`) guarda en `schema_migrations` la versión, el nombre y un checksum SHA-256; si un archivo ya aplicado se edita, `up` falla. **No edites migraciones aplicadas: crea una nueva.**

| # | Archivo | Contenido |
| --- | --- | --- |
| 001 | `001_users_auth.sql` | `users`, `refresh_tokens` |
| 002 | `002_emergency_contacts.sql` | `emergency_contacts` |
| 003 | `003_medications.sql` | `medications`, `medication_logs` |
| 004 | `004_daily_logs.sql` | `daily_logs` + trigger `updated_at` |
| 005 | `005_seizures.sql` | `seizures` (índice GIN en desencadenantes) |
| 006 | `006_emergency_events.sql` | `emergency_events`, `notifications` |
| 007 | `007_wearables.sql` | `wearable_devices`, `wearable_samples`, `wearable_alerts` |
| 008 | `008_ai_outputs.sql` | `risk_assessments`, `insights` |
| 009 | `009_audit_log.sql` | `audit_log` |
| 010 | `010_views.sql` | `v_daily_risk_inputs`, `v_adherence_30d`, `v_seizure_summary`, `v_active_emergencies` |

## Vistas

- **`v_daily_risk_inputs`**: una fila por usuario y día con hábitos, tomas omitidas, promedios del reloj y la etiqueta `had_seizure`. Es la entrada natural para entrenar o puntuar el modelo de riesgo.
- **`v_adherence_30d`**: adherencia por medicamento activo = tomadas / (tomadas + omitidas) en 30 días; las saltadas y pendientes no cuentan.
- **`v_seizure_summary`**: total, últimos 30 días, última crisis y racha sin crisis.
- **`v_active_emergencies`**: emergencias abiertas con su cola de notificaciones.

## Datos semilla

`src/seed/` genera un conjunto determinista (PRNG con semilla fija) con correlaciones reales para que la IA tenga qué aprender:

- 90 días de `daily_logs`; el estrés sigue un proceso AR(1) y ~14% de las noches duermen menos de 5 h.
- La probabilidad diaria de crisis sube con **menos de 5 h de sueño**, **estrés alto**, **medicación omitida**, alcohol y exceso de cafeína (ver `seizureProbability`).
- Tomas de dos medicamentos con rachas de olvidos y `pending` para las dosis futuras de hoy.
- Muestras de reloj cada 5 minutos durante 7 días (FC y VFC dependientes del sueño y el estrés), un episodio de movimiento convulsivo escalado a emergencia, una alerta de taquicardia abierta y una falsa alarma.
- `risk_assessments` por día e `insights` calculados con estadística real (n, lift, intervalo de Wilson).

Las fechas se generan relativas a "hoy" (zona `America/Bogota`), así que el seed siempre se ve reciente.

## Diagrama entidad-relación

```mermaid
erDiagram
    users ||--o{ refresh_tokens : "tiene"
    users ||--o{ emergency_contacts : "registra"
    users ||--o{ medications : "toma"
    users ||--o{ medication_logs : "registra"
    medications ||--o{ medication_logs : "genera"
    users ||--o{ daily_logs : "registra"
    users ||--o{ seizures : "sufre"
    users ||--o{ emergency_events : "activa"
    seizures |o--o{ emergency_events : "origina"
    users ||--o{ notifications : "recibe"
    emergency_contacts |o--o{ notifications : "destinatario"
    emergency_events |o--o{ notifications : "dispara"
    users ||--o{ risk_assessments : "evaluado"
    users ||--o{ insights : "obtiene"
    users ||--o{ wearable_devices : "vincula"
    wearable_devices |o--o{ wearable_samples : "emite"
    users ||--o{ wearable_samples : "genera"
    wearable_devices ||--o{ wearable_alerts : "detecta"
    emergency_events |o--o{ wearable_alerts : "escalada a"
    users |o--o{ audit_log : "auditado"

    users {
        uuid id PK
        text email UK
        text password_hash
        text full_name
        date birth_date
        text timezone
        text role "patient|caregiver|admin"
        timestamptz created_at
    }
    refresh_tokens {
        uuid id PK
        uuid user_id FK
        text token_hash UK
        timestamptz expires_at
        boolean revoked
    }
    emergency_contacts {
        uuid id PK
        uuid user_id FK
        text name
        text relationship
        text phone
        text email
        int priority
        boolean notify_sms
        boolean notify_email
    }
    medications {
        uuid id PK
        uuid user_id FK
        text name
        numeric dose
        text unit
        text_array schedule_times "HH:MM"
        boolean active
        text notes
    }
    medication_logs {
        uuid id PK
        uuid user_id FK
        uuid medication_id FK
        timestamptz scheduled_for
        timestamptz taken_at
        text status "taken|missed|skipped|pending"
    }
    daily_logs {
        uuid id PK
        uuid user_id FK
        date log_date "UK con user_id"
        numeric sleep_hours
        int stress_level "1-10"
        int caffeine_mg
        int exercise_minutes
        int mood "1-5"
        numeric alcohol_units
        text notes
    }
    seizures {
        uuid id PK
        uuid user_id FK
        timestamptz started_at
        int duration_seconds
        int severity "1-5"
        text seizure_type
        text_array triggers_noted
        text location
        text source "manual|emergency|wearable"
        timestamptz resolved_at
    }
    emergency_events {
        uuid id PK
        uuid user_id FK
        uuid seizure_id FK
        timestamptz triggered_at
        text status "active|notified|resolved|false_alarm"
        numeric latitude
        numeric longitude
    }
    notifications {
        uuid id PK
        uuid user_id FK
        uuid contact_id FK
        uuid event_id FK
        text channel "email|sms|push|log"
        jsonb payload
        text status "queued|sent|failed"
        timestamptz sent_at
    }
    risk_assessments {
        uuid id PK
        uuid user_id FK
        date assessed_on "UK con user_id"
        int score "0-100"
        text level "low|moderate|high|critical"
        jsonb factors
        text model_version
    }
    insights {
        uuid id PK
        uuid user_id FK
        text kind
        text title
        text body
        jsonb evidence
    }
    wearable_devices {
        uuid id PK
        uuid user_id FK
        text provider
        text device_name
        text external_id
        timestamptz last_seen_at
        boolean active
    }
    wearable_samples {
        bigserial id PK
        uuid user_id FK
        uuid device_id FK
        timestamptz sampled_at
        int heart_rate
        numeric hrv_ms
        numeric spo2
        numeric motion_intensity
        numeric skin_temp_c
        int steps
    }
    wearable_alerts {
        uuid id PK
        uuid user_id FK
        uuid device_id FK
        timestamptz detected_at
        text kind "tachycardia|motion_convulsive|hr_anomaly|fall"
        numeric confidence
        jsonb payload
        uuid converted_event_id FK
    }
    audit_log {
        bigserial id PK
        uuid user_id FK
        text action
        text entity
        text entity_id
        jsonb meta
        timestamptz at
    }
```

### Decisiones de diseño

- **Borrado:** al eliminar un usuario se borran en cascada sus datos de salud; `audit_log.user_id` pasa a `NULL` para conservar la bitácora.
- **Integridad clínica en la base:** rangos (`stress_level` 1-10, `mood` 1-5, `severity` 1-5, `score` 0-100), formato `HH:MM` de los horarios, coherencia `taken_at` ↔ `status = 'taken'` y pares de coordenadas completos.
- **Índices pensados para la API:** `(user_id, sampled_at DESC)` en muestras del reloj, índices parciales para emergencias activas, notificaciones en cola y contactos/tokens vigentes.
- **Columnas extra** respecto al contrato (todas opcionales o con default): `created_at` en varias tablas, `updated_at` en `daily_logs`, `resolved_at` en `emergency_events`.

## Pruebas

`npm test` ejecuta el runner, las restricciones, el seed y las vistas contra **PGlite** (PostgreSQL en WebAssembly), por lo que no requiere Docker. Ver el PR para el alcance exacto de lo verificado.

## Despliegue en AWS RDS

Ver [docs/aws-rds.md](docs/aws-rds.md).
