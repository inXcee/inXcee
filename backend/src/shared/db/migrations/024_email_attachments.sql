-- Faz 33: Ek dosya arşivi — mail eklerinin ortak kütüphanesi.
-- stored_name = diskteki ad (DOCUMENTS_DIR), original_name = mail ekinde görünen ad.
-- Dosya güncellenince aynı satır kalır, stored_name/size/updated_at değişir.

CREATE TABLE IF NOT EXISTS email_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'genel',
  stored_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
