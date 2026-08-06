// Çizelgede isim sırasını sürükleyerek değiştirme — saf mantık.
//
// Sıra ORTAK: çizelge imzaya ve yazıcıya gidiyor, herkesin ekranında farklı
// sırada görünürse "listedeki 3. kişi" demek anlamını yitirir. Bu yüzden
// sunucuya yazılır, tarayıcıya değil.

// Bir kişiyi hedefin ÜSTÜNE bırakır. Aynı yere bırakma sıra değiştirmez;
// böylece kazara tıklama listeyi oynatmaz.
export function reorderStaff(ids = [], sourceId, targetId) {
  const liste = [...ids]
  if (sourceId == null || targetId == null || sourceId === targetId) return liste
  const from = liste.indexOf(sourceId)
  const to = liste.indexOf(targetId)
  if (from < 0 || to < 0) return liste
  liste.splice(from, 1)
  // Kaynak hedefin üstündeyse çıkarma işlemi hedefi bir yukarı kaydırdı.
  liste.splice(from < to ? to : to, 0, sourceId)
  return liste
}

// Sürükleme her zaman görünen (süzülmüş) liste üzerinde yapılır ama sıra TÜM
// personel için yazılır. Görünmeyenler kendi yerlerinde kalmalı; yoksa bir
// departman süzgeciyle yapılan tek sürükleme, listede olmayan herkesi en alta
// atardı.
export function mergeVisibleOrder(allIds = [], visibleOrder = []) {
  const gorunen = new Set(visibleOrder)
  const sirada = [...visibleOrder]
  let i = 0
  return allIds.map(id => (gorunen.has(id) ? sirada[i++] : id))
}
