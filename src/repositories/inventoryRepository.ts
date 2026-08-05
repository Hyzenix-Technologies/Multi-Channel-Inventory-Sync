import type { PoolClient } from "pg";
import type { Channel, ChannelMapping, LockedInventory } from "../domain/types.js";

interface LockedInventoryRow {
  inventory_id: string;
  canonical_sku: string;
  quantity: number;
  channel: Channel;
  channel_sku: string;
  channel_variant_id: string | null;
}

interface MappingRow {
  inventory_id: string;
  channel: Channel;
  channel_sku: string;
  channel_variant_id: string | null;
}

export class InventoryRepository {
  async lockByChannelSku(
    client: PoolClient,
    channel: Channel,
    channelSku: string,
  ): Promise<LockedInventory | null> {
    const result = await client.query<LockedInventoryRow>(
      `SELECT i.id AS inventory_id,
              i.canonical_sku,
              i.quantity,
              cm.channel,
              cm.channel_sku,
              cm.channel_variant_id
       FROM channel_mappings cm
       JOIN inventory i ON i.id = cm.inventory_id
       WHERE cm.channel = $1 AND cm.channel_sku = $2
       FOR UPDATE OF i`,
      [channel, channelSku],
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      inventoryId: row.inventory_id,
      canonicalSku: row.canonical_sku,
      quantity: row.quantity,
      channel: row.channel,
      channelSku: row.channel_sku,
      channelVariantId: row.channel_variant_id,
    };
  }

  async recordWebhookEvent(
    client: PoolClient,
    channel: Channel,
    externalEventId: string,
  ): Promise<string | null> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO webhook_events (channel, external_event_id)
       VALUES ($1, $2)
       ON CONFLICT (channel, external_event_id) DO NOTHING
       RETURNING id`,
      [channel, externalEventId],
    );
    return result.rows[0]?.id ?? null;
  }

  async updateQuantity(client: PoolClient, inventoryId: string, quantity: number): Promise<void> {
    await client.query(
      `UPDATE inventory
       SET quantity = $2, updated_at = NOW()
       WHERE id = $1`,
      [inventoryId, quantity],
    );
  }

  async findTargetMappings(
    client: PoolClient,
    inventoryId: string,
    originChannel: Channel,
  ): Promise<ChannelMapping[]> {
    const result = await client.query<MappingRow>(
      `SELECT inventory_id, channel, channel_sku, channel_variant_id
       FROM channel_mappings
       WHERE inventory_id = $1 AND channel <> $2
       ORDER BY channel`,
      [inventoryId, originChannel],
    );
    return result.rows.map((row) => ({
      inventoryId: row.inventory_id,
      channel: row.channel,
      channelSku: row.channel_sku,
      channelVariantId: row.channel_variant_id,
    }));
  }
}
