import net from "node:net";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { RedisMemoryServer } from "redis-memory-server";
import { createDatabasePool } from "../db/pool.js";
import { runMigrations, runSeeds } from "../db/sqlFiles.js";

async function unusedPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to allocate a local infrastructure port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

const apiPort = Number(process.env.PORT ?? "3000");
const postgresPort = await unusedPort();
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(process.cwd(), ".local-data", `postgres-${process.pid}`),
  user: "postgres",
  password: "postgres",
  port: postgresPort,
  persistent: false,
  onLog: () => undefined,
  onError: (error) => console.error(error),
});
const redis = new RedisMemoryServer();

async function stopInfrastructure(): Promise<void> {
  await redis.stop();
  await postgres.stop();
}

try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("inventory_sync_local");

  const redisHost = await redis.getHost();
  const redisPort = await redis.getPort();
  const databaseUrl =
    `postgresql://postgres:postgres@127.0.0.1:${postgresPort}/inventory_sync_local`;
  const setupPool = createDatabasePool(databaseUrl);
  try {
    await runMigrations(setupPool);
    await runSeeds(setupPool);
  } finally {
    await setupPool.end();
  }

  process.env.NODE_ENV = "development";
  process.env.PORT = String(apiPort);
  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_HOST = redisHost;
  process.env.REDIS_PORT = String(redisPort);
  process.env.INVENTORY_QUEUE_NAME = `inventory-sync-local-${process.pid}`;
  process.env.MOCK_API_BASE_URL = `http://127.0.0.1:${apiPort}`;
  process.env.ENABLE_MOCK_APIS = "true";
  process.env.SHOPIFY_ACCESS_TOKEN ??= "local-shopify-token";
  process.env.SHOPIFY_LOCATION_ID ??= "local-location";
  process.env.MARKETPLACE_API_KEY ??= "local-marketplace-key";
  process.env.POS_API_KEY ??= "local-pos-key";

  process.once("beforeExit", () => {
    void stopInfrastructure();
  });

  await import("../server.js");
  console.log(
    JSON.stringify({
      level: "info",
      message: "Portable local environment is ready",
      url: `http://127.0.0.1:${apiPort}`,
    }),
  );
} catch (error) {
  await stopInfrastructure();
  throw error;
}
