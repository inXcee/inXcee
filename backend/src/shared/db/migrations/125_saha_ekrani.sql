-- Saha ekranı (23 Eki 2026): kat hizmetleri ve çamaşırhane telefondan/tabletten oda durumu girer.
--   rooms.occupancy           'occupied' (dolu) / 'empty' (boş) / NULL (bilinmiyor) — oda bazlı, kişi tutulmaz
--                             (sakin giriş/çıkışı kullanıcı kararıyla takip edilmiyor). Panel doluluğu bundan gelir.
--   cleaning_tasks.origin     'field' = sahadan "temizlendi/temizlenemedi" denince o an açılan görev. Günlük üretim
--                             kapalı (10 Eki); geri alınınca fotoğrafsız saha görevi silinir, üretilmiş görev silinmez.
--   cleaning_tasks.field_worker_id  son saha işaretini yapan personel (geri alma yalnız onun).
ALTER TABLE rooms ADD COLUMN occupancy TEXT CHECK(occupancy IS NULL OR occupancy IN ('occupied','empty'));
ALTER TABLE rooms ADD COLUMN occupancy_updated_at DATETIME;
ALTER TABLE rooms ADD COLUMN occupancy_updated_by_worker INTEGER REFERENCES staff(id);
ALTER TABLE rooms ADD COLUMN occupancy_updated_by_user INTEGER REFERENCES users(id);

ALTER TABLE cleaning_tasks ADD COLUMN origin TEXT;
ALTER TABLE cleaning_tasks ADD COLUMN field_worker_id INTEGER REFERENCES staff(id);
