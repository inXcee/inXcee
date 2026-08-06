-- Çizelgede isimlerin sırası. Kullanıcı satırları sürükleyerek istediği düzene
-- getirebilsin diye personelin kendi sıra numarası var.
--
-- Sıra KİŞİYE ÖZEL DEĞİL, ortak: çizelge imzaya ve yazıcıya gidiyor, herkesin
-- ekranında farklı sırada görünürse "3. sıradaki kişi" demek anlamsızlaşır.
--
-- NULL = sıralanmamış. Sıralananlar üstte kendi düzeninde, kalanlar eskisi gibi
-- ada göre altta durur; böylece hiç sürükleme yapılmadan da davranış değişmez.
ALTER TABLE staff ADD COLUMN schedule_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_staff_schedule_order ON staff(schedule_order);
