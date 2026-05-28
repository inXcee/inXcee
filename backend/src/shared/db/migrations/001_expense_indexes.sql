-- 001_expense_indexes — gider sorguları için indeksler.
--
-- expenses listesi expense_date'e göre filtreler+sıralar; /summary endpoint'i
-- strftime(expense_date) ve category üzerinden GROUP BY yapar. Bu indeksler
-- tam-tablo taramasını önler. IF NOT EXISTS — baseline'da varsa güvenli no-op.

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
