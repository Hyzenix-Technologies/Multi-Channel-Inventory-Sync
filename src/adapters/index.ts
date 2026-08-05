import type { AppConfig } from "../config/env.js";
import type { Channel, InventoryChannelAdapter } from "../domain/types.js";
import { MarketplaceAdapter } from "./marketplaceAdapter.js";
import { PosAdapter } from "./posAdapter.js";
import { ShopifyAdapter } from "./shopifyAdapter.js";

export type AdapterRegistry = Record<Channel, InventoryChannelAdapter>;

export function createAdapters(config: AppConfig): AdapterRegistry {
  return {
    shopify: new ShopifyAdapter(
      config.mockApiBaseUrl,
      config.shopifyAccessToken,
      config.shopifyLocationId,
    ),
    marketplace: new MarketplaceAdapter(config.mockApiBaseUrl, config.marketplaceApiKey),
    pos: new PosAdapter(config.mockApiBaseUrl, config.posApiKey),
  };
}
