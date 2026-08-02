-- Hatalı PIN artık hesabı kilitlemiyor; kullanıcı bekletilmeden "PIN hatalı"
-- uyarısı alıyor. Kilit alanı okunmuyor, ama deploy anında kilitli kalmış
-- kimse mahsur kalmasın diye mevcut kayıtlar bir kez temizleniyor.
UPDATE users     SET pin_locked_until=NULL WHERE pin_locked_until IS NOT NULL;
UPDATE staff     SET pin_locked_until=NULL WHERE pin_locked_until IS NOT NULL;
UPDATE personnel SET pin_locked_until=NULL WHERE pin_locked_until IS NOT NULL;
