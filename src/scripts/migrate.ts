import "dotenv/config";
import { loadConfig } from "../config/env.js";
import { createDatabasePool } from "../db/pool.js";
import { runMigrations } from "../db/sqlFiles.js";

const config = loadConfig();
const pool = createDatabasePool(config.databaseUrl);

try {
  await runMigrations(pool);
  console.log(JSON.stringify({ level: "info", message: "Database migrations completed" }));
} finally {
  await pool.end();
}
