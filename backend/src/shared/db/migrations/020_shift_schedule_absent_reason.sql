-- Puantaj: devamsızlık (absent) günleri için opsiyonel neden alanı.
-- schema.js baseline'ına bilerek eklenmedi — kolon her DB'ye bu migration ile gelir
-- (fresh DB'de schema + ALTER çakışması olmaması için tek kaynak burası).

ALTER TABLE shift_schedule ADD COLUMN absent_reason TEXT;
