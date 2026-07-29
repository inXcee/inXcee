-- AVS kiosk ariza bildirimlerini kategori ve kaynak temizlik goreviyle baglar.
-- Eski kayitlar geriye uyum icin "genel" kategorisinde kalir.

ALTER TABLE maintenance_requests
  ADD COLUMN category TEXT NOT NULL DEFAULT 'genel'
  CHECK(category IN ('elektrik','tesisat','klima','boya','genel'));

ALTER TABLE maintenance_requests
  ADD COLUMN cleaning_task_id INTEGER REFERENCES cleaning_tasks(id);

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_category_status
  ON maintenance_requests(category, status);

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_cleaning_task
  ON maintenance_requests(cleaning_task_id);
