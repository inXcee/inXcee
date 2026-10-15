-- Su inceleme karar geçmişi hareket silmeyi kilitlemesin (15 Eki 2026).
-- 055'te movement_id NOT NULL + ON DELETE kuralı yok (NO ACTION) kurulmuştu: istisna olarak onaylanmış bir
-- dağıtım tek tek ya da dönem temizliğiyle silinmek istenince "FOREIGN KEY constraint failed" (500) dönüyordu
-- (canlı 10.10.2026: 98 başarısız silme). Karar kaydı denetim izidir, silinmez; hareket silinince bağlantısı
-- boşalır (SET NULL). Silinen hareketin kendisi audit_log'da (water_movement_delete*) önceki hâliyle durur.
-- Tablo aynı kolonlarla yeniden kurulur; yalnız movement_id NULL olabilir ve ON DELETE SET NULL alır.

CREATE TABLE water_review_decisions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movement_id INTEGER REFERENCES water_movements(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approved_exception')),
  unallocated_base INTEGER NOT NULL CHECK(unallocated_base > 0),
  note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 500),
  reviewed_by INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO water_review_decisions_new (id, movement_id, decision, unallocated_base, note, reviewed_by, created_at)
SELECT id, movement_id, decision, unallocated_base, note, reviewed_by, created_at
FROM water_review_decisions;

DROP TABLE water_review_decisions;
ALTER TABLE water_review_decisions_new RENAME TO water_review_decisions;

CREATE INDEX IF NOT EXISTS idx_water_review_decisions_movement
  ON water_review_decisions(movement_id, created_at);
