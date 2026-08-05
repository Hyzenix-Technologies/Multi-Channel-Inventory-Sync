import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { channels } from "../domain/types.js";
import { AppError } from "../errors/AppError.js";
import { webhookSchema } from "../routes/webhookSchema.js";
import type { InventoryService } from "../services/inventoryService.js";

export class WebhookController {
  constructor(private readonly inventoryService: InventoryService) {}

  handle = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const channel = z.enum(channels).safeParse(request.params.channel);
      if (!channel.success) {
        throw new AppError(400, "INVALID_CHANNEL", "Unsupported sales channel", {
          supportedChannels: channels,
        });
      }

      const payload = webhookSchema.safeParse(request.body);
      if (!payload.success) {
        throw new AppError(400, "INVALID_PAYLOAD", "Webhook payload validation failed", {
          issues: payload.error.issues,
        });
      }

      const result = await this.inventoryService.processWebhook(channel.data, payload.data);
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
