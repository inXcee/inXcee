-- Kart okutma sistemi hiç kullanılmadı (canlıda attendance_events = 0), ama
-- gecelik uzlaştırma planlı her personel için her gün "kart okutması yok" diye
-- KRİTİK istisna açıyordu: 1365 açık kayıt. Kuyruk bu yüzden kullanılamaz hale
-- geldi ve gerçek bir bulgu çıksa içinde kaybolurdu.
--
-- Kural düzeltildi (shifts/service.js: no_card_activity) — o gün hiç okutma
-- yoksa gün gözlemsiz sayılır ve istisna açılmaz. Burada birikmiş olanları
-- kapatıyoruz: silmiyoruz, sebebiyle birlikte "çözüldü" işaretliyoruz.
--
-- Yalnızca gerçekten hiç okutma OLMAYAN günler kapatılır; kart sisteminin
-- kullanıldığı bir günde okutmayan biri varsa o bulgu açık kalır.
UPDATE attendance_exceptions
SET status = 'resolved',
    resolved_at = datetime('now'),
    resolution_note = 'Kart sistemi o gün kullanılmamış — gün gözlemsiz sayıldı (otomatik kapanış)',
    updated_at = datetime('now')
WHERE status = 'open'
  AND exception_type = 'missing_scan'
  AND NOT EXISTS (
    SELECT 1 FROM attendance_events ae WHERE ae.work_date = attendance_exceptions.work_date
  );
