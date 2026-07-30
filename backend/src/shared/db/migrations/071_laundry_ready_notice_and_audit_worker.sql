-- "Rafta hazır" bildiriminin bir kez gitmesi için kalıcı damga. NULL = hiç
-- gönderilmedi. Torba ready'den geri alınınca NULL'a çekilir ki yeniden hazır
-- olduğunda sakine tekrar haber gitsin.
ALTER TABLE laundry_items ADD COLUMN ready_notified_at TEXT;

-- Kiosk aksiyonlarının çoğunu AVS personeli (staff) yapıyor; bu kayıtlarda
-- audit_log.user_id NULL kalıyordu ve "kim yaptı" sorgulanamıyordu.
-- Diğer modüller etkilenmez (kolon NULL kalır).
ALTER TABLE audit_log ADD COLUMN worker_id INTEGER REFERENCES staff(id);

CREATE INDEX IF NOT EXISTS idx_audit_log_worker
  ON audit_log(worker_id, created_at);
