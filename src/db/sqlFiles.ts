import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";

async function orderedSqlFiles(directory: string): Promise<string[]> {
  const names = await readdir(directory);
  return names.filter((name) => name.endsWith(".sql")).sort();
}

export async function runMigrations(pool: Pool, rootDirectory = process.cwd()): Promise<void> {
  const migrationDirectory = path.join(rootDirectory, "migrations");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const name of await orderedSqlFiles(migrationDirectory)) {
    const alreadyApplied = await pool.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1) AS exists",
      [name],
    );
    if (alreadyApplied.rows[0]?.exists) continue;

    const sql = await readFile(path.join(migrationDirectory, name), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function runSeeds(pool: Pool, rootDirectory = process.cwd()): Promise<void> {
  const seedDirectory = path.join(rootDirectory, "seeds");
  for (const name of await orderedSqlFiles(seedDirectory)) {
    const sql = await readFile(path.join(seedDirectory, name), "utf8");
    await pool.query(sql);
  }
}
