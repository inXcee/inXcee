-- Faz 31: Dönem kilidi — bordro kesilen ay puantajı kilitlenir, değiştirilemez.
-- period: 'YYYY-MM'. Kilitliyken o aya düşen puantaj/FM/izin yazımı reddedilir.

CREATE TABLE IF NOT EXISTS period_locks (
  period TEXT PRIMARY KEY,
  locked_by INTEGER REFERENCES users(id),
  locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  note TEXT
);
