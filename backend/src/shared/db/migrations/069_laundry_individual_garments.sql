ALTER TABLE laundry_items ADD COLUMN client_request_id TEXT;
ALTER TABLE laundry_items ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'legacy'
  CHECK(tracking_mode IN ('individual','count_only','legacy'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_laundry_items_client_request
  ON laundry_items(client_request_id) WHERE client_request_id IS NOT NULL;

ALTER TABLE laundry_garment_types
  ADD COLUMN default_requires_ironing INTEGER NOT NULL DEFAULT 0;

UPDATE laundry_garment_types
SET default_requires_ironing = CASE
  WHEN name IN ('Gömlek','Pantolon','Tişört','Elbise','Takım Elbise') THEN 1
  ELSE 0
END;

CREATE TABLE premium_garments_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
  garment_code TEXT NOT NULL UNIQUE,
  garment_type TEXT NOT NULL,
  garment_type_id INTEGER REFERENCES laundry_garment_types(id),
  emoji TEXT,
  brand TEXT,
  model TEXT,
  size TEXT,
  color TEXT,
  colors_json TEXT,
  pattern TEXT,
  condition_notes TEXT,
  sequence_no INTEGER,
  requires_ironing INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'legacy_premium',
  status TEXT NOT NULL DEFAULT 'received'
    CHECK(status IN ('received','ironing','ready','delivered','lost','damaged')),
  ironed_by INTEGER REFERENCES users(id),
  ironed_by_worker_id INTEGER REFERENCES staff(id),
  ironed_at TEXT,
  delivered_to TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO premium_garments_v2(
  id, item_id, garment_code, garment_type, brand, model, size, color,
  pattern, condition_notes, status, ironed_by, ironed_at, delivered_to,
  delivered_at, created_at, updated_at
)
SELECT
  id, item_id, garment_code, garment_type, brand, model, size, color,
  pattern, condition_notes, status, ironed_by, ironed_at, delivered_to,
  delivered_at, created_at, updated_at
FROM premium_garments;

DROP TABLE premium_garments;
ALTER TABLE premium_garments_v2 RENAME TO premium_garments;

CREATE INDEX IF NOT EXISTS idx_pg_item ON premium_garments(item_id);
CREATE INDEX IF NOT EXISTS idx_pg_code ON premium_garments(garment_code);
CREATE INDEX IF NOT EXISTS idx_pg_status ON premium_garments(status);
CREATE INDEX IF NOT EXISTS idx_pg_type ON premium_garments(garment_type);
CREATE INDEX IF NOT EXISTS idx_pg_brand ON premium_garments(brand);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pg_item_sequence
  ON premium_garments(item_id, sequence_no) WHERE sequence_no IS NOT NULL;

ALTER TABLE premium_garment_history
  ADD COLUMN action_by_worker_id INTEGER REFERENCES staff(id);
ALTER TABLE premium_garment_history ADD COLUMN client_action_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pgh_client_action
  ON premium_garment_history(client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS laundry_garment_exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garment_id INTEGER NOT NULL REFERENCES premium_garments(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK(stage IN ('intake','ironing','delivery')),
  reason TEXT NOT NULL CHECK(reason IN ('missing','damaged','no_ironing','rework','other')),
  note TEXT,
  photo_url TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_by_worker_id INTEGER REFERENCES staff(id),
  resolved_at TEXT,
  resolved_by_user_id INTEGER REFERENCES users(id),
  resolved_by_worker_id INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_laundry_garment_exceptions_item
  ON laundry_garment_exceptions(item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_laundry_garment_exceptions_garment
  ON laundry_garment_exceptions(garment_id, created_at);

WITH parsed AS (
  SELECT
    li.id AS item_id,
    CAST(j.key AS INTEGER) AS group_index,
    j.value AS garment_json,
    MAX(1, MIN(99, COALESCE(CAST(json_extract(j.value, '$.count') AS INTEGER), 1))) AS garment_count
  FROM laundry_items li,
       json_each(CASE WHEN json_valid(li.garments_json) THEN li.garments_json ELSE '[]' END) j
  WHERE NOT EXISTS (SELECT 1 FROM premium_garments pg WHERE pg.item_id=li.id)
),
expanded(item_id, group_index, garment_json, copy_no, garment_count) AS (
  SELECT item_id, group_index, garment_json, 1, garment_count FROM parsed
  UNION ALL
  SELECT item_id, group_index, garment_json, copy_no + 1, garment_count
  FROM expanded WHERE copy_no < garment_count
),
numbered AS (
  SELECT
    e.*,
    ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY group_index, copy_no) AS sequence_no
  FROM expanded e
)
INSERT OR IGNORE INTO premium_garments(
  item_id, garment_code, garment_type, garment_type_id, emoji,
  colors_json, color, pattern, sequence_no, requires_ironing, source, status
)
SELECT
  n.item_id,
  'G' || n.item_id || '-' || printf('%02d', n.sequence_no),
  COALESCE(
    json_extract(n.garment_json, '$.type_name'),
    json_extract(n.garment_json, '$.garment_type'),
    'Parça'
  ),
  json_extract(n.garment_json, '$.type_id'),
  COALESCE(json_extract(n.garment_json, '$.emoji'), '👕'),
  COALESCE(json_extract(n.garment_json, '$.colors'), '[]'),
  json_extract(n.garment_json, '$.color'),
  COALESCE(json_extract(n.garment_json, '$.pattern'), 'solid'),
  n.sequence_no,
  COALESCE(li.needs_ironing, 0),
  'json_backfill',
  CASE li.status
    WHEN 'ironing' THEN 'ironing'
    WHEN 'ready' THEN 'ready'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'lost' THEN 'lost'
    ELSE 'received'
  END
FROM numbered n
JOIN laundry_items li ON li.id=n.item_id;

UPDATE laundry_items
SET tracking_mode = CASE
  WHEN EXISTS (SELECT 1 FROM premium_garments pg WHERE pg.item_id=laundry_items.id)
    THEN 'individual'
  WHEN garments_json IS NULL OR garments_json='' THEN 'count_only'
  ELSE 'legacy'
END;

