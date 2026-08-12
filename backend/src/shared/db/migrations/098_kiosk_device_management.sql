-- Kiosk cihaz kaydı, sağlık telemetrisi ve uzaktan komut altyapısı.

CREATE TABLE IF NOT EXISTS kiosk_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL CHECK(device_type IN (
    'laundry_terminal', 'avs_shared', 'avs_personal', 'resident_shared',
    'scan_station', 'display_general', 'display_kitchen'
  )),
  mode TEXT NOT NULL CHECK(mode IN ('shared', 'personal', 'unattended', 'display')),
  location TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  app_version TEXT,
  capabilities TEXT NOT NULL DEFAULT '{}',
  health TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'locked', 'maintenance', 'revoked')),
  queue_count INTEGER NOT NULL DEFAULT 0 CHECK(queue_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK(error_count >= 0),
  last_seen_at TEXT,
  last_sync_at TEXT,
  last_principal_kind TEXT,
  last_principal_id INTEGER,
  last_principal_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS kiosk_enrollment_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  location TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by_device_id TEXT REFERENCES kiosk_devices(id),
  revoked_at TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kiosk_device_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES kiosk_devices(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  detail TEXT,
  actor_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kiosk_device_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES kiosk_devices(id) ON DELETE CASCADE,
  command_type TEXT NOT NULL CHECK(command_type IN ('lock', 'config_refresh', 'app_reload', 'rotate_key')),
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'delivered', 'completed', 'failed', 'cancelled')),
  result TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS kiosk_sync_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_action_id TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL REFERENCES kiosk_devices(id),
  principal_kind TEXT,
  principal_id INTEGER,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('accepted', 'completed', 'conflict', 'rejected')),
  result TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

ALTER TABLE auth_sessions ADD COLUMN device_id TEXT REFERENCES kiosk_devices(id);
ALTER TABLE scan_stations ADD COLUMN device_id TEXT REFERENCES kiosk_devices(id);

CREATE INDEX IF NOT EXISTS idx_kiosk_devices_last_seen
  ON kiosk_devices(status, is_active, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_kiosk_device_events_device
  ON kiosk_device_events(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kiosk_commands_pending
  ON kiosk_device_commands(device_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_kiosk_enrollment_expiry
  ON kiosk_enrollment_codes(expires_at, used_at, revoked_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_device
  ON auth_sessions(device_id, revoked_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_stations_device
  ON scan_stations(device_id) WHERE device_id IS NOT NULL;

INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_management_v2_enabled', '1');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_device_required', '0');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_secure_offline_v2_enabled', '0');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_shared_idle_minutes', '2');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_laundry_idle_minutes', '10');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_online_threshold_minutes', '5');
