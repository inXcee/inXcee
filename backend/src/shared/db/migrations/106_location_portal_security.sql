CREATE TABLE IF NOT EXISTS location_portal_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES service_locations(id) ON DELETE RESTRICT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  created_ip_hash TEXT NOT NULL CHECK(length(created_ip_hash)=64),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  CHECK(expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS ix_location_portal_sessions_active
  ON location_portal_sessions(token_hash, expires_at, revoked_at);
CREATE INDEX IF NOT EXISTS ix_location_portal_sessions_personnel
  ON location_portal_sessions(personnel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS location_portal_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES service_locations(id) ON DELETE RESTRICT,
  qr_code_id INTEGER REFERENCES location_qr_codes(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK(length(event_type) BETWEEN 2 AND 64),
  actor_mode TEXT NOT NULL DEFAULT 'anonymous'
    CHECK(actor_mode IN ('anonymous','resident_pin','worker')),
  actor_personnel_id INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
  actor_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  linked_entity_type TEXT,
  linked_entity_id INTEGER,
  result TEXT NOT NULL CHECK(result IN ('opened','accepted','completed','rejected','merged','failed')),
  client_request_id TEXT,
  ip_hash TEXT NOT NULL CHECK(length(ip_hash)=64),
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_location_portal_events_location_date
  ON location_portal_events(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_location_portal_events_type_result
  ON location_portal_events(event_type, result, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_location_portal_events_client_request
  ON location_portal_events(client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS location_portal_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_code TEXT NOT NULL UNIQUE CHECK(length(receipt_code) >= 22),
  location_id INTEGER NOT NULL REFERENCES service_locations(id) ON DELETE RESTRICT,
  event_id INTEGER REFERENCES location_portal_events(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK(length(action_type) BETWEEN 2 AND 64),
  client_request_id TEXT NOT NULL CHECK(length(client_request_id) BETWEEN 8 AND 100),
  status TEXT NOT NULL DEFAULT 'accepted'
    CHECK(status IN ('accepted','pending','completed','rejected','merged')),
  public_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(location_id, action_type, client_request_id)
);

CREATE INDEX IF NOT EXISTS ix_location_portal_receipts_status
  ON location_portal_receipts(status, updated_at DESC);
