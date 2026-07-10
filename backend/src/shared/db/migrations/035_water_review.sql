-- Faz W10: Rol/onay akışı — eksi stok (eşleşmemiş) dağıtımı "kontrol bekliyor".
-- Güvenli ADD COLUMN (CHECK rebuild yok). Dağıtım girilir ama stok karşılığı yoksa
-- needs_review=1 düşer; kampüs müdürü toplu onaylar (needs_review=0).
ALTER TABLE water_movements ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_water_mv_review ON water_movements(needs_review);
