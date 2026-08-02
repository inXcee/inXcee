-- Açık oturumların görünür kaydı. Oturumlar çıkış yapılana kadar sürdüğü için
-- yöneticinin "hangi cihazda kim açık" sorusuna cevabı ve tek bir oturumu
-- kapatma imkânı olmalı; hesap bazında iptal (sessions_valid_from) fazla geniş.
--
-- Bu tablo GÖRÜNÜRLÜK içindir. Zorlama mevcut token_blacklist üzerinden yürür,
-- böylece istek başına ekstra okuma eklenmez.
CREATE TABLE IF NOT EXISTS auth_sessions (
  jti TEXT PRIMARY KEY,
  principal_kind TEXT NOT NULL CHECK(principal_kind IN ('user','staff','personnel')),
  principal_id INTEGER NOT NULL,
  full_name TEXT,
  role TEXT,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active
  ON auth_sessions(revoked_at, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_principal
  ON auth_sessions(principal_kind, principal_id);
