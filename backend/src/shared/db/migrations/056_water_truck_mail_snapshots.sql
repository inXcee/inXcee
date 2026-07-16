-- Tır mailini gönderim anındaki içeriği ve SMTP teslim kimliğiyle sürümler.

ALTER TABLE water_truck_arrivals
  ADD COLUMN mail_version INTEGER NOT NULL DEFAULT 0 CHECK(mail_version >= 0);

ALTER TABLE water_truck_arrivals ADD COLUMN mail_snapshot_to TEXT;
ALTER TABLE water_truck_arrivals ADD COLUMN mail_snapshot_subject TEXT;
ALTER TABLE water_truck_arrivals ADD COLUMN mail_snapshot_body TEXT;
ALTER TABLE water_truck_arrivals ADD COLUMN mail_snapshot_at DATETIME;
ALTER TABLE water_truck_arrivals ADD COLUMN mail_message_id TEXT;
