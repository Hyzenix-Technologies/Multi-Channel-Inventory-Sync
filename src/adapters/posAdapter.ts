import type { InventoryChannelAdapter } from "../domain/types.js";
import { sendJson } from "./httpClient.js";

export class PosAdapter implements InventoryChannelAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async updateInventory(input: {
    channelSku: string;
    channelVariantId?: string;
    quantity: number;
  }): Promise<void> {
    await sendJson(`${this.baseUrl}/mock-apis/pos/items/${encodeURIComponent(input.channelSku)}/stock`, {
      method: "PATCH",
      headers: { "x-api-key": this.apiKey },
      body: { onHand: input.quantity },
    });
  }
}
