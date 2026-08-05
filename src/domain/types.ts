export const channels = ["shopify", "marketplace", "pos"] as const;

export type Channel = (typeof channels)[number];

export const webhookEventTypes = ["sale", "return", "manual_adjustment"] as const;

export type WebhookEventType = (typeof webhookEventTypes)[number];

export interface InventoryChannelAdapter {
  updateInventory(input: {
    channelSku: string;
    channelVariantId?: string;
    quantity: number;
  }): Promise<void>;
}

export interface WebhookInput {
  eventId: string;
  channelSku: string;
  type: WebhookEventType;
  quantityChange: number;
}

export interface ChannelMapping {
  inventoryId: string;
  channel: Channel;
  channelSku: string;
  channelVariantId: string | null;
}

export interface LockedInventory extends ChannelMapping {
  canonicalSku: string;
  quantity: number;
}
