-- Faz 11 — Personel çalışma kısıtları.
--
-- "Bu kişi bu vardiyaya/noktaya atanabilir mi" sorusunun bir kısmı hiçbir yerde
-- yazmıyordu: sağlık raporu gereği gece çalışamayan, belirli bir lokasyonda
-- çalışamayan (ya da yalnız orada çalışabilen), gece vardiyası tercih eden
-- personel amirin hafızasındaydı. Amir değişince bilgi kayboluyordu.
--
-- Türler:
--   health          — sağlık kısıtı (ref_id boş; serbest metin)
--   location_allow  — YALNIZ bu lokasyon(lar)da çalışabilir
--   location_block  — bu lokasyonda çalışamaz
--   shift_block     — bu vardiyaya atanamaz (ör. gece)
--   shift_prefer    — bu vardiyayı tercih eder (engel değil, sıralama ipucu)
--
-- valid_from/valid_to NULL = süresiz. Süreli rapor bitince kısıt kendiliğinden
-- düşer; elle silinmeyi beklemez.

CREATE TABLE IF NOT EXISTS staff_work_constraints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  constraint_type TEXT NOT NULL CHECK(constraint_type IN
    ('health', 'location_allow', 'location_block', 'shift_block', 'shift_prefer')),
  ref_id INTEGER,
  note TEXT,
  valid_from TEXT,
  valid_to TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_swc_staff ON staff_work_constraints(staff_id, constraint_type);
