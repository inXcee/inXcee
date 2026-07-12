-- Faz X5: şema hijyeni — shift_swap_requests ad-hoc ensureSwapTable yerine versiyonlu migration.
-- (ensureSwapTable de IF NOT EXISTS; birlikte güvenli — bu migration tabloyu şema-takibine sokar.)
CREATE TABLE IF NOT EXISTS shift_swap_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES staff(id),
  target_id INTEGER NOT NULL REFERENCES staff(id),
  swap_date TEXT NOT NULL,
  requester_shift_id INTEGER REFERENCES shift_definitions(id),
  target_shift_id INTEGER REFERENCES shift_definitions(id),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  approved_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
