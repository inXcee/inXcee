-- Çamaşır kart sistemi.
--
-- Bugüne kadar torbayı kimin bıraktığı elle yazılan bir isimdi, kimin aldığı
-- ise ekrana atılan bir imzaydı. İkisi de "o kişi gerçekten o mu" sorusunu
-- cevaplamıyordu: başkasının torbasını alan biri, sadece bir isim yazıp
-- imzalayarak alabiliyordu.
--
-- Sakine ÇAMAŞIR kartı verilir; bırakırken ve alırken okutulur.
--
-- Neden ayrı bir tablo değil: kart üretimi, NFC bağlama, iptal/kayıp, geçerlilik
-- ve kart basımı zaten `cards` tablosunda çözülmüş. Yeni bir tablo bunların
-- hepsini kopyalamak olurdu. Kart FİZİKSEL olarak ayrı (kendi ön eki, kendi
-- basımı, kendi iptali) ama altyapı ortak.

-- SQLite'ta CHECK kısıtı ALTER ile genişletilemez; tablo yeniden kurulur.
-- access_events ve attendance_events cards'a referans veriyor: FK zorlaması
-- runner tarafından transaction DIŞINDA kapatılıyor (db/runner.js), buraya
-- PRAGMA yazmak işe yaramaz — transaction içinde PRAGMA foreign_keys no-op'tur.
CREATE TABLE IF NOT EXISTS cards_yeni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holder_type TEXT NOT NULL CHECK(holder_type IN ('staff', 'personnel', 'visitor')),
  holder_id INTEGER NOT NULL,
  card_type TEXT NOT NULL CHECK(card_type IN ('access', 'meal', 'laundry')),
  code TEXT UNIQUE NOT NULL,
  nfc_uid TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked', 'lost')),
  issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
  issued_by INTEGER,
  revoked_at TEXT,
  valid_until TEXT,
  photo_url TEXT
);

INSERT INTO cards_yeni (id, holder_type, holder_id, card_type, code, nfc_uid, status, issued_at, issued_by, revoked_at, valid_until, photo_url)
SELECT id, holder_type, holder_id, card_type, code, nfc_uid, status, issued_at, issued_by, revoked_at, valid_until, photo_url
FROM cards;

DROP TABLE cards;
ALTER TABLE cards_yeni RENAME TO cards;

CREATE INDEX IF NOT EXISTS ix_cards_holder ON cards(holder_type, holder_id, card_type, status);
CREATE INDEX IF NOT EXISTS ix_cards_code ON cards(code);

-- Her okutma kaydedilir: başarılı da, başarısız da.
--
-- result değerleri:
--   ok           — kart okundu, sahibi bu odanın sakini
--   mismatch     — kart okundu ama sahibi bu odanın sakini DEĞİL (asıl yakalanmak
--                  istenen durum; işlem yine de yapılabilir, kayıt kalır)
--   unknown_card — kod/NFC hiçbir karta uymadı
--   inactive     — kart iptal/kayıp ya da süresi geçmiş
--   override     — kart okutulmadan, gerekçeyle geçildi
--
-- Zorunluluk açıkken kartsız kalan sakin için işlem TAMAMEN durdurulmuyor;
-- gerekçeli geçiş var. Sabah 07:00'de kartını kaybetmiş sakin yüzünden
-- çamaşırhane kilitlenirse sistem kapatılır. Ama geçiş sessiz değil: kim,
-- neden geçti kayıtta durur.
CREATE TABLE IF NOT EXISTS laundry_card_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER REFERENCES laundry_items(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('intake', 'delivery')),
  result TEXT NOT NULL CHECK(result IN ('ok', 'mismatch', 'unknown_card', 'inactive', 'override')),
  card_id INTEGER REFERENCES cards(id),
  scanned_code TEXT,
  personnel_id INTEGER REFERENCES personnel(id),
  room_id INTEGER REFERENCES rooms(id),
  override_reason TEXT,
  operator_user_id INTEGER REFERENCES users(id),
  operator_worker_id INTEGER REFERENCES staff(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_lcs_item ON laundry_card_scans(item_id, action);
CREATE INDEX IF NOT EXISTS ix_lcs_created ON laundry_card_scans(created_at);
CREATE INDEX IF NOT EXISTS ix_lcs_result ON laundry_card_scans(result);

-- Zorunluluk KAPALI başlar: bu özellik açıldığında kartlar henüz dağıtılmamış
-- olur. Açık başlatmak, kart dağıtılana kadar her teslimi gerekçe girmeye
-- zorlardı.
INSERT INTO laundry_global_settings (key, value)
SELECT 'card_required_intake', '0'
WHERE NOT EXISTS (SELECT 1 FROM laundry_global_settings WHERE key = 'card_required_intake');

INSERT INTO laundry_global_settings (key, value)
SELECT 'card_required_delivery', '0'
WHERE NOT EXISTS (SELECT 1 FROM laundry_global_settings WHERE key = 'card_required_delivery');
