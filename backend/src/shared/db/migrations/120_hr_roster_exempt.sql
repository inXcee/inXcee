-- İK kadro: "puantaj dışı" işareti (13 Eki 2026).
-- Bazı personel YYS'de aktif çalışır ama İK puantajında yer almaz (ör. taşeron / başka firma).
-- Müdür gerekçesiyle işaretler; işaretli kişi "puantajda yok" farkı ve uyarısı üretmez.
-- NULL = normal; dolu = gerekçe. Kim/ne zaman audit_log'da (staff_hr_roster_exempt).
ALTER TABLE staff ADD COLUMN hr_roster_exempt TEXT;
