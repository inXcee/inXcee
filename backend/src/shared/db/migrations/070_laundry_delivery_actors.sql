ALTER TABLE laundry_deliveries
  ADD COLUMN delivered_by_worker_id INTEGER REFERENCES staff(id);

ALTER TABLE premium_garment_deliveries
  ADD COLUMN delivered_by_worker_id INTEGER REFERENCES staff(id);

CREATE INDEX IF NOT EXISTS idx_laundry_deliveries_worker
  ON laundry_deliveries(delivered_by_worker_id, delivered_at);

CREATE INDEX IF NOT EXISTS idx_pgd_worker
  ON premium_garment_deliveries(delivered_by_worker_id, delivered_at);
