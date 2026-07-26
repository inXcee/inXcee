-- Ariza kayitlarini serbest metin konumdan kanonik blok/oda baglantisina tasir.
-- Kolonlar nullable kalir: ortak alan ve eslesmeyen eski kayitlar veri kalitesi
-- kuyrugunda gorunmeye devam eder.

ALTER TABLE maintenance_requests ADD COLUMN block TEXT;
ALTER TABLE maintenance_requests ADD COLUMN room_id INTEGER REFERENCES rooms(id);

UPDATE maintenance_requests AS mr
SET block = (
  SELECT candidates.block
  FROM (SELECT DISTINCT block FROM rooms) AS candidates
  WHERE trim(mr.location) = candidates.block
     OR trim(mr.location) LIKE candidates.block || ' %'
     OR trim(mr.location) LIKE candidates.block || '-%'
  ORDER BY length(candidates.block) DESC
  LIMIT 1
)
WHERE mr.block IS NULL;

UPDATE maintenance_requests AS mr
SET room_id = (
  SELECT r.id
  FROM rooms AS r
  WHERE r.block = mr.block
    AND (
      trim(mr.location) = r.block || '-' || r.room_no
      OR trim(mr.location) = r.block || ' ' || r.room_no
      OR trim(mr.location) LIKE r.block || '% ' || r.room_no
    )
  ORDER BY r.id
  LIMIT 1
)
WHERE mr.block IS NOT NULL AND mr.room_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_block_status
  ON maintenance_requests(block, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_room_status
  ON maintenance_requests(room_id, status);
