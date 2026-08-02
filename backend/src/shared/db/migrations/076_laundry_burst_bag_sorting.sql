-- Patlayan/yırtılan filelerden ayrılan kıyafetlerin sahibini bulma akışı.
-- Olay ve parçalar ayrı tutulur; kaynak torba silinse dahi snapshot alanları
-- operasyon geçmişini okunabilir bırakır.
CREATE TABLE IF NOT EXISTS laundry_burst_bag_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER REFERENCES laundry_items(id) ON DELETE SET NULL,
  source_bag_no TEXT,
  source_block TEXT,
  source_room_no TEXT,
  burst_stage TEXT NOT NULL DEFAULT 'unknown'
    CHECK(burst_stage IN ('intake','washing','transfer','drying','ironing','delivery','unknown')),
  found_location TEXT NOT NULL,
  estimated_piece_count INTEGER NOT NULL DEFAULT 1
    CHECK(estimated_piece_count BETWEEN 1 AND 99),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'sorting'
    CHECK(status IN ('sorting','ready_for_selection','resolved')),
  reported_by_user_id INTEGER REFERENCES users(id),
  reported_by_worker_id INTEGER REFERENCES staff(id),
  resolved_at TEXT,
  resolved_by_user_id INTEGER REFERENCES users(id),
  resolved_by_worker_id INTEGER REFERENCES staff(id),
  resolution_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_laundry_burst_incidents_status
  ON laundry_burst_bag_incidents(status, created_at);
CREATE INDEX IF NOT EXISTS idx_laundry_burst_incidents_item
  ON laundry_burst_bag_incidents(item_id, created_at);

CREATE TABLE IF NOT EXISTS laundry_burst_bag_pieces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES laundry_burst_bag_incidents(id) ON DELETE CASCADE,
  garment_id INTEGER REFERENCES premium_garments(id) ON DELETE SET NULL,
  temporary_code TEXT UNIQUE,
  garment_type TEXT NOT NULL DEFAULT 'Bilinmeyen parça',
  brand TEXT,
  size TEXT,
  color TEXT,
  pattern TEXT,
  distinguishing_note TEXT,
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK(status IN ('waiting','returned','unresolved')),
  claimed_by_name TEXT,
  claimed_block TEXT,
  claimed_room_no TEXT,
  claimed_at TEXT,
  claimed_by_user_id INTEGER REFERENCES users(id),
  claimed_by_worker_id INTEGER REFERENCES staff(id),
  claim_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_laundry_burst_pieces_incident
  ON laundry_burst_bag_pieces(incident_id, status);
CREATE INDEX IF NOT EXISTS idx_laundry_burst_pieces_claim
  ON laundry_burst_bag_pieces(claimed_block, claimed_room_no, claimed_at);
