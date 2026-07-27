-- Rota yol geometrisi: OSRM'den hesaplanan ya da elle duzeltilmis cizim.
-- path_is_manual=1 ise otomatik yeniden hesaplama onu ezmez (bkz. transport/jobs.js).
ALTER TABLE routes ADD COLUMN path_geometry TEXT;
ALTER TABLE routes ADD COLUMN path_is_manual INTEGER NOT NULL DEFAULT 0;
ALTER TABLE routes ADD COLUMN path_computed_at TEXT;
