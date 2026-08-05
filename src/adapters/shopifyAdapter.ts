import type { InventoryChannelAdapter } from "../domain/types.js";
import { sendJson } from "./httpClient.js";

export class ShopifyAdapter implements InventoryChannelAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly accessToken: string,
    private readonly locationId: string,
  ) {}

  async updateInventory(input: {
    channelSku: string;
    channelVariantId?: string;
    quantity: number;
  }): Promise<void> {
    await sendJson(`${this.baseUrl}/mock-apis/shopify/admin/api/2026-07/inventory_levels/set.json`, {
      method: "POST",
      headers: { "x-shopify-access-token": this.accessToken },
      body: {
        location_id: this.locationId,
        inventory_item_id: input.channelVariantId ?? input.channelSku,
        available: input.quantity,
      },
    });
  }
}
