-- Geçici kiosk PIN teslim zinciri ve sunucu taraflı kiosk oturum politikaları.

CREATE TABLE IF NOT EXISTS kiosk_pin_issuances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  principal_kind TEXT NOT NULL CHECK(principal_kind IN ('staff','personnel')),
  principal_id INTEGER NOT NULL,
  issued_by INTEGER NOT NULL REFERENCES users(id),
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  first_used_at TEXT,
  completed_at TEXT,
  delivered_at TEXT,
  delivered_by INTEGER REFERENCES users(id),
  delivered_to TEXT,
  delivery_method TEXT CHECK(delivery_method IN ('in_person','printed','sealed_envelope','other')),
  revoked_at TEXT,
  revoked_by INTEGER REFERENCES users(id),
  revoke_reason TEXT,
  replaced_by_id INTEGER REFERENCES kiosk_pin_issuances(id),
  CHECK(delivered_at IS NULL OR delivery_method IS NOT NULL)
);

ALTER TABLE auth_sessions ADD COLUMN locked_at TEXT;
ALTER TABLE auth_sessions ADD COLUMN lock_reason TEXT;
ALTER TABLE auth_sessions ADD COLUMN session_mode TEXT CHECK(session_mode IN ('shared','personal'));
ALTER TABLE auth_sessions ADD COLUMN absolute_expires_at INTEGER;
ALTER TABLE auth_sessions ADD COLUMN reauthenticated_at TEXT;
ALTER TABLE auth_sessions ADD COLUMN pin_change_required INTEGER NOT NULL DEFAULT 0 CHECK(pin_change_required IN (0,1));

CREATE INDEX IF NOT EXISTS idx_kiosk_pin_principal
  ON kiosk_pin_issuances(principal_kind, principal_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_kiosk_pin_pending
  ON kiosk_pin_issuances(expires_at, revoked_at, completed_at);
CREATE INDEX IF NOT EXISTS idx_kiosk_sessions_lock
  ON auth_sessions(locked_at, revoked_at, absolute_expires_at);

INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_shared_idle_minutes', '2');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_shared_absolute_hours', '8');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_laundry_idle_minutes', '10');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_laundry_absolute_hours', '12');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_personal_session_days', '30');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_personal_reauth_hours', '12');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('kiosk_initial_pin_hours', '24');

-- Migration öncesinden kalan kiosk token'ları yeni politika dışında kalmasın.
-- Kayıtlı cihaz ilişkisi olmayan eski oturumlar ortak cihaz kabul edilir.
UPDATE auth_sessions
SET session_mode=COALESCE(session_mode, 'shared'),
    absolute_expires_at=COALESCE(
      absolute_expires_at,
      MIN(expires_at, CAST(strftime('%s', created_at) AS INTEGER) + 8 * 60 * 60)
    )
WHERE role IN ('kiosk','avs_kiosk');
