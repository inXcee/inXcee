-- Oda kullanım durumu (8 Eki 2026): sahada odalar kapalı / kilitli oluyor, gececi odası gündüz uyuyor.
-- Günlük temizlik üretimi bunları bilmediği için her gün 1054 oda görevi açıyor, kimse kapatmıyordu.
--   use_state      open   → normal
--                  closed → oda kullanılmıyor: temizlik görevi üretilmez
--                  locked → içeri girilemiyor: görev "Oda kilitli" gerekçesiyle atlanmış üretilir
--   occupant_shift day / night / mixed — gececi odası 07–19 uyur → görev 19:00'a planlanır, DND listesine girer
--   state_until    bu tarihten SONRA durum kendiliğinden 'open'a döner (kilitli 15.10'a kadar)
ALTER TABLE rooms ADD COLUMN use_state TEXT NOT NULL DEFAULT 'open'
  CHECK(use_state IN ('open','closed','locked'));
ALTER TABLE rooms ADD COLUMN occupant_shift TEXT
  CHECK(occupant_shift IS NULL OR occupant_shift IN ('day','night','mixed'));
ALTER TABLE rooms ADD COLUMN state_note TEXT;
ALTER TABLE rooms ADD COLUMN state_until TEXT;
ALTER TABLE rooms ADD COLUMN state_updated_at DATETIME;
ALTER TABLE rooms ADD COLUMN state_updated_by INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_rooms_use_state ON rooms(use_state, block);
