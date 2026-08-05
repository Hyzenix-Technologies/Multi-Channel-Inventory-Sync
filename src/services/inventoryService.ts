import type { Pool } from "pg";
import type { Channel, WebhookInput } from "../domain/types.js";
import { InsufficientStockError, MappingNotFoundError } from "../errors/AppError.js";
import type { InventorySyncPublisher } from "../queue/inventoryQueue.js";
import { InventoryRepository } from "../repositories/inventoryRepository.js";

export type WebhookResult =
  | {
      status: "duplicate";
      eventId: string;
    }
  | {
      status: "processed";
      eventId: string;
      canonicalSku: string;
      previousQuantity: number;
      quantity: number;
      enqueuedChannels: Channel[];
    };

export class InventoryService {
  constructor(
    private readonly pool: Pool,
    private readonly repository: InventoryRepository,
    private readonly publisher: InventorySyncPublisher,
  ) {}

  async processWebhook(channel: Channel, input: WebhookInput): Promise<WebhookResult> {
    const client = await this.pool.connect();
    let publishInput:
      | {
          mappings: Awaited<ReturnType<InventoryRepository["findTargetMappings"]>>;
          quantity: number;
          webhookEventId: string;
        }
      | undefined;
    let processedResult: Extract<WebhookResult, { status: "processed" }> | undefined;

    try {
      await client.query("BEGIN");
      const inventory = await this.repository.lockByChannelSku(client, channel, input.channelSku);
      if (!inventory) throw new MappingNotFoundError();

      const webhookEventId = await this.repository.recordWebhookEvent(client, channel, input.eventId);
      if (!webhookEventId) {
        await client.query("COMMIT");
        return { status: "duplicate", eventId: input.eventId };
      }

      const nextQuantity = inventory.quantity + input.quantityChange;
      if (nextQuantity < 0) {
        throw new InsufficientStockError(inventory.quantity, input.quantityChange);
      }

      await this.repository.updateQuantity(client, inventory.inventoryId, nextQuantity);
      const mappings = await this.repository.findTargetMappings(
        client,
        inventory.inventoryId,
        channel,
      );

      await client.query("COMMIT");

      publishInput = { mappings, quantity: nextQuantity, webhookEventId };
      processedResult = {
        status: "processed",
        eventId: input.eventId,
        canonicalSku: inventory.canonicalSku,
        previousQuantity: inventory.quantity,
        quantity: nextQuantity,
        enqueuedChannels: mappings.map((mapping) => mapping.channel),
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    } finally {
      client.release();
    }

    if (!publishInput || !processedResult) throw new Error("Inventory transaction produced no result");
    await this.publisher.publish(publishInput);
    return processedResult;
  }
}
