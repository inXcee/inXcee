-- Faz W4: Dağıtım yeri (bölge) bazlı beklenen aylık tüketim.
-- Modal'da bu ay dağıtımı beklenenle karşılaştırılır; sapma büyükse uyarı gösterilir.
-- Değer adet (base birim) cinsindendir; 0 = beklenen tanımsız (uyarı yok).
ALTER TABLE water_zones ADD COLUMN expected_monthly INTEGER NOT NULL DEFAULT 0;
