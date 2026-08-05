INSERT INTO inventory (canonical_sku, quantity)
VALUES ('CANONICAL-RED-SHIRT', 5)
ON CONFLICT (canonical_sku) DO UPDATE
SET quantity = EXCLUDED.quantity, updated_at = NOW();

INSERT INTO channel_mappings (inventory_id, channel, channel_sku, channel_variant_id)
SELECT id, 'shopify', 'SHOP-RED-001', 'gid://shopify/InventoryItem/1001'
FROM inventory WHERE canonical_sku = 'CANONICAL-RED-SHIRT'
ON CONFLICT (inventory_id, channel) DO UPDATE
SET channel_sku = EXCLUDED.channel_sku,
    channel_variant_id = EXCLUDED.channel_variant_id,
    updated_at = NOW();

INSERT INTO channel_mappings (inventory_id, channel, channel_sku, channel_variant_id)
SELECT id, 'marketplace', 'AMZ-RS-987', NULL
FROM inventory WHERE canonical_sku = 'CANONICAL-RED-SHIRT'
ON CONFLICT (inventory_id, channel) DO UPDATE
SET channel_sku = EXCLUDED.channel_sku,
    channel_variant_id = EXCLUDED.channel_variant_id,
    updated_at = NOW();

INSERT INTO channel_mappings (inventory_id, channel, channel_sku, channel_variant_id)
SELECT id, 'pos', 'POS-4455', NULL
FROM inventory WHERE canonical_sku = 'CANONICAL-RED-SHIRT'
ON CONFLICT (inventory_id, channel) DO UPDATE
SET channel_sku = EXCLUDED.channel_sku,
    channel_variant_id = EXCLUDED.channel_variant_id,
    updated_at = NOW();
