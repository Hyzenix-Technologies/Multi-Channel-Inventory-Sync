# Multi-Channel Inventory Sync

An Express and TypeScript backend that keeps a PostgreSQL canonical inventory synchronized with Shopify, a marketplace, and an internal POS through independent BullMQ jobs.

## Local setup

```sh
npm install
copy .env.example .env
docker compose up -d postgres redis
npm run migrate
npm run seed
npm run dev
```

The API is available at `http://127.0.0.1:3000`. Health status is at `GET /health`.

For a zero-configuration local verification run, start the bundled portable PostgreSQL and Redis-compatible processes together with the API:

```sh
npm run dev:local
```

This command is intended for local development only. It runs the migrations and seed data automatically, then serves the API at `http://127.0.0.1:3000`.

## Manual webhook

```sh
curl -X POST http://127.0.0.1:3000/webhooks/shopify \
  -H "content-type: application/json" \
  -d '{"eventId":"evt-shopify-1001","channelSku":"SHOP-RED-001","type":"sale","quantityChange":-1}'
```

Supported channels are `shopify`, `marketplace`, and `pos`. Supported event types are `sale`, `return`, and `manual_adjustment`.

The local mock APIs are mounted below `/mock-apis`. A mock can be instructed to fail its next calls for manual retry testing:

```sh
curl -X POST http://127.0.0.1:3000/mock-apis/control/marketplace/failures \
  -H "content-type: application/json" \
  -d '{"count":1}'
```

## Tests

```sh
npm test
```

The suite starts actual isolated PostgreSQL and Redis server processes. It verifies basic synchronization, independent retry, database idempotency, a parallel last-unit race, and channel-specific SKU mapping.

## Acceptance Criteria Mapping

- Basic cross-channel sync -> `test/inventory-sync.acceptance.test.ts` (`basic inventory sync`)
- Partial failure and retry -> `test/inventory-sync.acceptance.test.ts` (`partial failure and retry`)
- Duplicate webhook idempotency -> `test/inventory-sync.acceptance.test.ts` (`duplicate webhook idempotency`)
- Concurrent sale of last unit -> `test/inventory-sync.acceptance.test.ts` (`parallel race-condition`)
- Channel-specific SKU mapping -> `test/inventory-sync.acceptance.test.ts` (`SKU mapping`)
