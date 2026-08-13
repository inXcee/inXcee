ALTER TABLE maintenance_requests
  ADD COLUMN service_location_id INTEGER REFERENCES service_locations(id) ON DELETE SET NULL;

ALTER TABLE maintenance_requests
  ADD COLUMN request_source TEXT NOT NULL DEFAULT 'internal'
  CHECK(request_source IN ('internal','room_qr'));

ALTER TABLE maintenance_requests
  ADD COLUMN identity_mode TEXT
  CHECK(identity_mode IS NULL OR identity_mode IN ('anonymous','resident_pin','worker'));

CREATE INDEX IF NOT EXISTS ix_maintenance_requests_portal_open
  ON maintenance_requests(service_location_id, category, status)
  WHERE service_location_id IS NOT NULL AND status != 'done';

CREATE TABLE IF NOT EXISTS maintenance_request_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL CHECK(file_url LIKE '/uploads/%'),
  source TEXT NOT NULL DEFAULT 'room_qr' CHECK(source IN ('room_qr','internal')),
  added_by_personnel_id INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_maintenance_request_media_request
  ON maintenance_request_media(request_id, created_at);

ALTER TABLE satisfaction_surveys
  ADD COLUMN service_location_id INTEGER REFERENCES service_locations(id) ON DELETE SET NULL;

ALTER TABLE satisfaction_surveys
  ADD COLUMN survey_source TEXT NOT NULL DEFAULT 'general'
  CHECK(survey_source IN ('general','room_qr'));

ALTER TABLE satisfaction_surveys
  ADD COLUMN identity_mode TEXT
  CHECK(identity_mode IS NULL OR identity_mode IN ('anonymous','resident_pin'));

CREATE INDEX IF NOT EXISTS ix_satisfaction_surveys_portal_location
  ON satisfaction_surveys(service_location_id, created_at DESC)
  WHERE service_location_id IS NOT NULL;
