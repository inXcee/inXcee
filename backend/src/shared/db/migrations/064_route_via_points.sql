-- Ugrak (via) noktalari: "rota buradan gecsin" isaretleri.
-- JSON: [{ after_stop_id, lat, lng }, ...] — ayni duraga bagli ugraklar dizideki sirayla gezilir.
-- Serbest elle cizim kaldirildi; path_is_manual artik okunmuyor, olu kolon olarak kalir.
ALTER TABLE routes ADD COLUMN via_points TEXT;
UPDATE routes SET path_is_manual = 0;
