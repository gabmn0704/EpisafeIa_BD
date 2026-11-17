import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, type Db } from "./db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, "..", "migrations");

const FILE_RE = /^(\d{3})_[a-z0-9_]+\.sql$/;

export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationStatus {
  version: string;
  name: string;
  state: "applied" | "pending" | "modified";
  appliedAt?: Date;
}

export async function loadMigrations(dir = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const files = (await readdir(dir)).filter((f) => FILE_RE.test(f)).sort();
  const out: MigrationFile[] = [];
  for (const f of files) {
    const sql = await readFile(path.join(dir, f), "utf8");
    out.push({
      version: f.slice(0, 3),
      name: f.replace(/\.sql$/, ""),
      sql,
      checksum: createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex"),
    });
  }
  return out;
}

export async function ensureMigrationsTable(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text PRIMARY KEY,
      name        text NOT NULL,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )`);
}

interface AppliedRow extends Record<string, unknown> {
  version: string;
  checksum: string;
  applied_at: Date | string;
}

async function applied(db: Db): Promise<Map<string, AppliedRow>> {
  const rows = await db.query<AppliedRow>(
    "SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version",
  );
  return new Map(rows.map((r) => [r.version, r]));
}

export async function status(db: Db, dir = MIGRATIONS_DIR): Promise<MigrationStatus[]> {
  await ensureMigrationsTable(db);
  const [files, done] = await Promise.all([loadMigrations(dir), applied(db)]);
  return files.map((m) => {
    const row = done.get(m.version);
    if (!row) return { version: m.version, name: m.name, state: "pending" as const };
    return {
      version: m.version,
      name: m.name,
      state: row.checksum === m.checksum ? ("applied" as const) : ("modified" as const),
      appliedAt: new Date(row.applied_at),
    };
  });
}

/** Applies every pending migration, each one in its own transaction. Returns applied names. */
export async function up(db: Db, dir = MIGRATIONS_DIR, log: (m: string) => void = console.log): Promise<string[]> {
  await ensureMigrationsTable(db);
  const [files, done] = await Promise.all([loadMigrations(dir), applied(db)]);
  const ran: string[] = [];
  for (const m of files) {
    const row = done.get(m.version);
    if (row) {
      if (row.checksum !== m.checksum) {
        throw new Error(`Migration ${m.name} was modified after being applied (checksum mismatch)`);
      }
      continue;
    }
    log(`-> applying ${m.name}`);
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query(
        "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
        [m.version, m.name, m.checksum],
      );
    });
    ran.push(m.name);
  }
  log(ran.length ? `${ran.length} migration(s) applied` : "Database is up to date");
  return ran;
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "up";
  const db = connect();
  try {
    if (cmd === "up") {
      await up(db);
    } else if (cmd === "status") {
      for (const s of await status(db)) {
        const when = s.appliedAt ? ` (${s.appliedAt.toISOString()})` : "";
        console.log(`${s.state.padEnd(8)} ${s.name}${when}`);
      }
    } else {
      console.error(`Unknown command "${cmd}". Usage: migrate.ts [up|status]`);
      process.exitCode = 1;
    }
  } finally {
    await db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
