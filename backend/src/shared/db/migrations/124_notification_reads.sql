-- Kişiye özel bildirim okundu / temizlendi durumu (22 Eki 2026).
-- Rol ve herkese giden bildirimlerde notifications.is_read PAYLAŞIMLIYDI: bir müdür okuyunca diğer müdürlerde de
-- okunmuş görünüyor (uyarı gözden kaçıyordu), "okunanları temizle" bildirimi o roldeki herkesten siliyordu.
-- Bu tabloda kullanıcı başına okuma ve temizleme tutulur. Kişisel bildirim (target_user_id dolu) tek sahipli olduğu
-- için eskisi gibi notifications.is_read kullanır. Bu migration'dan önce is_read=1 olmuş rol bildirimleri herkes
-- için okunmuş sayılmaya devam eder (geriye uyum; veri taşıma yok).
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  cleared_at TEXT,
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id, notification_id);
