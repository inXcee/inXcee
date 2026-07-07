-- Faz 32: Kullanıcının kendi kaydettiği e-posta şablonları.
-- Dahili (builtin) şablonlar koddadır; bu tablo yalnızca özel şablonları tutar.

CREATE TABLE IF NOT EXISTS email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT 'personel',
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
