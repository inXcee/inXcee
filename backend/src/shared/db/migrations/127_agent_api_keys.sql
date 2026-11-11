-- Ajan API anahtarları: Hermes gibi bir yapay zekâ ajanının YYS'nin TÜM API'sini bir kullanıcı adına
-- çağırabilmesi için kalıcı kimlik. Oturum (JWT) 30 günde düşer ve 2FA ister; ajan anahtarı düşmez,
-- tek tek iptal edilir. Anahtarın kendisi saklanmaz — yalnız SHA-256 özeti (yüksek entropili, tuz gerekmez).
-- Yetki: bağlı kullanıcının rolü; access='read' ise yalnız okuma (GET/HEAD).
CREATE TABLE IF NOT EXISTS agent_api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access TEXT NOT NULL DEFAULT 'write' CHECK(access IN ('read','write')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  last_used_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_user ON agent_api_keys(user_id);
