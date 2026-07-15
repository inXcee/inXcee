-- Günlük su operasyon özetinin SMTP teslim ve yeniden deneme durumunu saklar.

CREATE TABLE IF NOT EXISTS water_daily_digest_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  digest_date TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('smtp_disabled', 'no_recipients', 'queued', 'sending', 'retrying', 'sent', 'failed')),
  source TEXT NOT NULL DEFAULT 'cron'
    CHECK(source IN ('cron', 'manual')),
  recipients TEXT NOT NULL DEFAULT '[]',
  subject TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  job_id INTEGER REFERENCES job_queue(id) ON DELETE SET NULL,
  message_id TEXT,
  last_error TEXT,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  queued_at DATETIME,
  sent_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_water_digest_delivery_date
  ON water_daily_digest_deliveries(digest_date DESC);

CREATE INDEX IF NOT EXISTS idx_water_digest_delivery_job
  ON water_daily_digest_deliveries(job_id);
