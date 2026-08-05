import express, { type Express } from "express";
import type { Pool } from "pg";
import { WebhookController } from "./controllers/webhookController.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createMockChannelRouter } from "./mocks/mockChannelRouter.js";
import type { MockChannelState } from "./mocks/mockChannelState.js";

export function createApp(input: {
  pool: Pool;
  webhookController: WebhookController;
  mockChannelState?: MockChannelState;
}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", async (_request, response, next) => {
    try {
      await input.pool.query("SELECT 1");
      response.status(200).json({ status: "ok" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/webhooks/:channel", input.webhookController.handle);
  if (input.mockChannelState) {
    app.use("/mock-apis", createMockChannelRouter(input.mockChannelState));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
