import { z } from "zod";
import { webhookEventTypes } from "../domain/types.js";

export const webhookSchema = z
  .object({
    eventId: z.string().trim().min(1).max(255),
    channelSku: z.string().trim().min(1).max(255),
    type: z.enum(webhookEventTypes),
    quantityChange: z.number().int().refine((value) => value !== 0, {
      message: "quantityChange must not be zero",
    }),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === "sale" && value.quantityChange >= 0) {
      context.addIssue({
        code: "custom",
        path: ["quantityChange"],
        message: "A sale requires a negative quantityChange",
      });
    }
    if (value.type === "return" && value.quantityChange <= 0) {
      context.addIssue({
        code: "custom",
        path: ["quantityChange"],
        message: "A return requires a positive quantityChange",
      });
    }
  });
