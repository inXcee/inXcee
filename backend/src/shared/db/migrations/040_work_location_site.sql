-- Vardiya: çalışma noktalarına üst-grup (site) — OTC / LOKAL / KAMP ayrımı.
-- Nokta bir site'a ait olur; kırılım/ayar site bazında da yapılabilir.
ALTER TABLE work_locations ADD COLUMN site TEXT;

-- Mevcut seed noktalarını isim desenine göre site'a ata (OTC önce → "OTC Lokal" OTC olur)
UPDATE work_locations SET site='OTC'   WHERE site IS NULL AND name LIKE '%OTC%';
UPDATE work_locations SET site='KAMP'  WHERE site IS NULL AND name LIKE '%Kamp%';
UPDATE work_locations SET site='LOKAL' WHERE site IS NULL AND name LIKE '%Lokal%';
