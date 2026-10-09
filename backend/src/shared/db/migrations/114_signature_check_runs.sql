-- İmzalı föy dönüş takibi (9 Eki 2026): föy kontrolü (signature-check) puantaja hiçbir şey
-- yazmaz; burada yalnız "şu günün şu bölüm föyü kontrol edildi, şu kadar uyarı çıktı" tutulur.
-- Bir kontrol, eşleşen kişilerin bölümüne göre gün × bölüm satırlarına bölünür (batch_id ortak).
-- department_id NULL = bölümü belirsiz kalan (yalnız eşleşmeyen satır içeren) parça.
-- Kapsama tablosunda her (gün, bölüm) için EN SON satır geçerlidir; eskiler geçmiş olarak kalır.
CREATE TABLE IF NOT EXISTS signature_check_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  source TEXT NOT NULL DEFAULT 'web' CHECK(source IN ('web','telegram')),
  rows_count INTEGER NOT NULL DEFAULT 0,
  signed_ok INTEGER NOT NULL DEFAULT 0,
  not_working_ok INTEGER NOT NULL DEFAULT 0,
  warnings INTEGER NOT NULL DEFAULT 0,
  missing_signature INTEGER NOT NULL DEFAULT 0,
  mark_mismatch INTEGER NOT NULL DEFAULT 0,
  signed_not_working INTEGER NOT NULL DEFAULT 0,
  unmatched INTEGER NOT NULL DEFAULT 0,
  not_on_sheet INTEGER NOT NULL DEFAULT 0,
  -- yalnız uyarı / eşleşmeyen / föyde olmayan kısa listesi (isim + metin), detay için
  findings_json TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_signature_runs_day_dept ON signature_check_runs(work_date, department_id, id);
CREATE INDEX IF NOT EXISTS idx_signature_runs_batch ON signature_check_runs(batch_id);
