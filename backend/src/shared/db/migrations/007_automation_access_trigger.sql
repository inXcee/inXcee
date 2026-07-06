-- 007_automation_access_trigger — automation_rules.trigger_type CHECK'ine
-- 'access_overdue_inside' ekle (Faz 9: çıkışsız uzun süre içeride kalan için kural).
--
-- baseline (index.js) trigger_type CHECK'i dondurulmuş; SQLite'ta CHECK değiştirmek
-- tablo yeniden inşası gerektirir. automation_rules'a referans veren başka tablo yok
-- → DROP+RENAME güvenli (runner transaction'ı içinde).

CREATE TABLE automation_rules_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('occupancy_high','contract_expiring','maintenance_backlog','drill_overdue','no_recent_drill','access_overdue_inside')),
  trigger_threshold REAL NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN ('log','notify_group')),
  action_target INTEGER,
  cooldown_hours INTEGER NOT NULL DEFAULT 24,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_triggered_at DATETIME,
  last_status TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO automation_rules_new
  (id, name, trigger_type, trigger_threshold, action_type, action_target, cooldown_hours, is_active, last_triggered_at, last_status, created_by, created_at)
  SELECT id, name, trigger_type, trigger_threshold, action_type, action_target, cooldown_hours, is_active, last_triggered_at, last_status, created_by, created_at
  FROM automation_rules;

DROP TABLE automation_rules;
ALTER TABLE automation_rules_new RENAME TO automation_rules;
