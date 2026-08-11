-- Faz 10 — Açık vardiya ve başvuru.
--
-- Bugüne kadar boş kalan vardiya için amir tek tek telefon ediyordu: kimin
-- boşta olduğu, kimin istekli olduğu hiçbir yerde durmuyordu. Açık vardiya
-- ilan edilir, personel başvurur, amir adaylar arasından seçer.
--
-- Başvuru KAYBOLMAZ: seçilmeyen aday 'not_selected' olarak kalır, kimin
-- gönüllü olduğu ay sonunda görünür.

CREATE TABLE IF NOT EXISTS open_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_date TEXT NOT NULL,
  shift_def_id INTEGER REFERENCES shift_definitions(id),
  work_location_id INTEGER REFERENCES work_locations(id),
  dept_id INTEGER REFERENCES departments(id),
  role_id INTEGER REFERENCES staff_roles(id),
  slots INTEGER NOT NULL DEFAULT 1 CHECK(slots > 0),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'filled', 'cancelled')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS open_shift_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  open_shift_id INTEGER NOT NULL REFERENCES open_shifts(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'applied' CHECK(status IN ('applied', 'selected', 'not_selected', 'withdrawn')),
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  seen_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Aynı kişi aynı açık vardiyaya iki kez başvuramaz.
CREATE UNIQUE INDEX IF NOT EXISTS ux_open_shift_application
  ON open_shift_applications(open_shift_id, staff_id);

CREATE INDEX IF NOT EXISTS ix_open_shifts_date ON open_shifts(work_date, status);
CREATE INDEX IF NOT EXISTS ix_open_shift_app_staff ON open_shift_applications(staff_id, status);
