import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "./db.js";
import { up } from "./migrate.js";
import { seed } from "./seed.js";

/** Drops the public schema, re-applies every migration and re-seeds. Development only. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = url === "" || /@(localhost|127\.0\.0\.1|postgres)[:/]/.test(url);
  if (!isLocal && process.env.ALLOW_REMOTE_RESET !== "true") {
    throw new Error("Refusing to reset a non-local database. Set ALLOW_REMOTE_RESET=true to override.");
  }
  const db = connect();
  try {
    console.log("Dropping schema public...");
    await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await up(db);
    const d = await seed(db);
    console.log(`Reset complete: ${d.dailyLogs.length} days, ${d.seizures.length} seizures`);
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
