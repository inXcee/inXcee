-- 009_card_photo — kart referans fotoğrafı (telefonla kayıt).
--
-- Neden: mevcut fiziksel kartı sisteme alırken fotoğrafı çekilip karta
-- referans/kanıt olarak eklensin. Basit ADD COLUMN — rebuild gerekmez.

ALTER TABLE cards ADD COLUMN photo_url TEXT;

-- Mevcut nfc_uid'leri kanonik forma getir (UPPER + ayraçsız) — artık stations/scan
-- gelen UID'i normalize ettiği için, önceden ham bağlanmış kartlar eşleşmeye devam
-- etsin. shared/nfc.js normalizeNfcUid ile aynı kural (: . - boşluk silinir, büyük harf).
UPDATE cards
SET nfc_uid = UPPER(REPLACE(REPLACE(REPLACE(REPLACE(nfc_uid, ':', ''), '-', ''), ' ', ''), '.', ''))
WHERE nfc_uid IS NOT NULL;
