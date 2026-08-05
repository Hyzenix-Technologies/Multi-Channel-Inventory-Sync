import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://inventory:inventory@localhost:5432/inventory_sync"),
  REDIS_HOST: z.string().min(1).default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().min(1).max(65_535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  INVENTORY_QUEUE_NAME: z.string().min(1).default("inventory-sync"),
  MOCK_API_BASE_URL: z.string().url().default("http://127.0.0.1:3000"),
  ENABLE_MOCK_APIS: booleanFromString,
  SHOPIFY_ACCESS_TOKEN: z.string().min(1).default("local-shopify-token"),
  SHOPIFY_LOCATION_ID: z.string().min(1).default("local-location"),
  MARKETPLACE_API_KEY: z.string().min(1).default("local-marketplace-key"),
  POS_API_KEY: z.string().min(1).default("local-pos-key"),
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  inventoryQueueName: string;
  mockApiBaseUrl: string;
  enableMockApis: boolean;
  shopifyAccessToken: string;
  shopifyLocationId: string;
  marketplaceApiKey: string;
  posApiKey: string;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(environment);
  const redis = parsed.REDIS_PASSWORD
    ? { host: parsed.REDIS_HOST, port: parsed.REDIS_PORT, password: parsed.REDIS_PASSWORD }
    : { host: parsed.REDIS_HOST, port: parsed.REDIS_PORT };

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    redis,
    inventoryQueueName: parsed.INVENTORY_QUEUE_NAME,
    mockApiBaseUrl: parsed.MOCK_API_BASE_URL,
    enableMockApis: parsed.ENABLE_MOCK_APIS,
    shopifyAccessToken: parsed.SHOPIFY_ACCESS_TOKEN,
    shopifyLocationId: parsed.SHOPIFY_LOCATION_ID,
    marketplaceApiKey: parsed.MARKETPLACE_API_KEY,
    posApiKey: parsed.POS_API_KEY,
  };
}
