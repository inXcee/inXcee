-- İSG olay/kaza takibi (admin-system spec Faz 2 — safety build-out).
-- KKD ve eğitim takibi zaten vardı; eksik olan olay (incident) kaydıydı.
CREATE TABLE IF NOT EXISTS safety_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at DATETIME NOT NULL,
  location TEXT,
  incident_type TEXT NOT NULL CHECK(incident_type IN ('injury','near_miss','property_damage','environmental','other')),
  severity TEXT NOT NULL DEFAULT 'minor' CHECK(severity IN ('minor','moderate','major','critical')),
  description TEXT NOT NULL,
  staff_id INTEGER REFERENCES staff(id),
  actions_taken TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','closed')),
  reported_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  closed_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_safety_incidents_status ON safety_incidents(status, occurred_at DESC);
