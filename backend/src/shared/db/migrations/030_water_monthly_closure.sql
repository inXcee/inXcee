-- Faz W2: Su takip — ay sonu kapanış / uyuşturma.
-- İki tablo: aylık kilit kaydı + ürün bazlı sayım fişleri (sistem vs sayım farkı).
-- water_movements'a DOKUNULMAZ; kapanış snapshot'ı ayrı tabloda tutulur.

-- ── 1) Aylık kapanış / kilit ──
CREATE TABLE IF NOT EXISTS water_monthly_closures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL UNIQUE,                 -- YYYY-MM
  is_locked INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  closed_by INTEGER REFERENCES users(id),
  closed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── 2) Ürün bazlı sayım fişleri (ay × ürün tekil) ──
-- system_base: kapanış anındaki sistem kalanı (snapshot, ay sonu bakiyesi)
-- counted_base: fiziksel sayım (manuel, adet cinsinden)
-- diff_base: counted - system (fark); reason fark≠0 ise zorunlu (serviste doğrulanır)
CREATE TABLE IF NOT EXISTS water_stock_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,                        -- YYYY-MM
  product_id INTEGER NOT NULL REFERENCES water_products(id),
  system_base INTEGER NOT NULL DEFAULT 0,
  counted_base INTEGER,
  diff_base INTEGER,
  reason TEXT,                                -- eksik_irsaliye / fazla_dagitim / sayim_farki / fire_kirik / yanlis_urun / devir_duzeltme
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(month, product_id)
);

CREATE INDEX IF NOT EXISTS idx_water_counts_month ON water_stock_counts(month);
