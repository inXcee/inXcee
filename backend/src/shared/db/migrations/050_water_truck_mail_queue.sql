-- Tır giriş mailini kalıcı job kuyruğuyla ilişkilendirir.

ALTER TABLE water_truck_arrivals
  ADD COLUMN mail_job_id INTEGER REFERENCES job_queue(id) ON DELETE SET NULL;

ALTER TABLE water_truck_arrivals ADD COLUMN mail_queued_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_water_truck_mail_job
  ON water_truck_arrivals(mail_job_id);
