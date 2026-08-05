import type { InventoryChannelAdapter } from "../domain/types.js";
import { sendJson } from "./httpClient.js";

export class MarketplaceAdapter implements InventoryChannelAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async updateInventory(input: {
    channelSku: string;
    channelVariantId?: string;
    quantity: number;
  }): Promise<void> {
    await sendJson(
      `${this.baseUrl}/mock-apis/marketplace/listings/${encodeURIComponent(input.channelSku)}/inventory`,
      {
        method: "PUT",
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: { quantity: input.quantity },
      },
    );
  }
}
