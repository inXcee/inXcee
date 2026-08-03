-- Zil kullanılamaz haldeydi: 5202 bildirimin 4963'ü okunmamış, en eskisi Nisan.
-- Sebep, saat kovalı dedup anahtarlarının aynı sorunu saatte bir tekrar etmesi
-- (tek bir torba için 1431 kopya) ve temizliğin yalnız OKUNMUŞ olanları silmesi.
--
-- Kadans düzeltildi (shared/notifications/cadence.js) ve temizlik artık
-- okunmamışları da kapsıyor. Burada bir kerelik birikmiş yığını kapatıyoruz:
-- 7 günden eski okunmamışlar okundu sayılır — silmiyoruz, geçmiş dursun,
-- ama zil bugünden itibaren gerçekten "bakılması gerekenler"i göstersin.
UPDATE notifications
SET is_read = 1
WHERE is_read = 0
  AND created_at < datetime('now', '-7 days');
