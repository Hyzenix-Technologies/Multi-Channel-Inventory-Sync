import { Router } from "express";
import { z } from "zod";
import { channels, type Channel } from "../domain/types.js";
import { MockChannelState } from "./mockChannelState.js";

const shopifyBody = z
  .object({
    location_id: z.string().min(1),
    inventory_item_id: z.string().min(1),
    available: z.number().int().nonnegative(),
  })
  .strict();

const marketplaceBody = z.object({ quantity: z.number().int().nonnegative() }).strict();
const posBody = z.object({ onHand: z.number().int().nonnegative() }).strict();
const failureBody = z.object({ count: z.number().int().min(0).max(100) }).strict();

async function simulateTimeout(channel: Channel, state: MockChannelState): Promise<boolean> {
  if (!state.shouldFail(channel)) return false;
  // The adapters abort after 2 seconds. Waiting beyond that produces a real
  // client-side timeout while keeping this local mock deterministic.
  await new Promise((resolve) => setTimeout(resolve, 2_100));
  return true;
}

export function createMockChannelRouter(state: MockChannelState): Router {
  const router = Router();

  router.post("/shopify/admin/api/2026-07/inventory_levels/set.json", async (request, response) => {
    const parsed = shopifyBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "invalid Shopify inventory payload" });
      return;
    }
    if (!request.header("x-shopify-access-token")) {
      response.status(401).json({ error: "missing Shopify access token" });
      return;
    }
    if (await simulateTimeout("shopify", state)) {
      response.status(504).json({ error: "simulated Shopify timeout" });
      return;
    }
    state.record({
      channel: "shopify",
      channelSku: parsed.data.inventory_item_id,
      channelVariantId: parsed.data.inventory_item_id,
      quantity: parsed.data.available,
    });
    response.status(200).json({ inventory_level: { available: parsed.data.available } });
  });

  router.put("/marketplace/listings/:sku/inventory", async (request, response) => {
    const parsed = marketplaceBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "invalid marketplace inventory payload" });
      return;
    }
    if (!request.header("authorization")) {
      response.status(401).json({ error: "missing marketplace API key" });
      return;
    }
    if (await simulateTimeout("marketplace", state)) {
      response.status(504).json({ error: "simulated marketplace timeout" });
      return;
    }
    state.record({
      channel: "marketplace",
      channelSku: request.params.sku ?? "",
      channelVariantId: null,
      quantity: parsed.data.quantity,
    });
    response.status(200).json({ sku: request.params.sku, quantity: parsed.data.quantity });
  });

  router.patch("/pos/items/:sku/stock", async (request, response) => {
    const parsed = posBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "invalid POS inventory payload" });
      return;
    }
    if (!request.header("x-api-key")) {
      response.status(401).json({ error: "missing POS API key" });
      return;
    }
    if (await simulateTimeout("pos", state)) {
      response.status(504).json({ error: "simulated POS timeout" });
      return;
    }
    state.record({
      channel: "pos",
      channelSku: request.params.sku ?? "",
      channelVariantId: null,
      quantity: parsed.data.onHand,
    });
    response.status(200).json({ sku: request.params.sku, onHand: parsed.data.onHand });
  });

  router.post("/control/:channel/failures", (request, response) => {
    const channel = z.enum(channels).safeParse(request.params.channel);
    const body = failureBody.safeParse(request.body);
    if (!channel.success || !body.success) {
      response.status(400).json({ error: "invalid channel or failure count" });
      return;
    }
    state.failNext(channel.data, body.data.count);
    response.status(200).json({ channel: channel.data, failuresRemaining: body.data.count });
  });

  router.get("/control/updates", (_request, response) => {
    response.status(200).json({ updates: state.allUpdates() });
  });

  return router;
}
