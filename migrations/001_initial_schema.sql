CREATE TABLE inventory (
  id BIGSERIAL PRIMARY KEY,
  canonical_sku TEXT NOT NULL UNIQUE,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE channel_mappings (
  id BIGSERIAL PRIMARY KEY,
  inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('shopify', 'marketplace', 'pos')),
  channel_sku TEXT NOT NULL,
  channel_variant_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT channel_mapping_identifier_unique UNIQUE (channel, channel_sku),
  CONSTRAINT inventory_channel_unique UNIQUE (inventory_id, channel)
);

CREATE INDEX channel_mappings_inventory_id_idx ON channel_mappings(inventory_id);

CREATE TABLE webhook_events (
  id BIGSERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_event_idempotency_unique UNIQUE (channel, external_event_id)
);

CREATE TABLE sync_logs (
  id BIGSERIAL PRIMARY KEY,
  inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('shopify', 'marketplace', 'pos')),
  job_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'succeeded', 'failed')),
  attempt_number INTEGER NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sync_log_job_attempt_unique UNIQUE (job_id, attempt_number)
);

CREATE INDEX sync_logs_inventory_id_idx ON sync_logs(inventory_id);
