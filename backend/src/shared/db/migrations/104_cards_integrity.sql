-- Migration 103, `laundry` tipini eklemek için cards tablosunu yeniden kurdu.
-- O yeniden kurulumda iki eski invariant istemeden kayboldu:
--   1) issued_by -> users foreign key'i
--   2) kişi + kart tipi başına yalnızca bir aktif kart partial unique index'i
--
-- Tablo doluyken bütün satırlar ve cards'a dışarıdan bağlı event referansları
-- korunur. Aktif kart çakışması varsa unique index oluşturulamaz ve migration
-- transaction'ı tamamen geri alınır; sessiz veri silinmez.

CREATE TABLE cards_yeni_104 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holder_type TEXT NOT NULL CHECK(holder_type IN ('staff', 'personnel', 'visitor')),
  holder_id INTEGER NOT NULL,
  card_type TEXT NOT NULL CHECK(card_type IN ('access', 'meal', 'laundry')),
  code TEXT UNIQUE NOT NULL,
  nfc_uid TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked', 'lost')),
  issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
  issued_by INTEGER REFERENCES users(id),
  revoked_at TEXT,
  valid_until TEXT,
  photo_url TEXT
);

INSERT INTO cards_yeni_104
  (id, holder_type, holder_id, card_type, code, nfc_uid, status,
   issued_at, issued_by, revoked_at, valid_until, photo_url)
SELECT id, holder_type, holder_id, card_type, code, nfc_uid, status,
       issued_at, issued_by, revoked_at, valid_until, photo_url
FROM cards;

DROP TABLE cards;
ALTER TABLE cards_yeni_104 RENAME TO cards;

CREATE INDEX ix_cards_holder ON cards(holder_type, holder_id, card_type, status);
CREATE INDEX ix_cards_code ON cards(code);
CREATE INDEX idx_cards_nfc ON cards(nfc_uid);
CREATE UNIQUE INDEX idx_cards_one_active
  ON cards(holder_type, holder_id, card_type)
  WHERE status = 'active';
