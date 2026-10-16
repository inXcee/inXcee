-- İmza föyü baskı kaydı (15 Eki 2026) — fotoğraftan makinece okuma için.
-- Her PDF basımı bir kayıt: köşe işaretleri bu kaydın numarasını taşır (signatureMarkers.js). Okuyucu (Hermes
-- foy_okur) fotoğraftaki işaretlerden numarayı ve sayfayı bulur, hücre konumlarını layout_json'dan, basılı
-- şablonu (mürekkep farkı için) pdf'ten alır. Kadro sonradan değişse de fotoğraf basıldığı hâliyle okunur.
CREATE TABLE IF NOT EXISTS signature_sheet_prints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT,
  dates_json TEXT NOT NULL,
  layout_json TEXT,
  pdf BLOB,
  page_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signature_sheet_prints_created ON signature_sheet_prints(created_at);
