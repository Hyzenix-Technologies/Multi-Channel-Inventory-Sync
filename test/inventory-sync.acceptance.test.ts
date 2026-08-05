import { createServer, type Server } from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Queue, type Worker } from "bullmq";
import EmbeddedPostgres from "embedded-postgres";
import type { Express } from "express";
import type { RedisOptions } from "ioredis";
import type { Pool } from "pg";
import { RedisMemoryServer } from "redis-memory-server";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdapters } from "../src/adapters/index.js";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";
import { WebhookController } from "../src/controllers/webhookController.js";
import { createDatabasePool } from "../src/db/pool.js";
import { runMigrations, runSeeds } from "../src/db/sqlFiles.js";
import { MockChannelState } from "../src/mocks/mockChannelState.js";
import {
  BullMqInventorySyncPublisher,
  createInventoryQueue,
  type InventorySyncJobData,
} from "../src/queue/inventoryQueue.js";
import { createInventoryWorker } from "../src/queue/inventoryWorker.js";
import { InventoryRepository } from "../src/repositories/inventoryRepository.js";
import { InventoryService } from "../src/services/inventoryService.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let postgres: EmbeddedPostgres;
let redis: RedisMemoryServer;
let pool: Pool;
let redisConnection: RedisOptions;
let redisHost: string;
let redisPort: number;

interface TestHarness {
  app: Express;
  baseUrl: string;
  state: MockChannelState;
  queue: Queue<InventorySyncJobData>;
  worker: Worker<InventorySyncJobData>;
  server: Server;
}

let harness: TestHarness | undefined;

async function unusedPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to allocate an integration-test port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test HTTP server did not bind");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function waitUntil(assertion: () => void | Promise<void>, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw lastError;
}

async function quantity(): Promise<number> {
  const result = await pool.query<{ quantity: number }>(
    "SELECT quantity FROM inventory WHERE canonical_sku = 'CANONICAL-RED-SHIRT'",
  );
  const row = result.rows[0];
  if (!row) throw new Error("Seed inventory is missing");
  return row.quantity;
}

async function setQuantity(nextQuantity: number): Promise<void> {
  await pool.query(
    "UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE canonical_sku = 'CANONICAL-RED-SHIRT'",
    [nextQuantity],
  );
}

async function createHarness(): Promise<TestHarness> {
  const queueName = `inventory-sync-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const queue = createInventoryQueue(queueName, redisConnection);
  await queue.waitUntilReady();
  const service = new InventoryService(
    pool,
    new InventoryRepository(),
    new BullMqInventorySyncPublisher(queue),
  );
  const state = new MockChannelState();
  const app = createApp({
    pool,
    webhookController: new WebhookController(service),
    mockChannelState: state,
  });
  const listener = await listen(app);
  const config: AppConfig = {
    nodeEnv: "test",
    port: Number(new URL(listener.baseUrl).port),
    databaseUrl: "unused-by-test-adapters",
    redis: { host: redisHost, port: redisPort },
    inventoryQueueName: queueName,
    mockApiBaseUrl: listener.baseUrl,
    enableMockApis: true,
    shopifyAccessToken: "test-shopify-token",
    shopifyLocationId: "test-location",
    marketplaceApiKey: "test-marketplace-key",
    posApiKey: "test-pos-key",
  };
  const worker = createInventoryWorker({
    queueName,
    connection: redisConnection,
    pool,
    adapters: createAdapters(config),
  });
  await worker.waitUntilReady();
  return { app, baseUrl: listener.baseUrl, state, queue, worker, server: listener.server };
}

beforeAll(async () => {
  const postgresPort = await unusedPort();
  postgres = new EmbeddedPostgres({
    databaseDir: path.join(projectRoot, ".test-data", `postgres-${process.pid}`),
    user: "postgres",
    password: "postgres",
    port: postgresPort,
    persistent: false,
    onLog: () => undefined,
    onError: (error) => console.error(error),
  });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("inventory_sync_test");

  redis = new RedisMemoryServer();
  redisHost = await redis.getHost();
  redisPort = await redis.getPort();
  redisConnection = {
    host: redisHost,
    port: redisPort,
    maxRetriesPerRequest: null,
  };
  pool = createDatabasePool(
    `postgresql://postgres:postgres@127.0.0.1:${postgresPort}/inventory_sync_test`,
  );
  await runMigrations(pool, projectRoot);
});

beforeEach(async () => {
  await pool.query(
    "TRUNCATE TABLE sync_logs, webhook_events, channel_mappings, inventory RESTART IDENTITY CASCADE",
  );
  await runSeeds(pool, projectRoot);
  harness = await createHarness();
});

afterEach(async () => {
  if (!harness) return;
  await harness.worker.close();
  await harness.queue.close();
  await closeServer(harness.server);
  harness = undefined;
});

afterAll(async () => {
  if (pool) await pool.end();
  if (redis) await redis.stop();
  if (postgres) await postgres.stop();
});

describe("Multi-Channel Inventory Sync acceptance criteria", () => {
  it("Acceptance: Basic Inventory Sync", async () => {
    const active = harness;
    if (!active) throw new Error("Test harness is unavailable");

    const response = await request(active.baseUrl).post("/webhooks/shopify").send({
      eventId: "evt-basic-1001",
      channelSku: "SHOP-RED-001",
      type: "sale",
      quantityChange: -1,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "processed", quantity: 4 });
    expect(await quantity()).toBe(4);
    await waitUntil(() => {
      expect(active.state.updatesFor("marketplace")).toHaveLength(1);
      expect(active.state.updatesFor("pos")).toHaveLength(1);
    });
    expect(active.state.updatesFor("marketplace")[0]).toMatchObject({ quantity: 4 });
    expect(active.state.updatesFor("pos")[0]).toMatchObject({ quantity: 4 });
    expect(active.state.updatesFor("shopify")).toHaveLength(0);
  });

  it("Acceptance: Partial Failure and Retry", async () => {
    const active = harness;
    if (!active) throw new Error("Test harness is unavailable");
    active.state.failNext("marketplace", 1);

    const response = await request(active.baseUrl).post("/webhooks/shopify").send({
      eventId: "evt-retry-1001",
      channelSku: "SHOP-RED-001",
      type: "sale",
      quantityChange: -1,
    });
    expect(response.status).toBe(200);

    await waitUntil(() => {
      expect(active.state.updatesFor("pos")).toHaveLength(1);
      expect(active.state.updatesFor("marketplace")).toHaveLength(1);
    });
    await waitUntil(async () => {
      const completedRetry = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM sync_logs
         WHERE channel = 'marketplace' AND attempt_number = 2 AND status = 'succeeded'`,
      );
      expect(completedRetry.rows[0]?.count).toBe("1");
    });

    const logs = await pool.query<{
      channel: string;
      status: string;
      attempt_number: number;
    }>(
      `SELECT channel, status, attempt_number
       FROM sync_logs
       ORDER BY channel, attempt_number`,
    );
    expect(logs.rows.filter((row) => row.channel === "marketplace")).toEqual([
      { channel: "marketplace", status: "failed", attempt_number: 1 },
      { channel: "marketplace", status: "succeeded", attempt_number: 2 },
    ]);
    expect(logs.rows.filter((row) => row.channel === "pos")).toEqual([
      { channel: "pos", status: "succeeded", attempt_number: 1 },
    ]);
    expect(active.state.updatesFor("pos")).toHaveLength(1);
  });

  it("Acceptance: Duplicate Webhook Idempotency", async () => {
    const active = harness;
    if (!active) throw new Error("Test harness is unavailable");
    const payload = {
      eventId: "evt-duplicate-1001",
      channelSku: "SHOP-RED-001",
      type: "sale",
      quantityChange: -1,
    };

    const first = await request(active.baseUrl).post("/webhooks/shopify").send(payload);
    const duplicate = await request(active.baseUrl).post("/webhooks/shopify").send(payload);

    expect(first.status).toBe(200);
    expect(first.body.status).toBe("processed");
    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toEqual({ status: "duplicate", eventId: payload.eventId });
    expect(await quantity()).toBe(4);
    const eventCount = await pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM webhook_events");
    expect(eventCount.rows[0]?.count).toBe("1");
    await waitUntil(() => {
      expect(active.state.updatesFor("marketplace")).toHaveLength(1);
      expect(active.state.updatesFor("pos")).toHaveLength(1);
    });
  });

  it("Acceptance: Parallel Race-Condition Last Unit", async () => {
    const active = harness;
    if (!active) throw new Error("Test harness is unavailable");
    await setQuantity(1);

    const settled = await Promise.allSettled([
      request(active.baseUrl).post("/webhooks/shopify").send({
        eventId: "evt-race-shopify",
        channelSku: "SHOP-RED-001",
        type: "sale",
        quantityChange: -1,
      }),
      request(active.baseUrl).post("/webhooks/marketplace").send({
        eventId: "evt-race-marketplace",
        channelSku: "AMZ-RS-987",
        type: "sale",
        quantityChange: -1,
      }),
    ]);

    expect(settled.every((result) => result.status === "fulfilled")).toBe(true);
    const statuses = settled
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value.status)
      .sort((left, right) => left - right);
    expect(statuses).toEqual([200, 409]);
    expect(await quantity()).toBe(0);
    const minimum = await pool.query<{ minimum: number }>("SELECT MIN(quantity) AS minimum FROM inventory");
    expect(minimum.rows[0]?.minimum).toBe(0);
  });

  it("Acceptance: Different Channel SKU Mapping", async () => {
    const active = harness;
    if (!active) throw new Error("Test harness is unavailable");

    await request(active.baseUrl).post("/webhooks/shopify").send({
      eventId: "evt-mapping-sale",
      channelSku: "SHOP-RED-001",
      type: "sale",
      quantityChange: -1,
    });
    await waitUntil(() => {
      expect(active.state.updatesFor("marketplace")).toHaveLength(1);
      expect(active.state.updatesFor("pos")).toHaveLength(1);
    });

    await request(active.baseUrl).post("/webhooks/pos").send({
      eventId: "evt-mapping-return",
      channelSku: "POS-4455",
      type: "return",
      quantityChange: 1,
    });
    await waitUntil(() => {
      expect(active.state.updatesFor("shopify")).toHaveLength(1);
      expect(active.state.updatesFor("marketplace")).toHaveLength(2);
    });

    expect(active.state.updatesFor("marketplace").map((update) => update.channelSku)).toEqual([
      "AMZ-RS-987",
      "AMZ-RS-987",
    ]);
    expect(active.state.updatesFor("pos")[0]?.channelSku).toBe("POS-4455");
    expect(active.state.updatesFor("shopify")[0]).toMatchObject({
      channelVariantId: "gid://shopify/InventoryItem/1001",
      quantity: 5,
    });
  });

  it("returns structured 400, 404, and 409 API errors", async () => {
    const active = harness;
    if (!active) throw new Error("Test harness is unavailable");

    const invalid = await request(active.baseUrl).post("/webhooks/shopify").send({
      eventId: "evt-invalid",
      channelSku: "SHOP-RED-001",
      type: "sale",
      quantityChange: 1,
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("INVALID_PAYLOAD");

    const missing = await request(active.baseUrl).post("/webhooks/shopify").send({
      eventId: "evt-missing",
      channelSku: "DOES-NOT-EXIST",
      type: "sale",
      quantityChange: -1,
    });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("MAPPING_NOT_FOUND");

    const outOfStock = await request(active.baseUrl).post("/webhooks/shopify").send({
      eventId: "evt-out-of-stock",
      channelSku: "SHOP-RED-001",
      type: "sale",
      quantityChange: -6,
    });
    expect(outOfStock.status).toBe(409);
    expect(outOfStock.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await quantity()).toBe(5);
  });
});
