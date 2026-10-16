-- İmza föyü sayfa okumaları (16 Eki 2026) — fotoğraftan okunan her föy sayfası bir kayıt.
-- Föy sayfa sayfa fotoğraflanır; bir bölüm birden fazla sayfaya (ve FPU / Kamp Alanı föylerine) yayılabilir.
-- Föy takibi (signature_check_runs) bölüm × gün başına SON kontrolü gösterdiği için sayfaları tek tek kontrol
-- etmek, sonraki sayfanın öncekini ezmesine yol açıyordu. Artık her sayfa okuması burada saklanır; kontrol, o
-- haftanın tüm baskılarında her sayfanın son okumasının BİRLEŞİMİYLE yapılır (signatureReads.js). Aynı tablo
-- "hangi sayfa geldi / gelmedi" takibinin de kaynağıdır.
CREATE TABLE IF NOT EXISTS signature_sheet_reads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  print_id INTEGER NOT NULL REFERENCES signature_sheet_prints(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL,
  photo_day TEXT,
  rows_json TEXT NOT NULL,
  stats_json TEXT,
  source TEXT NOT NULL DEFAULT 'telegram',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signature_sheet_reads_print ON signature_sheet_reads(print_id, page_index, id);
CREATE INDEX IF NOT EXISTS idx_signature_sheet_prints_week ON signature_sheet_prints(week_start);

-- Sade haftalık föyün grubu (proje id / 'none') ve başlığı. Grup başına haftada beklenen tek föy vardır: aynı grup
-- yeniden basılırsa en çok okunan baskı esas alınır. Web'deki bölüm föyü (grup yok) yalnız okunursa takibe girer.
ALTER TABLE signature_sheet_prints ADD COLUMN group_key TEXT;
ALTER TABLE signature_sheet_prints ADD COLUMN title TEXT;

-- Bu migration'dan önce basılan sade föyler (A3, görev sütunu yok): başlık = proje adının Türkçe büyük harfi.
UPDATE signature_sheet_prints
SET title = json_extract(layout_json, '$.pages[0].department'),
    group_key = COALESCE(
      CASE WHEN json_extract(layout_json, '$.pages[0].department') = 'PROJE ATANMAMIŞ' THEN 'none' END,
      (SELECT CAST(p.id AS TEXT) FROM projects p
        WHERE upper(replace(replace(replace(replace(replace(replace(replace(p.name,
                'i', 'İ'), 'ı', 'I'), 'ç', 'Ç'), 'ş', 'Ş'), 'ğ', 'Ğ'), 'ü', 'Ü'), 'ö', 'Ö'))
              = json_extract(layout_json, '$.pages[0].department')))
WHERE layout_json IS NOT NULL AND group_key IS NULL
  AND json_extract(layout_json, '$.page.width') > 1000
  AND json_extract(layout_json, '$.table.role_w') = 0;
