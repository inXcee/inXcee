-- Su takip: tır ön bildirimleri + irsaliye fotoğraf arşivi.

CREATE TABLE IF NOT EXISTS water_truck_arrivals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arrival_date TEXT NOT NULL,
  arrival_start_time TEXT NOT NULL DEFAULT '08:00',
  arrival_end_time TEXT NOT NULL DEFAULT '17:00',
  mail_deadline_date TEXT NOT NULL,
  mail_deadline_time TEXT NOT NULL DEFAULT '17:00',
  reminder_start_time TEXT NOT NULL DEFAULT '08:00',
  reminder_end_time TEXT NOT NULL DEFAULT '17:00',
  reminder_interval_minutes INTEGER NOT NULL DEFAULT 60,
  supplier_name TEXT,
  brand_id INTEGER REFERENCES water_brands(id),
  driver_name TEXT,
  driver_tc TEXT,
  driver_phone TEXT,
  plate TEXT NOT NULL,
  trailer_plate TEXT,
  center_email TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','mail_sent','confirmed','arrived','cancelled')),
  mail_sent_at DATETIME,
  last_checked_at DATETIME,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_water_truck_arrival_date ON water_truck_arrivals(arrival_date);
CREATE INDEX IF NOT EXISTS idx_water_truck_deadline ON water_truck_arrivals(mail_deadline_date, mail_deadline_time);
CREATE INDEX IF NOT EXISTS idx_water_truck_status ON water_truck_arrivals(status);

CREATE TABLE IF NOT EXISTS water_waybill_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  truck_arrival_id INTEGER REFERENCES water_truck_arrivals(id) ON DELETE SET NULL,
  movement_id INTEGER REFERENCES water_movements(id) ON DELETE SET NULL,
  waybill_no TEXT,
  move_date TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  original_name TEXT,
  mime TEXT,
  size INTEGER,
  note TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_water_waybill_photos_truck ON water_waybill_photos(truck_arrival_id);
CREATE INDEX IF NOT EXISTS idx_water_waybill_photos_movement ON water_waybill_photos(movement_id);
CREATE INDEX IF NOT EXISTS idx_water_waybill_photos_date ON water_waybill_photos(move_date);
CREATE INDEX IF NOT EXISTS idx_water_waybill_photos_no ON water_waybill_photos(waybill_no);
