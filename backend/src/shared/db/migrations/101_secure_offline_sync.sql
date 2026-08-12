ALTER TABLE access_events ADD COLUMN client_action_id TEXT;
ALTER TABLE access_events ADD COLUMN client_result_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_events_client_action
  ON access_events(client_action_id) WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kiosk_sync_receipts_device_status
  ON kiosk_sync_receipts(device_id, status, created_at DESC);

INSERT INTO system_settings(key, value)
VALUES('kiosk_secure_offline_v2_enabled', '1')
ON CONFLICT(key) DO UPDATE SET value=excluded.value;

INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_offline_warning_count', '400');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_offline_max_count', '500');
