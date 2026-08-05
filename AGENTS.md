# AGENTS.md

## Repository Structure

- `src/adapters/` contains the common inventory channel contract and channel-specific HTTP clients.
- `src/config/` parses and validates environment variables.
- `src/controllers/` translates HTTP requests and service results into API responses.
- `src/db/` owns the PostgreSQL pool and migration/seed runners.
- `src/middleware/` provides centralized structured error handling.
- `src/mocks/` implements the local Shopify, marketplace, and internal POS APIs.
- `src/queue/` configures BullMQ jobs and the outbound inventory worker.
- `src/repositories/` contains PostgreSQL queries and transaction-aware persistence.
- `src/routes/` defines Express routes and request validation.
- `src/services/` coordinates transactional inventory changes and outbound jobs.
- `migrations/` contains ordered PostgreSQL schema migrations.
- `seeds/` contains repeatable local seed data.
- `test/` contains the integration acceptance suite using real PostgreSQL and Redis processes.
- `compose.yaml` starts PostgreSQL and Redis for local development.

## Setup

1. Install Node.js 20 or newer and Docker with Compose.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Run `docker compose up -d postgres redis`.
5. Run `npm run migrate`.
6. Run `npm run seed`.
7. Run `npm run dev`.

The automated tests start isolated portable PostgreSQL and Redis processes and do not require Docker.
For local verification without Docker, `npm run dev:local` starts the same portable infrastructure, applies migrations and seeds, and serves the API on port 3000.

## Test Command

Run the full suite with:

```sh
npm test
```

## Idempotency Strategy

`webhook_events` has a database unique constraint on `(channel, external_event_id)`. The service inserts the event inside the same PostgreSQL transaction as the inventory mutation using `ON CONFLICT DO NOTHING`. If no row is returned, the transaction reports the delivery as a duplicate and does not change inventory or enqueue jobs. Concurrent duplicate deliveries therefore rely on PostgreSQL's unique-index coordination rather than an application-memory check.

## Inventory Locking Strategy

The inventory repository resolves the channel mapping and locks the canonical `inventory` row with `SELECT ... FOR UPDATE` inside a PostgreSQL transaction. Quantity validation and the update happen while that lock is held, so two sales cannot both consume the last unit.

Do not replace this with application-level read-then-write logic or move the quantity check outside the transaction. Doing so can reintroduce overselling.

## Queue Retry Strategy

Every target channel receives its own BullMQ job, and the origin channel is excluded. A failed adapter call throws only within that job, so successful channels are not blocked or repeated. Jobs use `attempts: 3` and exponential backoff with a 1000 ms base delay, producing retries at approximately 1 and 2 seconds. Every worker attempt is recorded independently in `sync_logs`.
