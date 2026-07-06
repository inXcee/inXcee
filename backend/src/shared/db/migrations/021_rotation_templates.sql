-- Faz 30: İsimli vardiya rotasyon şablonları.
-- pattern_json: gün dizisi, her eleman {"shift_def_id": N} veya {"shift_def_id": null} (= OFF).

CREATE TABLE IF NOT EXISTS rotation_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pattern_json TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
