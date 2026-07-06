-- Makine koşu kaydı: her yıkama başlangıcı satır olarak tutulur — gün/hafta/ay
-- bazlı çalışma takibi için. (Ömür boyu total_runs sayacı kalır; bu tablo
-- zaman kırılımını verir.)
CREATE TABLE IF NOT EXISTS laundry_machine_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id INTEGER NOT NULL REFERENCES laundry_machines(id) ON DELETE CASCADE,
  item_id INTEGER,
  started_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_machine_runs_machine_date ON laundry_machine_runs(machine_id, started_at);

-- Backfill: geçmiş yıkama başlangıçları history + item eşlemesinden
-- (washing geçişi history'ye yazılır; item.machine_id yıkayan makinedir)
INSERT INTO laundry_machine_runs(machine_id, item_id, started_at)
SELECT li.machine_id, li.id, lh.created_at
FROM laundry_history lh
JOIN laundry_items li ON li.id = lh.item_id
WHERE lh.to_status = 'washing' AND li.machine_id IS NOT NULL;
