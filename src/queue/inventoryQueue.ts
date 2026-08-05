import { Queue, type JobsOptions } from "bullmq";
import type { RedisOptions } from "ioredis";
import type { Channel, ChannelMapping } from "../domain/types.js";

export interface InventorySyncJobData {
  inventoryId: string;
  channel: Channel;
  channelSku: string;
  channelVariantId: string | null;
  quantity: number;
  webhookEventId: string;
}

export interface InventorySyncPublisher {
  publish(input: {
    mappings: ChannelMapping[];
    quantity: number;
    webhookEventId: string;
  }): Promise<void>;
}

export const inventoryJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: false,
  removeOnFail: false,
};

export class BullMqInventorySyncPublisher implements InventorySyncPublisher {
  constructor(private readonly queue: Queue<InventorySyncJobData>) {}

  async publish(input: {
    mappings: ChannelMapping[];
    quantity: number;
    webhookEventId: string;
  }): Promise<void> {
    if (input.mappings.length === 0) return;

    await this.queue.addBulk(
      input.mappings.map((mapping) => ({
        name: `sync-${mapping.channel}`,
        data: {
          inventoryId: mapping.inventoryId,
          channel: mapping.channel,
          channelSku: mapping.channelSku,
          channelVariantId: mapping.channelVariantId,
          quantity: input.quantity,
          webhookEventId: input.webhookEventId,
        },
        opts: {
          ...inventoryJobOptions,
          jobId: `sync-${input.webhookEventId}-${mapping.channel}`,
        },
      })),
    );
  }
}

export function createInventoryQueue(
  name: string,
  connection: RedisOptions,
): Queue<InventorySyncJobData> {
  return new Queue<InventorySyncJobData>(name, { connection });
}
