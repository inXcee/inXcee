-- Çalışma noktası hangi projeye ait? "FPU kadrosunda ama Kamp'ta çalışanlar"
-- sorusu ancak bu bağ kurulunca cevaplanabilir.
--
-- Mevcut site alanından türetilemiyor: canlıda siteler KAMP / LOKAL / OTC
-- şeklinde ve FPU diye bir site yok. Yani eşleme veriden çıkarılamaz,
-- kullanıcı tarafından kurulmalı. NULL = bu nokta bir projeye bağlanmamış.
ALTER TABLE work_locations ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_locations_project ON work_locations(project_id);

-- Adı açıkça Kamp olan nokta makul bir başlangıç; kalanı ekrandan eşlenir.
UPDATE work_locations
SET project_id = (SELECT id FROM projects WHERE code = 'KAMP')
WHERE site = 'KAMP' AND project_id IS NULL;
