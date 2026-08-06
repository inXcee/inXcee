-- "Alacak izin" ile "denkleştirme" sahada aynı şeyin iki adı: fazla mesainin
-- ücret yerine serbest zaman olarak kullanılması. Hangi terimi kullanan olursa
-- olsun aynı kodu bulsun diye etiket ikisini birden taşıyor.
--
-- Kullanıcı etiketi kendisi değiştirdiyse DOKUNULMAZ: yalnızca 042'den gelen
-- varsayılan metin güncellenir.
UPDATE puantaj_codes
SET label = 'Alacak izin (denkleştirme)'
WHERE leave_type = 'owed' AND label = 'Alacak izin';
