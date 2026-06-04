-- 008_visitor_preregister — ziyaretçi ön-kayıt + QR.
--
-- Neden: walk-in modeli (check_in_at NOT NULL DEFAULT now) ön-kaydı desteklemiyor.
-- Beklenen ziyaretçi gelmeden kaydedilebilsin (check_in_at NULL), QR token ile
-- girişte okutulsun. SQLite ALTER ile NOT NULL kaldırılamadığı için tablo rebuild.
-- visitors bir leaf tablo (kimse referans vermez) → FK-on altında rebuild güvenli.

CREATE TABLE visitors_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  tc_no TEXT,
  phone TEXT,
  purpose TEXT,
  visiting_personnel_id INTEGER REFERENCES personnel(id),
  visiting_block TEXT,
  status TEXT NOT NULL DEFAULT 'checked_in' CHECK(status IN ('pre_registered','checked_in','checked_out')),
  qr_token TEXT,
  expected_at DATETIME,
  pre_registered_at DATETIME,
  check_in_at DATETIME,
  check_out_at DATETIME,
  notes TEXT,
  created_by INTEGER REFERENCES users(id)
);

INSERT INTO visitors_new
  (id, full_name, tc_no, phone, purpose, visiting_personnel_id, visiting_block,
   status, check_in_at, check_out_at, notes, created_by)
SELECT id, full_name, tc_no, phone, purpose, visiting_personnel_id, visiting_block,
  CASE WHEN check_out_at IS NOT NULL THEN 'checked_out' ELSE 'checked_in' END,
  check_in_at, check_out_at, notes, created_by
FROM visitors;

DROP TABLE visitors;
ALTER TABLE visitors_new RENAME TO visitors;

CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_qr_token ON visitors(qr_token) WHERE qr_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visitors_active ON visitors(check_out_at, check_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitors_status ON visitors(status);
