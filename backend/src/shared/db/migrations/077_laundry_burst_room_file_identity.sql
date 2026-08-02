-- Patlayan file olaylarını torba numarasından bağımsız, oda içindeki file ve
-- file sahibi üzerinden takip eder. Eski olaylar okunabilir kalır.
ALTER TABLE laundry_burst_bag_incidents ADD COLUMN source_file_no TEXT;
ALTER TABLE laundry_burst_bag_incidents ADD COLUMN source_person_name TEXT;

CREATE INDEX IF NOT EXISTS idx_laundry_burst_incidents_room_file
  ON laundry_burst_bag_incidents(source_block, source_room_no, source_file_no, created_at);

