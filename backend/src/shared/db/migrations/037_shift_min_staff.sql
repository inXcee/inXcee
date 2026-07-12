-- Faz X4: Vardiya bazlı kadro hedefi — her vardiya için minimum kişi (kapsama panosu).
-- 0 = hedefsiz (uyarı yok). Ekranda/Excel'de gerçekleşen < hedef ise kırmızı.
ALTER TABLE shift_definitions ADD COLUMN min_staff INTEGER NOT NULL DEFAULT 0;
