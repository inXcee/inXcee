-- Servisler V2 cekirdek veri modeli.
-- Legacy route_assignments tablosu rollback ve eski ekran uyumlulugu icin korunur.

CREATE TABLE transport_vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate TEXT NOT NULL COLLATE NOCASE UNIQUE,
  label TEXT,
  capacity INTEGER NOT NULL DEFAULT 16 CHECK(capacity > 0 AND capacity <= 200),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','out_of_service','inactive')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE transport_drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','unavailable','inactive')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_transport_drivers_identity
  ON transport_drivers(lower(trim(full_name)), ifnull(trim(phone), ''));

CREATE TABLE transport_resource_unavailability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER REFERENCES transport_vehicles(id) ON DELETE CASCADE,
  driver_id INTEGER REFERENCES transport_drivers(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reason TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK((vehicle_id IS NOT NULL) <> (driver_id IS NOT NULL)),
  CHECK(ends_at > starts_at)
);

CREATE INDEX idx_transport_unavailability_vehicle
  ON transport_resource_unavailability(vehicle_id, starts_at, ends_at);
CREATE INDEX idx_transport_unavailability_driver
  ON transport_resource_unavailability(driver_id, starts_at, ends_at);

ALTER TABLE routes
  ADD COLUMN default_vehicle_id INTEGER REFERENCES transport_vehicles(id);
ALTER TABLE routes
  ADD COLUMN default_driver_id INTEGER REFERENCES transport_drivers(id);

CREATE TABLE transport_trip_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  shift_def_id INTEGER REFERENCES shift_definitions(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
  departure_time TEXT NOT NULL,
  days_of_week TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  default_vehicle_id INTEGER REFERENCES transport_vehicles(id) ON DELETE SET NULL,
  default_driver_id INTEGER REFERENCES transport_drivers(id) ON DELETE SET NULL,
  valid_from TEXT,
  valid_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE INDEX idx_transport_templates_route
  ON transport_trip_templates(route_id, direction, is_active);

CREATE TABLE transport_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER REFERENCES transport_trip_templates(id) ON DELETE SET NULL,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
  work_date TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
  scheduled_departure TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','published','boarding','departed','completed','cancelled')),
  vehicle_id INTEGER REFERENCES transport_vehicles(id) ON DELETE SET NULL,
  driver_id INTEGER REFERENCES transport_drivers(id) ON DELETE SET NULL,
  capacity_snapshot INTEGER NOT NULL CHECK(capacity_snapshot > 0 AND capacity_snapshot <= 200),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK(source IN ('manual','template','legacy')),
  legacy_key TEXT UNIQUE,
  notes TEXT,
  published_at TEXT,
  boarding_started_at TEXT,
  departed_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transport_trips_date_status
  ON transport_trips(work_date, status, direction);
CREATE INDEX idx_transport_trips_resources
  ON transport_trips(vehicle_id, driver_id, scheduled_departure);
CREATE INDEX idx_transport_trips_route_date
  ON transport_trips(route_id, work_date);

CREATE TABLE transport_trip_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES transport_trips(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  stop_id INTEGER REFERENCES route_stops(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'assigned'
    CHECK(status IN ('assigned','waitlisted','boarded','no_show','cancelled')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK(source IN ('manual','plan','import','legacy')),
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  boarded_at TEXT,
  status_reason TEXT,
  legacy_assignment_id INTEGER UNIQUE
    REFERENCES route_assignments(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(trip_id, staff_id)
);

CREATE INDEX idx_transport_trip_assignments_trip_status
  ON transport_trip_assignments(trip_id, status);
CREATE INDEX idx_transport_trip_assignments_staff
  ON transport_trip_assignments(staff_id, trip_id);

CREATE TABLE transport_trip_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES transport_trips(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_type TEXT NOT NULL DEFAULT 'user'
    CHECK(actor_type IN ('user','driver_link','system','legacy')),
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transport_trip_events_trip
  ON transport_trip_events(trip_id, created_at DESC);

CREATE TABLE transport_trip_access_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES transport_trips(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transport_trip_tokens_trip
  ON transport_trip_access_tokens(trip_id, expires_at);

CREATE TABLE transport_scan_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES transport_trips(id) ON DELETE CASCADE,
  assignment_id INTEGER REFERENCES transport_trip_assignments(id) ON DELETE SET NULL,
  staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  client_event_id TEXT NOT NULL UNIQUE,
  result TEXT NOT NULL
    CHECK(result IN ('boarded','already_boarded','not_assigned','invalid_qr','rejected')),
  scanned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  device_time TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transport_scan_events_trip
  ON transport_scan_events(trip_id, created_at);

-- Rotalardaki mevcut serbest metin arac/sofor bilgilerini kaynak kaydina cevir.
INSERT OR IGNORE INTO transport_vehicles(plate, label, capacity)
SELECT trim(vehicle_plate), trim(vehicle_plate), MAX(capacity)
FROM routes
WHERE vehicle_plate IS NOT NULL AND trim(vehicle_plate) <> ''
GROUP BY lower(trim(vehicle_plate));

INSERT OR IGNORE INTO transport_drivers(full_name, phone)
SELECT MIN(trim(driver_name)), NULLIF(trim(driver_phone), '')
FROM routes
WHERE driver_name IS NOT NULL AND trim(driver_name) <> ''
GROUP BY lower(trim(driver_name)), ifnull(trim(driver_phone), '');

UPDATE routes
SET default_vehicle_id = (
  SELECT v.id FROM transport_vehicles v
  WHERE lower(trim(v.plate)) = lower(trim(routes.vehicle_plate))
)
WHERE vehicle_plate IS NOT NULL AND trim(vehicle_plate) <> '';

UPDATE routes
SET default_driver_id = (
  SELECT d.id FROM transport_drivers d
  WHERE lower(trim(d.full_name)) = lower(trim(routes.driver_name))
    AND ifnull(trim(d.phone), '') = ifnull(trim(routes.driver_phone), '')
)
WHERE driver_name IS NOT NULL AND trim(driver_name) <> '';

-- Her legacy rota-gun grubu veri kaybetmeden tek bir outbound sefere donusur.
INSERT INTO transport_trips(
  route_id, work_date, direction, scheduled_departure, status,
  vehicle_id, driver_id, capacity_snapshot, source, legacy_key,
  published_at, completed_at, created_at, updated_at
)
SELECT
  r.id,
  ra.work_date,
  'outbound',
  ra.work_date || 'T' || COALESCE(MIN(rs.scheduled_time), sd.start_hour, '00:00'),
  CASE WHEN ra.work_date < date('now') THEN 'completed' ELSE 'published' END,
  r.default_vehicle_id,
  r.default_driver_id,
  r.capacity,
  'legacy',
  'legacy:' || r.id || ':' || ra.work_date,
  COALESCE(MIN(ra.created_at), datetime('now')),
  CASE WHEN ra.work_date < date('now') THEN MAX(ra.boarded_marked_at) ELSE NULL END,
  COALESCE(MIN(ra.created_at), datetime('now')),
  COALESCE(MAX(COALESCE(ra.boarded_marked_at, ra.created_at)), datetime('now'))
FROM route_assignments ra
JOIN routes r ON r.id = ra.route_id
LEFT JOIN route_stops rs ON rs.route_id = r.id
LEFT JOIN shift_definitions sd ON sd.id = r.shift_def_id
GROUP BY r.id, ra.work_date;

INSERT INTO transport_trip_assignments(
  trip_id, staff_id, stop_id, status, source, assigned_by,
  boarded_at, legacy_assignment_id, created_at, updated_at
)
SELECT
  t.id,
  ra.staff_id,
  ra.stop_id,
  CASE
    WHEN ra.is_waitlist = 1 THEN 'waitlisted'
    WHEN ra.boarded = 1 THEN 'boarded'
    WHEN ra.boarded = 0 THEN 'no_show'
    ELSE 'assigned'
  END,
  'legacy',
  ra.assigned_by,
  CASE WHEN ra.boarded = 1 THEN ra.boarded_marked_at ELSE NULL END,
  ra.id,
  COALESCE(ra.created_at, datetime('now')),
  COALESCE(ra.boarded_marked_at, ra.created_at, datetime('now'))
FROM route_assignments ra
JOIN transport_trips t
  ON t.legacy_key = 'legacy:' || ra.route_id || ':' || ra.work_date;

INSERT INTO transport_trip_events(
  trip_id, event_type, to_status, actor_type, detail, created_at
)
SELECT
  id,
  'legacy_import',
  status,
  'legacy',
  '{"source":"route_assignments"}',
  created_at
FROM transport_trips
WHERE source = 'legacy';

INSERT OR IGNORE INTO system_settings(key, value)
VALUES('transport_revision', '0');
INSERT OR IGNORE INTO system_settings(key, value)
VALUES('transport_v2_enabled', '0');
