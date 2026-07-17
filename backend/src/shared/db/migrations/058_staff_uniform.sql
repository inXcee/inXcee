-- Personel kıyafet / ekipman: yapılandırılabilir tür kataloğu, kişi bazlı bedenler
-- ve zimmet (teslim/iade) takibi.

CREATE TABLE IF NOT EXISTS uniform_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'clothing'
    CHECK(category IN ('clothing','footwear','ppe','other')),
  size_kind TEXT NOT NULL DEFAULT 'text'
    CHECK(size_kind IN ('text','numeric','none')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Standart kıyafet/ekipman türleri (idempotent seed).
INSERT OR IGNORE INTO uniform_items(item_key, label, category, size_kind, sort_order) VALUES
  ('work_pants',    'İş pantolonu',   'clothing', 'text',    10),
  ('work_tshirt',   'İş tişörtü',     'clothing', 'text',    20),
  ('work_shirt',    'İş gömleği',     'clothing', 'text',    30),
  ('work_jacket',   'Mont / kaban',   'clothing', 'text',    40),
  ('vest',          'Yelek',          'clothing', 'text',    50),
  ('coverall',      'Tulum',          'clothing', 'text',    60),
  ('safety_shoes',  'İş ayakkabısı',  'footwear', 'numeric', 70),
  ('boots',         'Çizme',          'footwear', 'numeric', 80),
  ('helmet',        'Baret',          'ppe',      'text',    90),
  ('gloves',        'Eldiven',        'ppe',      'text',    100),
  ('raincoat',      'Yağmurluk',      'clothing', 'text',    110);

-- Kişi bazlı bedenler (her personel × tür tekil).
CREATE TABLE IF NOT EXISTS staff_uniform_sizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  size TEXT,
  note TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_staff_uniform_sizes_staff ON staff_uniform_sizes(staff_id);

-- Zimmet: teslim edilen kıyafet/ekipman + iade takibi.
CREATE TABLE IF NOT EXISTS staff_uniform_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  size TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  note TEXT,
  issued_by INTEGER REFERENCES users(id),
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  returned_by INTEGER REFERENCES users(id),
  returned_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_staff_uniform_issues_staff
  ON staff_uniform_issues(staff_id, returned_at, issued_at DESC);
