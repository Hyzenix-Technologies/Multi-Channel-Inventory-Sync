import "dotenv/config";
import { createServer } from "node:http";
import { createAdapters } from "./adapters/index.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { WebhookController } from "./controllers/webhookController.js";
import { createDatabasePool } from "./db/pool.js";
import { MockChannelState } from "./mocks/mockChannelState.js";
import {
  BullMqInventorySyncPublisher,
  createInventoryQueue,
} from "./queue/inventoryQueue.js";
import { createInventoryWorker } from "./queue/inventoryWorker.js";
import { InventoryRepository } from "./repositories/inventoryRepository.js";
import { InventoryService } from "./services/inventoryService.js";

const config = loadConfig();
const pool = createDatabasePool(config.databaseUrl);
await pool.query("SELECT 1");

const queue = createInventoryQueue(config.inventoryQueueName, config.redis);
await queue.waitUntilReady();
const publisher = new BullMqInventorySyncPublisher(queue);
const service = new InventoryService(pool, new InventoryRepository(), publisher);
const mockState = config.enableMockApis ? new MockChannelState() : undefined;
const appInput = mockState
  ? { pool, webhookController: new WebhookController(service), mockChannelState: mockState }
  : { pool, webhookController: new WebhookController(service) };
const app = createApp(appInput);
const server = createServer(app);
const adapters = createAdapters(config);
const worker = createInventoryWorker({
  queueName: config.inventoryQueueName,
  connection: config.redis,
  pool,
  adapters,
});
await worker.waitUntilReady();

server.listen(config.port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      level: "info",
      message: "Multi-Channel Inventory Sync started",
      port: config.port,
    }),
  );
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", message: "Shutting down", signal }));
  server.close();
  await worker.close();
  await queue.close();
  await pool.end();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal).then(() => process.exit(0));
  });
}
