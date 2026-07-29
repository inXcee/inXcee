-- AVS teknik kiosk personelinin arıza havuzundan iş sahiplenmesini izler.
-- Mevcut assigned_to alanı yönetim panelindeki technicians tablosuna bağlıdır;
-- kiosk çalışanları staff tablosunda olduğu için ayrı bir FK kullanılır.

ALTER TABLE maintenance_requests
  ADD COLUMN avs_assigned_worker_id INTEGER REFERENCES staff(id);

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_avs_worker_status
  ON maintenance_requests(avs_assigned_worker_id, status);
