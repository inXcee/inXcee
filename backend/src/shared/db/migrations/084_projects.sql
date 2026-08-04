-- İki proje aynı anda yürütülüyor (FPU ve Kamp Alanı) ve puantaj/imza listeleri
-- ayrı ayrı hazırlanıyor. Personelin KADROSU bu tabloya bağlanır.
--
-- Önemli ayrım: kadro projesi ≠ o gün fiilen çalışılan yer. Fiili yer zaten
-- shift_schedule.work_location_id → work_locations.site üzerinden biliniyor.
-- İkisi ayrı tutulduğu için "FPU kadrosunda ama Kamp'ta çalışanlar" sorulabilir.
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  color_class TEXT NOT NULL DEFAULT 'bg-blue-500',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Başlangıç projeleri; kullanıcı ekranda yenisini ekleyebilir.
INSERT OR IGNORE INTO projects(name, code, color_class, sort_order) VALUES
  ('FPU',        'FPU',  'bg-blue-500',    1),
  ('Kamp Alanı', 'KAMP', 'bg-emerald-500', 2);

-- NULL = kadrosu henüz atanmamış. Silme yok: proje kaldırılırsa personel
-- kadrosuz kalır, kaydı durur.
ALTER TABLE staff ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_project ON staff(project_id, is_active);
