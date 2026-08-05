import "dotenv/config";
import { loadConfig } from "../config/env.js";
import { createDatabasePool } from "../db/pool.js";
import { runSeeds } from "../db/sqlFiles.js";

const config = loadConfig();
const pool = createDatabasePool(config.databaseUrl);

try {
  await runSeeds(pool);
  console.log(JSON.stringify({ level: "info", message: "Seed data loaded" }));
} finally {
  await pool.end();
}
