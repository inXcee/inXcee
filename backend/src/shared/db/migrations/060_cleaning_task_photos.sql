-- Temizlik görevleri için ÇOKLU fotoğraf: bir oda/görevde birden fazla kanıt fotoğrafı.
-- cleaning_task_photos kaynak tablodur; cleaning_tasks.photo_url "kapak" (ilk foto) aynası
-- olarak korunur (geriye uyum: mevcut genel bakış, geçmiş ve retention kapak üzerinden çalışır).
-- category: genel | oncesi | sonrasi | detay | hasar. caption: opsiyonel not.

CREATE TABLE IF NOT EXISTS cleaning_task_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES cleaning_tasks(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'genel',
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at DATETIME NOT NULL DEFAULT (datetime('now')),
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cleaning_task_photos_task ON cleaning_task_photos(task_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_task_photos_uploaded ON cleaning_task_photos(uploaded_at);

-- Backfill: mevcut tek foto (cleaning_tasks.photo_url) → çoklu tabloya "genel" kapak olarak.
-- uploaded_at görevin tamamlanma/planlanma tarihine hizalanır (retention davranışı korunur).
-- Idempotent: aynı görev için zaten satır varsa tekrar eklemez.
INSERT INTO cleaning_task_photos(task_id, photo_url, category, sort_order, uploaded_at)
SELECT ct.id, ct.photo_url, 'genel', 0, COALESCE(ct.completed_at, ct.scheduled_at)
FROM cleaning_tasks ct
WHERE ct.photo_url IS NOT NULL AND ct.photo_url <> ''
  AND NOT EXISTS (SELECT 1 FROM cleaning_task_photos p WHERE p.task_id = ct.id);
