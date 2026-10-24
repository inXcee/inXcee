// Saha ekranı oda panosu — saf yardımcılar (docs/saha-ekrani.md). Kutucuğun rengi, katın ilerlemesi ve
// sunucunun UTC zaman damgasının yerel gösterimi tek yerden.
import { parseSqlUtc, ymd } from '../../../shared/logic/localDate.js'

// Kapalı oda her durumda soluk görünür (işaretlenemez); ortak alanın kullanım durumu yoktur.
export function spotTone(spot) {
  if (spot.use_state === 'closed') return 'closed'
  if (spot.status === 'cleaned') return 'cleaned'
  if (spot.status === 'skipped') return 'skipped'
  return 'idle'
}

// Kat başlığındaki ilerleme: yalnız odalar (ortak alanlar ayrı gösterilir), kapalı odalar sayılmaz.
export function floorProgress(floor) {
  const rooms = (floor.rooms || []).filter(room => room.use_state !== 'closed')
  return {
    total: rooms.length,
    cleaned: rooms.filter(room => room.status === 'cleaned').length,
    skipped: rooms.filter(room => room.status === 'skipped').length,
    occupied: rooms.filter(room => room.occupancy === 'occupied').length,
    empty: rooms.filter(room => room.occupancy === 'empty').length,
  }
}

// Sunucu damgası (UTC, 'YYYY-MM-DD HH:MM:SS') → bugünse "09:15", değilse "23.10 14:30".
export function spotTime(value, now = new Date()) {
  const date = parseSqlUtc(value)
  if (!date) return null
  const time = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  if (ymd(date) === ymd(now)) return time
  // gün.ay elle: ICU sürümüne göre tr-TR kısa biçimi '23/10' ya da '23.10' çıkabiliyor
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')} ${time}`
}
