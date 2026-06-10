-- Makine bakım takibi: son bakımdan beri yıkama sayacı + son bakım zamanı.
-- Mevcut makineler hiç bakım görmemiş kabul edilir (sayaç = toplam yıkama).
ALTER TABLE laundry_machines ADD COLUMN runs_since_maintenance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE laundry_machines ADD COLUMN last_maintenance_at TEXT;
UPDATE laundry_machines SET runs_since_maintenance = COALESCE(total_runs, 0);
