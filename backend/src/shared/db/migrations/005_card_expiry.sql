-- 005_card_expiry — cards.valid_until (Faz 5b süreli ziyaretçi kartı).
--
-- Neden: ziyaretçilere SÜRELİ access kartı verilebilsin; süresi geçince istasyon
-- okutmada reddetsin. NULL = süresiz (mevcut tüm kartlar geriye uyumlu).
-- Basit ADD COLUMN — tablo yeniden inşası gerekmez.

ALTER TABLE cards ADD COLUMN valid_until DATETIME;
