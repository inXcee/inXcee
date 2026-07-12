-- Faz X6: vardiya cizelgesinde calisma noktasi + personel rolu.

CREATE TABLE IF NOT EXISTS work_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  dept_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  color_class TEXT NOT NULL DEFAULT 'bg-blue-400',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE shift_schedule ADD COLUMN work_location_id INTEGER REFERENCES work_locations(id);
ALTER TABLE staff ADD COLUMN role_id INTEGER REFERENCES staff_roles(id);

CREATE INDEX IF NOT EXISTS idx_work_locations_dept ON work_locations(dept_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_staff_roles_active ON staff_roles(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_shift_schedule_location_date ON shift_schedule(work_location_id, work_date);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role_id);

INSERT OR IGNORE INTO work_locations(name, sort_order, color_class) VALUES
  ('OTC Yemekhane', 10, 'bg-blue-400'),
  ('Isci Lokali', 20, 'bg-emerald-500'),
  ('Buyuk Lokal', 30, 'bg-indigo-600'),
  ('Tas Bina', 40, 'bg-orange-400'),
  ('RET Lokal', 50, 'bg-red-500'),
  ('OTC Lokal', 60, 'bg-teal-500'),
  ('Kamp', 70, 'bg-slate-500');

INSERT OR IGNORE INTO staff_roles(name, sort_order) VALUES
  ('Ikramci', 10),
  ('Bulasikhane', 20),
  ('Asci', 30),
  ('Meydanci', 40),
  ('Temizlik', 50),
  ('Sorumlu', 60);
