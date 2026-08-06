-- Rol renkleri. Şef / şef yardımcısı / müdür gibi yönetici unvanları çizelgede
-- ve çıktılarda ilk bakışta ayırt edilebilsin diye her rol kendi rengini taşır.
-- Renk kullanıcı tarafından değiştirilebilir; sabit bir palet dayatılmaz.
--
-- Diğer tablolarla aynı biçim: Tailwind sınıf adı (bg-...-500). Ekran ve Excel
-- aynı `classHex` haritasından okuduğu için tek kaynak korunur.
ALTER TABLE staff_roles ADD COLUMN color_class TEXT;

-- Mevcut roller renksiz kalmasın: sort_order'a göre birbirinden ayrışan,
-- deterministik bir başlangıç ataması. Kullanıcı sonradan değiştirir.
UPDATE staff_roles SET color_class = CASE (sort_order / 10) % 8
  WHEN 0 THEN 'bg-blue-500'
  WHEN 1 THEN 'bg-emerald-500'
  WHEN 2 THEN 'bg-amber-500'
  WHEN 3 THEN 'bg-purple-500'
  WHEN 4 THEN 'bg-teal-500'
  WHEN 5 THEN 'bg-rose-500'
  WHEN 6 THEN 'bg-cyan-500'
  ELSE 'bg-indigo-500'
END
WHERE color_class IS NULL;
