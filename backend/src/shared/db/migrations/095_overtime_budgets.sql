-- Faz 9 — Fazla mesai bütçesi.
--
-- Bugüne kadar mesai onayı bir bütçeye karşı verilmiyordu: ay sonunda toplam
-- görülüyor, o noktada geri alınacak bir şey kalmıyordu. Burada departman/proje
-- ve kişi başına aylık tavan ile yıllık kişi tavanı tutulur.
--
-- period NULL = varsayılan (her ay geçerli). 'YYYY-MM' dolu ise o aya özel
-- tavan varsayılanı ezer.

CREATE TABLE IF NOT EXISTS overtime_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL CHECK(scope IN ('global', 'department', 'project')),
  scope_id INTEGER,
  period TEXT,
  monthly_hours REAL,
  per_person_monthly_hours REAL,
  yearly_person_hours REAL,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_overtime_budget_scope
  ON overtime_budgets(scope, COALESCE(scope_id, -1), COALESCE(period, ''));

-- İş Kanunu m.41: fazla çalışma yılda 270 saati aşamaz. Aylık tavan
-- kurumsal bir tercihtir; boş bırakılır ve "ölçülemiyor" olarak raporlanır.
INSERT INTO overtime_budgets (scope, scope_id, period, yearly_person_hours, note)
SELECT 'global', NULL, NULL, 270, 'İş Kanunu m.41 — yıllık 270 saat sınırı'
WHERE NOT EXISTS (SELECT 1 FROM overtime_budgets WHERE scope = 'global' AND scope_id IS NULL AND period IS NULL);

CREATE INDEX IF NOT EXISTS ix_overtime_records_date ON overtime_records(work_date);
CREATE INDEX IF NOT EXISTS ix_overtime_requests_date ON overtime_requests(work_date, status);
