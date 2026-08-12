-- Çamaşır kiosku Faz 3: makine yükleri ve çift doğrulamalı vardiya teslimi.

CREATE TABLE IF NOT EXISTS laundry_machine_loads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id INTEGER NOT NULL REFERENCES laundry_machines(id),
  program TEXT NOT NULL,
  color_group TEXT NOT NULL DEFAULT 'mixed',
  fabric_care TEXT NOT NULL DEFAULT 'standard',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),
  estimated_weight_kg REAL NOT NULL CHECK(estimated_weight_kg >= 0),
  actual_weight_kg REAL CHECK(actual_weight_kg IS NULL OR actual_weight_kg >= 0),
  capacity_kg REAL NOT NULL CHECK(capacity_kg > 0),
  override_reason TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','cancelled')),
  started_by_user_id INTEGER REFERENCES users(id),
  started_by_worker_id INTEGER REFERENCES staff(id),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS laundry_machine_load_items (
  load_id INTEGER NOT NULL REFERENCES laundry_machine_loads(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES laundry_items(id),
  estimated_weight_kg REAL NOT NULL CHECK(estimated_weight_kg >= 0),
  PRIMARY KEY(load_id, item_id)
);

CREATE TABLE IF NOT EXISTS laundry_shift_handovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT REFERENCES kiosk_devices(id),
  outgoing_worker_id INTEGER NOT NULL REFERENCES staff(id),
  incoming_worker_id INTEGER REFERENCES staff(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','cancelled')),
  summary_json TEXT NOT NULL DEFAULT '{}',
  issues_json TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  offline_queue_count INTEGER NOT NULL DEFAULT 0 CHECK(offline_queue_count >= 0),
  outgoing_verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  incoming_verified_at TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_laundry_loads_machine_status
  ON laundry_machine_loads(machine_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_laundry_load_items_item
  ON laundry_machine_load_items(item_id, load_id);
CREATE INDEX IF NOT EXISTS idx_laundry_handovers_status
  ON laundry_shift_handovers(status, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_laundry_handovers_open_device
  ON laundry_shift_handovers(device_id) WHERE status='open' AND device_id IS NOT NULL;

INSERT OR IGNORE INTO system_settings(key, value)
VALUES('laundry_kiosk_phase3_enabled', '1');
