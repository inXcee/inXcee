-- Puantaj approval workflow: daily checks + monthly approval trail.

CREATE TABLE IF NOT EXISTS puantaj_period_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,
  dept_scope TEXT NOT NULL DEFAULT 'all',
  dept_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','submitted','approved','returned','locked')),
  note TEXT,
  submitted_by INTEGER REFERENCES users(id),
  submitted_at DATETIME,
  approved_by INTEGER REFERENCES users(id),
  approved_at DATETIME,
  returned_by INTEGER REFERENCES users(id),
  returned_at DATETIME,
  locked_by INTEGER REFERENCES users(id),
  locked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(period, dept_scope)
);

CREATE TABLE IF NOT EXISTS puantaj_daily_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,
  work_date TEXT NOT NULL,
  dept_scope TEXT NOT NULL DEFAULT 'all',
  dept_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'missing'
    CHECK(status IN ('missing','pending','approved','returned')),
  note TEXT,
  submitted_by INTEGER REFERENCES users(id),
  submitted_at DATETIME,
  approved_by INTEGER REFERENCES users(id),
  approved_at DATETIME,
  returned_by INTEGER REFERENCES users(id),
  returned_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(work_date, dept_scope)
);

CREATE TABLE IF NOT EXISTS puantaj_approval_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL CHECK(scope IN ('period','day')),
  period TEXT NOT NULL,
  work_date TEXT,
  dept_scope TEXT NOT NULL DEFAULT 'all',
  dept_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  status TEXT,
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_puantaj_period_approval_period
  ON puantaj_period_approvals(period, dept_scope, status);
CREATE INDEX IF NOT EXISTS idx_puantaj_daily_approval_period
  ON puantaj_daily_approvals(period, work_date, dept_scope, status);
CREATE INDEX IF NOT EXISTS idx_puantaj_approval_events_period
  ON puantaj_approval_events(period, dept_scope, created_at DESC);
