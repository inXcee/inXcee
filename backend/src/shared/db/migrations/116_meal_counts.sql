-- Öğün başı sayım (10 Eki 2026): mutfak kişi kişi değil, öğünde kaç kişinin yediğini sayıyor.
-- meal_logs (kart/QR, kişi başı) ile ayrı tutulur; bir (gün, öğün, yer) için tek satır —
-- düzeltme aynı satırı günceller. location '' = ana yemekhane (UNIQUE NULL'u ayırt etmediği için boş metin).
-- 'night' = gece vardiyası yemeği (00:00 vardiyası); meal_logs'taki dört öğüne ek.
CREATE TABLE IF NOT EXISTS meal_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner','night','snack')),
  location TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL CHECK(count >= 0),
  note TEXT,
  source TEXT NOT NULL DEFAULT 'web' CHECK(source IN ('web','telegram')),
  updated_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(meal_date, meal_type, location)
);
CREATE INDEX IF NOT EXISTS idx_meal_counts_date ON meal_counts(meal_date);
