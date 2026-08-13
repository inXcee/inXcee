CREATE TABLE IF NOT EXISTS service_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_type TEXT NOT NULL CHECK(location_type IN ('room','common_area')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('rooms','housekeeping','manual')),
  room_id INTEGER UNIQUE REFERENCES rooms(id) ON DELETE SET NULL,
  block TEXT NOT NULL,
  floor INTEGER NOT NULL,
  area_code TEXT,
  qr_location TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(
    (location_type='room' AND area_code IS NULL AND (room_id IS NOT NULL OR is_active=0))
    OR
    (location_type='common_area' AND room_id IS NULL AND area_code IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_service_locations_scope
  ON service_locations(is_active, location_type, block, floor);

CREATE TABLE IF NOT EXISTS location_qr_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES service_locations(id) ON DELETE RESTRICT,
  token TEXT NOT NULL UNIQUE CHECK(length(token) >= 43),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_printed_at TEXT,
  revoked_by INTEGER REFERENCES users(id),
  revoked_at TEXT,
  revoke_reason TEXT,
  rotated_from_id INTEGER REFERENCES location_qr_codes(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_location_qr_codes_active_location
  ON location_qr_codes(location_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS ix_location_qr_codes_status
  ON location_qr_codes(status, location_id);

INSERT INTO service_locations(
  location_type, source, room_id, block, floor, area_code,
  qr_location, display_name, is_active
)
SELECT
  'room', 'rooms', r.id, r.block, r.floor, NULL,
  r.block || '-' || r.room_no,
  r.block || ' Oda ' || r.room_no,
  1
FROM rooms r
WHERE 1
ON CONFLICT(room_id) DO UPDATE SET
  block=excluded.block,
  floor=excluded.floor,
  qr_location=excluded.qr_location,
  display_name=excluded.display_name,
  is_active=1,
  updated_at=datetime('now');

INSERT INTO service_locations(
  location_type, source, room_id, block, floor, area_code,
  qr_location, display_name, is_active
)
SELECT
  'common_area', 'housekeeping', NULL, f.block, f.floor, a.code,
  f.block || '-' || f.floor || '-' || a.code,
  f.block || ' ' || f.floor || '. Kat ' || a.label,
  1
FROM (SELECT DISTINCT block, floor FROM rooms WHERE block LIKE 'M%') f
CROSS JOIN (
  SELECT 'corridor' AS code, 'Koridor' AS label
  UNION ALL SELECT 'toilet', 'Tuvalet / WC'
  UNION ALL SELECT 'bathroom', 'Banyo'
  UNION ALL SELECT 'stairs', 'Merdiven'
) a
WHERE 1
ON CONFLICT(qr_location) DO UPDATE SET
  block=excluded.block,
  floor=excluded.floor,
  area_code=excluded.area_code,
  display_name=excluded.display_name,
  is_active=1,
  updated_at=datetime('now');

UPDATE service_locations
SET is_active=0, updated_at=datetime('now')
WHERE source='rooms' AND room_id IS NULL;

UPDATE service_locations
SET is_active=0, updated_at=datetime('now')
WHERE source='housekeeping'
  AND NOT EXISTS (
    SELECT 1 FROM rooms r
    WHERE r.block=service_locations.block
      AND r.floor=service_locations.floor
      AND r.block LIKE 'M%'
  );

CREATE TRIGGER IF NOT EXISTS trg_service_locations_room_insert
AFTER INSERT ON rooms
BEGIN
  INSERT INTO service_locations(
    location_type, source, room_id, block, floor, area_code,
    qr_location, display_name, is_active
  ) VALUES(
    'room', 'rooms', NEW.id, NEW.block, NEW.floor, NULL,
    NEW.block || '-' || NEW.room_no,
    NEW.block || ' Oda ' || NEW.room_no,
    1
  )
  ON CONFLICT(room_id) DO UPDATE SET
    block=excluded.block,
    floor=excluded.floor,
    qr_location=excluded.qr_location,
    display_name=excluded.display_name,
    is_active=1,
    updated_at=datetime('now');

  INSERT INTO service_locations(location_type,source,block,floor,area_code,qr_location,display_name,is_active)
  SELECT 'common_area','housekeeping',NEW.block,NEW.floor,'corridor',NEW.block || '-' || NEW.floor || '-corridor',NEW.block || ' ' || NEW.floor || '. Kat Koridor',1
  WHERE NEW.block LIKE 'M%'
  ON CONFLICT(qr_location) DO UPDATE SET is_active=1,display_name=excluded.display_name,updated_at=datetime('now');
  INSERT INTO service_locations(location_type,source,block,floor,area_code,qr_location,display_name,is_active)
  SELECT 'common_area','housekeeping',NEW.block,NEW.floor,'toilet',NEW.block || '-' || NEW.floor || '-toilet',NEW.block || ' ' || NEW.floor || '. Kat Tuvalet / WC',1
  WHERE NEW.block LIKE 'M%'
  ON CONFLICT(qr_location) DO UPDATE SET is_active=1,display_name=excluded.display_name,updated_at=datetime('now');
  INSERT INTO service_locations(location_type,source,block,floor,area_code,qr_location,display_name,is_active)
  SELECT 'common_area','housekeeping',NEW.block,NEW.floor,'bathroom',NEW.block || '-' || NEW.floor || '-bathroom',NEW.block || ' ' || NEW.floor || '. Kat Banyo',1
  WHERE NEW.block LIKE 'M%'
  ON CONFLICT(qr_location) DO UPDATE SET is_active=1,display_name=excluded.display_name,updated_at=datetime('now');
  INSERT INTO service_locations(location_type,source,block,floor,area_code,qr_location,display_name,is_active)
  SELECT 'common_area','housekeeping',NEW.block,NEW.floor,'stairs',NEW.block || '-' || NEW.floor || '-stairs',NEW.block || ' ' || NEW.floor || '. Kat Merdiven',1
  WHERE NEW.block LIKE 'M%'
  ON CONFLICT(qr_location) DO UPDATE SET is_active=1,display_name=excluded.display_name,updated_at=datetime('now');
END;

CREATE TRIGGER IF NOT EXISTS trg_service_locations_room_update
AFTER UPDATE OF block, floor, room_no ON rooms
BEGIN
  UPDATE service_locations
  SET block=NEW.block,
      floor=NEW.floor,
      qr_location=NEW.block || '-' || NEW.room_no,
      display_name=NEW.block || ' Oda ' || NEW.room_no,
      is_active=1,
      updated_at=datetime('now')
  WHERE source='rooms' AND room_id=NEW.id;

  INSERT INTO service_locations(location_type,source,block,floor,area_code,qr_location,display_name,is_active)
  SELECT 'common_area','housekeeping',NEW.block,NEW.floor,'corridor',NEW.block || '-' || NEW.floor || '-corridor',NEW.block || ' ' || NEW.floor || '. Kat Koridor',1
  WHERE NEW.block LIKE 'M%'
  ON CONFLICT(qr_location) DO UPDATE SET is_active=1,display_name=excluded.display_name,updated_at=datetime('now');
  INSERT INTO service_locations(location_type,source,block,floor,area_code,qr_location,display_name,is_active)
  SELECT 'common_area','housekeeping',NEW.block,NEW.floor,'toilet',NEW.block || '-' || NEW.floor || '-toilet',NEW.block || ' ' || NEW.floor || '. Kat Tuvalet / WC',1
  WHERE NEW.block LIKE 'M%'
  ON CONFLICT(qr_location) DO UPDATE SET is_active=1,display_name=excluded.display_name,updated_at=datetime('now');
  INSERT INTO service_locations(location_type,source,block,floor,area_code,qr_location,display_name,is_active)
  SELECT 'common_area','housekeeping',NEW.block,NEW.floor,'bathroom',NEW.block || '-' || NEW.floor || '-bathroom',NEW.block || ' ' || NEW.floor || '. Kat Banyo',1
  WHERE NEW.block LIKE 'M%'
  ON CONFLICT(qr_location) DO UPDATE SET is_active=1,display_name=excluded.display_name,updated_at=datetime('now');
  INSERT INTO service_locations(location_type,source,block,floor,area_code,qr_location,display_name,is_active)
  SELECT 'common_area','housekeeping',NEW.block,NEW.floor,'stairs',NEW.block || '-' || NEW.floor || '-stairs',NEW.block || ' ' || NEW.floor || '. Kat Merdiven',1
  WHERE NEW.block LIKE 'M%'
  ON CONFLICT(qr_location) DO UPDATE SET is_active=1,display_name=excluded.display_name,updated_at=datetime('now');

  UPDATE service_locations
  SET is_active=0, updated_at=datetime('now')
  WHERE source='housekeeping'
    AND block=OLD.block AND floor=OLD.floor
    AND NOT EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.block=OLD.block AND r.floor=OLD.floor AND r.block LIKE 'M%'
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_service_locations_room_delete
BEFORE DELETE ON rooms
BEGIN
  UPDATE service_locations
  SET room_id=NULL, is_active=0, updated_at=datetime('now')
  WHERE source='rooms' AND qr_location=OLD.block || '-' || OLD.room_no;
END;

CREATE TRIGGER IF NOT EXISTS trg_service_locations_room_delete_common
AFTER DELETE ON rooms
BEGIN
  UPDATE service_locations
  SET is_active=0, updated_at=datetime('now')
  WHERE source='housekeeping'
    AND block=OLD.block AND floor=OLD.floor
    AND NOT EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.block=OLD.block AND r.floor=OLD.floor AND r.block LIKE 'M%'
    );
END;

INSERT OR IGNORE INTO system_settings(key, value) VALUES('location_portal_enabled', '0');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('location_portal_fault_enabled', '0');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('location_portal_laundry_enabled', '0');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('location_portal_cleaning_enabled', '0');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('location_portal_survey_enabled', '0');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('location_portal_fault_pin_required', '0');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('location_portal_laundry_pin_required', '0');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('location_portal_cleaning_review_pin_required', '0');
