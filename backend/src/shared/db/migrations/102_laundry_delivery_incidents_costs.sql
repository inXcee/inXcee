-- Çamaşır kiosku Faz 5: güvenli kısmi teslim, vaka yönetimi ve yük maliyetleri.

ALTER TABLE laundry_supplies ADD COLUMN unit_cost REAL NOT NULL DEFAULT 0
  CHECK(unit_cost >= 0);

CREATE TABLE IF NOT EXISTS laundry_delivery_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES laundry_items(id),
  recipient_type TEXT NOT NULL DEFAULT 'owner'
    CHECK(recipient_type IN ('owner','third_party')),
  recipient_name TEXT NOT NULL,
  recipient_personnel_id INTEGER REFERENCES personnel(id),
  third_party_reason TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK(status IN ('pending_approval','completed','cancelled')),
  signature_data TEXT,
  photo_url TEXT,
  delivered_by_user_id INTEGER REFERENCES users(id),
  delivered_by_worker_id INTEGER REFERENCES staff(id),
  approved_by_user_id INTEGER REFERENCES users(id),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS laundry_delivery_batch_garments (
  delivery_id INTEGER NOT NULL REFERENCES laundry_delivery_batches(id) ON DELETE CASCADE,
  garment_id INTEGER NOT NULL REFERENCES premium_garments(id),
  PRIMARY KEY(delivery_id, garment_id)
);

CREATE TABLE IF NOT EXISTS laundry_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_no TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('lost_bag','lost_garment','damaged_garment','other')),
  severity TEXT NOT NULL DEFAULT 'normal'
    CHECK(severity IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','investigating','resolved','rejected')),
  item_id INTEGER REFERENCES laundry_items(id),
  garment_id INTEGER REFERENCES premium_garments(id),
  machine_id INTEGER REFERENCES laundry_machines(id),
  owner_user_id INTEGER REFERENCES users(id),
  owner_worker_id INTEGER REFERENCES staff(id),
  description TEXT NOT NULL,
  photo_url TEXT,
  sla_due_at TEXT NOT NULL,
  resolution TEXT CHECK(resolution IS NULL OR resolution IN ('found','compensated','rejected','reimbursed')),
  resolution_note TEXT,
  compensation_amount REAL CHECK(compensation_amount IS NULL OR compensation_amount >= 0),
  approved_by_user_id INTEGER REFERENCES users(id),
  created_by_user_id INTEGER REFERENCES users(id),
  created_by_worker_id INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS laundry_incident_checklist (
  incident_id INTEGER NOT NULL REFERENCES laundry_incidents(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_complete INTEGER NOT NULL DEFAULT 0 CHECK(is_complete IN (0,1)),
  completed_by_user_id INTEGER REFERENCES users(id),
  completed_by_worker_id INTEGER REFERENCES staff(id),
  completed_at TEXT,
  PRIMARY KEY(incident_id, item_key)
);

CREATE TABLE IF NOT EXISTS laundry_load_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  load_id INTEGER NOT NULL UNIQUE REFERENCES laundry_machine_loads(id) ON DELETE CASCADE,
  weight_kg REAL NOT NULL DEFAULT 0 CHECK(weight_kg >= 0),
  water_liters REAL NOT NULL DEFAULT 0 CHECK(water_liters >= 0),
  energy_kwh REAL NOT NULL DEFAULT 0 CHECK(energy_kwh >= 0),
  supplies_cost REAL NOT NULL DEFAULT 0 CHECK(supplies_cost >= 0),
  water_cost REAL NOT NULL DEFAULT 0 CHECK(water_cost >= 0),
  energy_cost REAL NOT NULL DEFAULT 0 CHECK(energy_cost >= 0),
  total_cost REAL NOT NULL DEFAULT 0 CHECK(total_cost >= 0),
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS laundry_load_supply_usage (
  load_id INTEGER NOT NULL REFERENCES laundry_machine_loads(id) ON DELETE CASCADE,
  supply_id INTEGER NOT NULL REFERENCES laundry_supplies(id),
  quantity REAL NOT NULL CHECK(quantity >= 0),
  unit_cost REAL NOT NULL DEFAULT 0 CHECK(unit_cost >= 0),
  total_cost REAL NOT NULL DEFAULT 0 CHECK(total_cost >= 0),
  PRIMARY KEY(load_id, supply_id)
);

CREATE INDEX IF NOT EXISTS idx_laundry_delivery_batches_item
  ON laundry_delivery_batches(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_laundry_delivery_batches_status
  ON laundry_delivery_batches(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_laundry_incidents_status_sla
  ON laundry_incidents(status, sla_due_at);
CREATE INDEX IF NOT EXISTS idx_laundry_incidents_item
  ON laundry_incidents(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_laundry_load_costs_calculated
  ON laundry_load_costs(calculated_at DESC);

INSERT OR IGNORE INTO system_settings(key, value)
VALUES('laundry_kiosk_phase5_enabled', '1');
INSERT OR IGNORE INTO system_settings(key, value)
VALUES('laundry_water_unit_cost', '0.03');
INSERT OR IGNORE INTO system_settings(key, value)
VALUES('laundry_energy_unit_cost', '4.50');
