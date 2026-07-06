-- Operatör performans kırılımı: kiosk işlemlerinde durumu kim değiştirdi.
-- action_by users.id'dir (hub); kiosk operatör token'ı staff.id taşır
-- (loginAvsKiosk staff tablosundan çalışır — avs_workers DEĞİL).
ALTER TABLE laundry_history ADD COLUMN worker_id INTEGER REFERENCES staff(id);
