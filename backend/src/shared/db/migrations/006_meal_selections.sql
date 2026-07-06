-- 006_meal_selections — ertesi-gün öğün seçimi (Faz 8).
--
-- Neden: Faz 4 yemekhane tüketimi (meal_logs) ve no-show raporu getirdi ama
-- mutfak ÖNCEDEN kaç kişilik hazırlayacağını bilmiyor. Personel kiosktan
-- ertesi gün için "geleceğim/gelmeyeceğim" seçer → mutfak net sayım alır,
-- seçti-ama-gelmedi (israf) ölçülebilir.

CREATE TABLE IF NOT EXISTS meal_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  meal_date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner','snack')),
  attending INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, meal_date, meal_type)
);
CREATE INDEX IF NOT EXISTS idx_meal_selections_date ON meal_selections(meal_date, meal_type);
