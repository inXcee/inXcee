-- Temizlik foto kanıtı: görev tamamlanırken çekilen fotoğraf (oda + ortak
-- alan/WC görevleri). completed_by_worker_id: AVS kiosk temizlikçisi
-- (staff.id — assigned_to users'a FK olduğu için oraya yazılamıyordu).
ALTER TABLE cleaning_tasks ADD COLUMN photo_url TEXT;
ALTER TABLE cleaning_tasks ADD COLUMN completed_by_worker_id INTEGER REFERENCES staff(id);
