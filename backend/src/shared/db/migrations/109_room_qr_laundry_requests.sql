-- Faz 5 — Oda QR'ından çamaşır alma talebi.
--
-- Sakin odadan çıkmadan "çamaşırım alınsın" diyebilecek. Bu bir TALEPTİR,
-- teslim DEĞİLDİR: torba fiziksel olarak alınırken mevcut kart kapısı, gerekçe,
-- imza ve premium kuralları baştan uygulanır. Talebi teslim saymak, sakinin
-- telefonundan çamaşırhane kaydı açtırmak olurdu.
--
-- Aynı odada açık talep varken ikinci talep yeni satır açmaz; mevcut talep
-- güncellenir (not eklenir, sayaç artar). Yoksa sabırsız sakin beş kez basınca
-- çamaşırhaneye beş iş düşerdi.

CREATE TABLE IF NOT EXISTS laundry_pickup_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_location_id INTEGER NOT NULL REFERENCES service_locations(id),
  room_id INTEGER REFERENCES rooms(id),
  personnel_id INTEGER REFERENCES personnel(id),
  identity_mode TEXT NOT NULL DEFAULT 'anonymous'
    CHECK(identity_mode IN ('anonymous', 'resident_pin')),
  note TEXT,
  bag_estimate INTEGER,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open', 'collected', 'cancelled', 'expired')),
  request_count INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'room_qr',
  laundry_item_id INTEGER REFERENCES laundry_items(id),
  collected_at TEXT,
  collected_by INTEGER REFERENCES users(id),
  cancelled_reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Oda başına yalnız bir açık talep: birleştirme kuralının veritabanı tarafındaki
-- güvencesi. Uygulama katmanı da birleştirir ama yarış durumunda bu tutar.
CREATE UNIQUE INDEX IF NOT EXISTS ux_laundry_pickup_open
  ON laundry_pickup_requests(service_location_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS ix_laundry_pickup_status ON laundry_pickup_requests(status, created_at);
CREATE INDEX IF NOT EXISTS ix_laundry_pickup_room ON laundry_pickup_requests(room_id, status);
