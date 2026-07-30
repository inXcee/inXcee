// Kiosk "son kullanılan odalar" listesi. Operatör aynı bloktan arka arkaya
// giriş yapıyor; ızgarada oda aramak yerine tek dokunuşla seçsin diye.
// Sadece blok + oda no tutulur — kişi/isim gibi kişisel veri YAZILMAZ.
const KEY = 'kiosk-recent-rooms'
export const MAX_RECENT = 6

export function listRecentRooms() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(r => r && r.block && r.room_no)
      .map(r => ({ block: String(r.block), room_no: String(r.room_no) }))
      .slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

// En sona değil en BAŞA yazar (son kullanılan ilk sırada) ve tekrarları eler.
export function rememberRoom({ block, room_no }) {
  if (!block || !room_no) return listRecentRooms()
  const entry = { block: String(block), room_no: String(room_no) }
  const next = [entry, ...listRecentRooms().filter(
    r => !(r.block === entry.block && r.room_no === entry.room_no)
  )].slice(0, MAX_RECENT)
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* kota — kritik değil */ }
  return next
}
