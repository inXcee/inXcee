-- Özel finans kasası (private-finance) — sahip bayrağı.
--
-- TASARIM KARARI — erişim ROL ile değil KULLANICI bayrağıyla verilir. Canlıda `admin`
-- ve `mudur_m` aynı rolde (campus_manager); kasa kişisel veridir ve yalnız sahibine
-- açıktır. Bayrak yalnız bu migration'la (veya elle SQL ile) verilir; kullanıcı
-- yönetimi ekranından/API'den değiştirilemez, böylece bir müdür kendine yetki veremez.
--
-- Kasanın verisi yys.db'de DEĞİL, ayrı `finance-vault.db` dosyasındadır
-- (bkz. modules/private-finance/vault.js) — firma yedeklerine/raporlarına karışmaz.

ALTER TABLE users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0;

UPDATE users SET is_owner = 1 WHERE username = 'admin';
