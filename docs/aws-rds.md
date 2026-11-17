# Guía: PostgreSQL de EpiSafe IA en AWS RDS

Pasos para llevar el esquema a una instancia **RDS for PostgreSQL 16**. Los datos son de salud: usa cifrado, acceso privado y credenciales fuera del repo.

> Los ejemplos usan la región `us-east-1`, la VPC por defecto y valores de ejemplo. Cámbialos por los tuyos. No hemos ejecutado estos comandos contra una cuenta real; revísalos antes de aplicarlos.

## 1. Parameter group

Crea un grupo propio para poder ajustar parámetros sin tocar el default.

```bash
aws rds create-db-parameter-group \
  --db-parameter-group-name episafe-pg16 \
  --db-parameter-group-family postgres16 \
  --description "EpiSafe IA PostgreSQL 16"

aws rds modify-db-parameter-group \
  --db-parameter-group-name episafe-pg16 \
  --parameters \
    "ParameterName=rds.force_ssl,ParameterValue=1,ApplyMethod=immediate" \
    "ParameterName=timezone,ParameterValue=UTC,ApplyMethod=immediate" \
    "ParameterName=log_min_duration_statement,ParameterValue=500,ApplyMethod=immediate" \
    "ParameterName=log_connections,ParameterValue=1,ApplyMethod=immediate" \
    "ParameterName=idle_in_transaction_session_timeout,ParameterValue=60000,ApplyMethod=immediate"
```

- `rds.force_ssl=1`: rechaza conexiones sin TLS.
- `timezone=UTC`: todas las columnas son `timestamptz`; la zona del usuario vive en `users.timezone`.
- `log_min_duration_statement=500`: registra consultas de más de 500 ms.

## 2. Security group

Solo el back debe poder llegar al puerto 5432. **No abras 5432 a `0.0.0.0/0`.**

```bash
VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)

DB_SG=$(aws ec2 create-security-group --group-name episafe-db --description "EpiSafe RDS" \
  --vpc-id "$VPC_ID" --query GroupId --output text)

# Grupo de seguridad de la API (ECS/EC2/App Runner con VPC connector)
API_SG=sg-0123456789abcdef0

aws ec2 authorize-security-group-ingress --group-id "$DB_SG" \
  --protocol tcp --port 5432 --source-group "$API_SG"
```

Para migrar desde tu máquina durante el setup inicial, usa un bastión/SSM port-forward o añade temporalmente tu IP `/32` y retírala después:

```bash
MY_IP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --group-id "$DB_SG" --protocol tcp --port 5432 --cidr "$MY_IP/32"
# ... migrar ...
aws ec2 revoke-security-group-ingress --group-id "$DB_SG" --protocol tcp --port 5432 --cidr "$MY_IP/32"
```

## 3. Instancia

```bash
aws rds create-db-instance \
  --db-instance-identifier episafe-prod \
  --engine postgres --engine-version 16 \
  --db-instance-class db.t4g.micro \
  --allocated-storage 20 --storage-type gp3 --storage-encrypted \
  --db-name episafe \
  --master-username episafe_admin \
  --manage-master-user-password \
  --db-parameter-group-name episafe-pg16 \
  --vpc-security-group-ids "$DB_SG" \
  --no-publicly-accessible \
  --backup-retention-period 7 \
  --deletion-protection \
  --copy-tags-to-snapshot

aws rds wait db-instance-available --db-instance-identifier episafe-prod
aws rds describe-db-instances --db-instance-identifier episafe-prod \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

`--manage-master-user-password` guarda la contraseña en AWS Secrets Manager (no la escribas en el repo ni en `.env` versionado). Para pruebas rápidas puedes usar una instancia pública, pero en producción déjala privada (`--no-publicly-accessible`) y accede por la VPC.

## 4. Migrar y sembrar

Descarga el bundle de CA de RDS y construye la URL con TLS:

```bash
curl -o global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

export DATABASE_URL="postgres://episafe_admin:<PASSWORD>@<ENDPOINT>:5432/episafe"
export DATABASE_SSL=true

npm run migrate
npm run migrate:status
```

`DATABASE_SSL=true` activa TLS en `src/db.ts`. Esa configuración usa `rejectUnauthorized: false` por simplicidad; en producción conviene validar el certificado con el bundle de AWS (`ssl: { ca: fs.readFileSync("global-bundle.pem") }`).

Buena práctica: crea un usuario de aplicación con privilegios mínimos y deja el maestro solo para migrar:

```sql
CREATE ROLE episafe_app LOGIN PASSWORD '<GENERADA>';
GRANT CONNECT ON DATABASE episafe TO episafe_app;
GRANT USAGE ON SCHEMA public TO episafe_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO episafe_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO episafe_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO episafe_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO episafe_app;
```

## 5. Seed y reset en RDS

- `npm run seed` **inserta el usuario demo con contraseña pública** (`Demo1234!`): úsalo solo en entornos de demostración, nunca en producción real.
- `npm run reset` se niega a correr contra hosts que no sean locales. Para forzarlo en un entorno desechable: `ALLOW_REMOTE_RESET=true npm run reset`. Destruye todos los datos.

## 6. Operación

- **Backups:** retención de 7 días (arriba); haz un snapshot manual antes de cada migración: `aws rds create-db-snapshot --db-instance-identifier episafe-prod --db-snapshot-identifier pre-migracion-$(date +%Y%m%d)`.
- **Multi-AZ:** añade `--multi-az` para alta disponibilidad.
- **Monitoreo:** activa Performance Insights y revisa los logs de consultas lentas en CloudWatch.
- **Rotación de secretos:** usa la rotación de Secrets Manager y lee la URL desde allí en el back.
- **Coste:** apaga o elimina (`--skip-final-snapshot` solo en pruebas) instancias de demostración cuando no se usen.
