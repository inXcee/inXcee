// Yedek saklama planı.
//
// Tasarım 30 gün: PM2 gece yedeği BACKUP_KEEP_DAYS=30, Backblaze B2 yaşam döngüsü 30 gün. Ama uygulama içi cron
// aynı klasörde 7 günden eski HER yedeği siliyordu; `rclone sync` silmeyi B2'ye de yansıttığı için 30 günlük
// güvence fiilen 7 gündü (canlı 15.10.2026: yereldeki en eski yedek 09.10, B2'deki 08.10). Geç fark edilen bir
// veri bozulmasında (ör. 10.10'daki hatalar 15.10'da görüldü) geri dönülecek nokta kalmayabiliyordu.
//
// Kural: son 7 gün → hepsi; 7–30 gün → her takvim günü (İstanbul) için tek yedek, o günün en yenisi;
// 30 günden eski → silinir. Geri yükleme öncesi alınan `pre-restore` yedekleri hiç silinmez.
import { istanbulDate } from '../../shared/time.js'

export const RETENTION = Object.freeze({ fullDays: 7, dailyDays: 30 })
const DAY_MS = 24 * 60 * 60 * 1000

// backups: [{ name, created_at (ISO) }] → silinecek dosya adları
export function backupsToPrune(backups, now = Date.now(), { fullDays = RETENTION.fullDays, dailyDays = RETENTION.dailyDays } = {}) {
  const prune = []
  const keptPerDay = new Map()
  const sorted = [...backups].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))  // en yeni önce
  for (const backup of sorted) {
    if (backup.name.includes('pre-restore')) continue
    const created = new Date(backup.created_at).getTime()
    if (Number.isNaN(created)) continue
    const age = now - created
    if (age < fullDays * DAY_MS) continue
    if (age >= dailyDays * DAY_MS) { prune.push(backup.name); continue }
    const day = istanbulDate(new Date(created))
    if (keptPerDay.has(day)) prune.push(backup.name)
    else keptPerDay.set(day, backup.name)
  }
  return prune
}
