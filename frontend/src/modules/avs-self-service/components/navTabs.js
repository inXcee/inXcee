// Alt navigasyon sekmelerini "birincil" + "taşan" olarak böler.
// - tabs.length <= maxSlots → hepsi birincil, taşan yok (Daha fazla butonu gerekmez)
// - aksi halde ilk (maxSlots - 1) sekme birincil, kalanı "Daha fazla" menüsüne taşar
//   (son slot "Daha fazla" butonuna ayrılır). Sıra korunur.
export function splitNavTabs(tabs, maxSlots = 5) {
  if (!Array.isArray(tabs) || tabs.length === 0) return { primary: [], overflow: [] }
  if (tabs.length <= maxSlots) return { primary: tabs, overflow: [] }
  return { primary: tabs.slice(0, maxSlots - 1), overflow: tabs.slice(maxSlots - 1) }
}
