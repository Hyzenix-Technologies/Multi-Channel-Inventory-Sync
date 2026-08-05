import { Worker, type Job } from "bullmq";
import type { RedisOptions } from "ioredis";
import type { Pool } from "pg";
import type { AdapterRegistry } from "../adapters/index.js";
import { SyncLogRepository } from "../repositories/syncLogRepository.js";
import type { InventorySyncJobData } from "./inventoryQueue.js";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 2_000);
  return String(error).slice(0, 2_000);
}

export function createInventoryWorker(input: {
  queueName: string;
  connection: RedisOptions;
  pool: Pool;
  adapters: AdapterRegistry;
}): Worker<InventorySyncJobData> {
  const logs = new SyncLogRepository(input.pool);

  return new Worker<InventorySyncJobData>(
    input.queueName,
    async (job: Job<InventorySyncJobData>) => {
      const jobId = job.id;
      if (!jobId) throw new Error("BullMQ job is missing an ID");

      const attemptNumber = job.attemptsMade + 1;
      const logId = await logs.startAttempt({
        inventoryId: job.data.inventoryId,
        channel: job.data.channel,
        jobId,
        attemptNumber,
      });

      try {
        const adapter = input.adapters[job.data.channel];
        const adapterInput = job.data.channelVariantId
          ? {
              channelSku: job.data.channelSku,
              channelVariantId: job.data.channelVariantId,
              quantity: job.data.quantity,
            }
          : { channelSku: job.data.channelSku, quantity: job.data.quantity };
        await adapter.updateInventory(adapterInput);
        await logs.finishAttempt(logId, "succeeded");
      } catch (error) {
        await logs.finishAttempt(logId, "failed", errorMessage(error));
        throw error;
      }
    },
    {
      connection: input.connection,
      concurrency: 10,
    },
  );
}
