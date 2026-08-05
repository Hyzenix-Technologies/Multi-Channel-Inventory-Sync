import type { Channel } from "../domain/types.js";

export interface MockInventoryUpdate {
  channel: Channel;
  channelSku: string;
  channelVariantId: string | null;
  quantity: number;
  receivedAt: Date;
}

export class MockChannelState {
  private readonly updates: MockInventoryUpdate[] = [];
  private readonly remainingFailures: Record<Channel, number> = {
    shopify: 0,
    marketplace: 0,
    pos: 0,
  };

  failNext(channel: Channel, count: number): void {
    this.remainingFailures[channel] = count;
  }

  shouldFail(channel: Channel): boolean {
    if (this.remainingFailures[channel] <= 0) return false;
    this.remainingFailures[channel] -= 1;
    return true;
  }

  record(update: Omit<MockInventoryUpdate, "receivedAt">): void {
    this.updates.push({ ...update, receivedAt: new Date() });
  }

  updatesFor(channel: Channel): MockInventoryUpdate[] {
    return this.updates.filter((update) => update.channel === channel);
  }

  allUpdates(): MockInventoryUpdate[] {
    return [...this.updates];
  }

  reset(): void {
    this.updates.length = 0;
    this.remainingFailures.shopify = 0;
    this.remainingFailures.marketplace = 0;
    this.remainingFailures.pos = 0;
  }
}
