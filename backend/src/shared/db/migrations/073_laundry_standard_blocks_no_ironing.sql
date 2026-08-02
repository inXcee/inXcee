-- M/S blokları standart hizmettir. Eski ayar veya kayıtlardan kalan aktif ütü
-- işleri teslimi kilitlemesin; geçişi geçmişte açıkça iz bırakarak kapat.
INSERT INTO laundry_history(item_id, from_status, to_status, notes)
SELECT li.id, 'ironing', 'ready', 'M/S standart blok kuralı: ütü hizmeti kapatıldı'
FROM laundry_items li
JOIN rooms r ON r.id=li.room_id
WHERE li.status='ironing'
  AND (r.block IN ('M','S') OR r.block GLOB 'M[0-9]*' OR r.block GLOB 'S[0-9]*');

INSERT INTO premium_garment_history(garment_id, from_status, to_status, notes)
SELECT pg.id, pg.status,
       CASE WHEN pg.status='ironing' THEN 'ready' ELSE pg.status END,
       'M/S standart blok kuralı: ütü hizmeti kapatıldı'
FROM premium_garments pg
JOIN laundry_items li ON li.id=pg.item_id
JOIN rooms r ON r.id=li.room_id
WHERE li.status NOT IN ('delivered','lost')
  AND pg.requires_ironing=1
  AND (r.block IN ('M','S') OR r.block GLOB 'M[0-9]*' OR r.block GLOB 'S[0-9]*');

UPDATE premium_garments
SET requires_ironing=0,
    status=CASE WHEN status='ironing' THEN 'ready' ELSE status END,
    updated_at=datetime('now')
WHERE item_id IN (
  SELECT li.id FROM laundry_items li
  JOIN rooms r ON r.id=li.room_id
  WHERE li.status NOT IN ('delivered','lost')
    AND (r.block IN ('M','S') OR r.block GLOB 'M[0-9]*' OR r.block GLOB 'S[0-9]*')
);

UPDATE laundry_items
SET is_premium=0,
    needs_ironing=0,
    status=CASE WHEN status='ironing' THEN 'ready' ELSE status END,
    updated_at=datetime('now')
WHERE id IN (
  SELECT li.id FROM laundry_items li
  JOIN rooms r ON r.id=li.room_id
  WHERE li.status NOT IN ('delivered','lost')
    AND (r.block IN ('M','S') OR r.block GLOB 'M[0-9]*' OR r.block GLOB 'S[0-9]*')
);

INSERT INTO laundry_block_config(block, is_premium, updated_at)
SELECT DISTINCT r.block, 0, datetime('now')
FROM rooms r
WHERE r.block IN ('M','S') OR r.block GLOB 'M[0-9]*' OR r.block GLOB 'S[0-9]*'
ON CONFLICT(block) DO UPDATE SET is_premium=0, updated_at=datetime('now');
