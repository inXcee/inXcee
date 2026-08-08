-- Personel takip uyarilari: ayarlanabilir kurallar, tekil acik risk ve takip gorevi bagi.

CREATE TABLE IF NOT EXISTS personnel_tracking_rules (
  rule_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  window_days INTEGER NOT NULL DEFAULT 30 CHECK(window_days >= 0 AND window_days <= 3660),
  threshold_primary REAL NOT NULL DEFAULT 1 CHECK(threshold_primary >= 0),
  threshold_secondary REAL CHECK(threshold_secondary IS NULL OR threshold_secondary >= 0),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN ('info','warning','critical')),
  due_days INTEGER NOT NULL DEFAULT 3 CHECK(due_days >= 0 AND due_days <= 365),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO personnel_tracking_rules(
  rule_key, label, description, window_days,
  threshold_primary, threshold_secondary, severity, due_days
) VALUES
  ('sick_leave', 'Sik rapor kullanimi', 'Raporlu gun veya ayri rapor sayisi esigi', 30, 5, 3, 'warning', 3),
  ('overtime_monthly', 'Yuksek fazla mesai', 'Takvim ayindaki onayli mesai saati', 31, 45, NULL, 'warning', 3),
  ('shift_changes', 'Sik vardiya degisikligi', 'Donem icindeki vardiya revizyonu', 30, 3, NULL, 'warning', 3),
  ('permanent_movements', 'Sik kalici atama', 'Proje, departman, rol veya konum degisikligi', 90, 2, NULL, 'warning', 5),
  ('absence', 'Devamsizlik takibi', 'Toplam veya ardisik devamsizlik gunu', 30, 3, 2, 'critical', 1),
  ('offboarding_overdue', 'Gecikmis cikis sureci', 'Cikis tarihi gectigi halde tamamlanmayan surec', 0, 1, NULL, 'critical', 1),
  ('future_after_exit', 'Cikis sonrasi kayit', 'Cikis tarihinden sonra kalan vardiya veya izin', 0, 1, NULL, 'critical', 1),
  ('leave_balance_mismatch', 'Izin bakiyesi uyusmazligi', 'Yillik bakiye ile onayli izin toplami farkli', 365, 1, NULL, 'warning', 5),
  ('overdue_critical_followup', 'Gecikmis kritik gorev', 'Son tarihi gecmis kritik personel gorevi', 0, 1, NULL, 'critical', 1);

CREATE TABLE IF NOT EXISTS personnel_tracking_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL REFERENCES personnel_tracking_rules(rule_key) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved','dismissed')),
  metric_value REAL,
  metric_secondary REAL,
  period_start TEXT,
  period_end TEXT,
  assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_at DATETIME,
  followup_id INTEGER REFERENCES staff_followups(id) ON DELETE SET NULL,
  first_detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at DATETIME,
  resolved_at DATETIME,
  dismissed_reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, rule_key)
);

CREATE INDEX IF NOT EXISTS idx_personnel_tracking_alerts_status
  ON personnel_tracking_alerts(status, severity, due_at, last_detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_personnel_tracking_alerts_staff
  ON personnel_tracking_alerts(staff_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_personnel_tracking_alerts_assignee
  ON personnel_tracking_alerts(assigned_user_id, status, due_at);

CREATE TRIGGER IF NOT EXISTS trg_personnel_tracking_rules_updated_at
AFTER UPDATE ON personnel_tracking_rules
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE personnel_tracking_rules SET updated_at=CURRENT_TIMESTAMP WHERE rule_key=NEW.rule_key;
END;

CREATE TRIGGER IF NOT EXISTS trg_personnel_tracking_alerts_updated_at
AFTER UPDATE ON personnel_tracking_alerts
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE personnel_tracking_alerts SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id;
END;

-- Cikis surecindeki personelin son calisma tarihinden sonrasina hicbir yazma
-- yolundan vardiya eklenememesi icin servis katmanina ek olarak DB korumasi.
CREATE TRIGGER IF NOT EXISTS trg_shift_schedule_offboarding_insert
BEFORE INSERT ON shift_schedule
FOR EACH ROW WHEN EXISTS (
  SELECT 1 FROM staff s
  WHERE s.id=NEW.staff_id
    AND s.offboarding_started_at IS NOT NULL
    AND s.exit_date IS NOT NULL
    AND NEW.work_date>s.exit_date
)
BEGIN
  SELECT RAISE(ABORT, 'Cikis tarihinden sonraya vardiya yazilamaz');
END;

CREATE TRIGGER IF NOT EXISTS trg_shift_schedule_offboarding_update
BEFORE UPDATE OF staff_id, work_date ON shift_schedule
FOR EACH ROW WHEN EXISTS (
  SELECT 1 FROM staff s
  WHERE s.id=NEW.staff_id
    AND s.offboarding_started_at IS NOT NULL
    AND s.exit_date IS NOT NULL
    AND NEW.work_date>s.exit_date
)
BEGIN
  SELECT RAISE(ABORT, 'Cikis tarihinden sonraya vardiya yazilamaz');
END;
