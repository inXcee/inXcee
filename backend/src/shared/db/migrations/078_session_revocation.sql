-- Oturumlar çıkış yapılana kadar açık kaldığı için (kiosk token'ları pratikte
-- süresiz), kimlik bilgisi değiştiğinde eski oturumların kapanması gerekir.
--
-- Unix MİLİSANİYE damgası: token'ın kendi `ims` claim'i bundan eskiyse reddedilir.
-- Saniye çözünürlüğü yetmiyordu — PIN değiştirip aynı saniyede tekrar giriş yapan
-- kullanıcı kendi yeni oturumunu kaybediyordu. NULL = hiç iptal edilmemiş.
ALTER TABLE users ADD COLUMN sessions_valid_from INTEGER;
ALTER TABLE staff ADD COLUMN sessions_valid_from INTEGER;
ALTER TABLE personnel ADD COLUMN sessions_valid_from INTEGER;
