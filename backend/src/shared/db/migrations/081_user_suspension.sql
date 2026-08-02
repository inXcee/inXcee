-- Panel kullanıcısını geçici olarak kapatmanın yolu yoktu; tek seçenek silmekti
-- ve bu geçmişi (audit, atamalar) kopardığı için kimse kullanmıyordu.
-- Askıya alınan kullanıcı giriş yapamaz ve mevcut token'ı da anında geçersizleşir.
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN suspended_at TEXT;
ALTER TABLE users ADD COLUMN suspended_reason TEXT;
