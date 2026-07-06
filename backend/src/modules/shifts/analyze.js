// Çizelge anomali analizi — saf (DB'siz), birim test edilebilir.
// İçe aktarmadan ÖNCE (dryRun) kullanıcıyı iş-kanunu / sağlık riskleri konusunda uyarır.
// DB'ye bağlı kontrol (onaylı izinliyken vardiya) importSchedule içinde eklenir.

const MAX_CONSEC_NIGHT = 2     // 2+ ardışık gece → yorgunluk/sağlık
// Not: "6+ ardışık çalışma" kontrolü bilinçli olarak yok — tek-hafta import'ta
// Pzt-Cmt (6 gün) + Paz tatil yasal/normal çalışma haftası; "haftalık tatil yok"
// (no_weekly_off) zaten 0 dinlenme gününü yakalar.

// Bir hücre gece vardiyası mı? (00:00 başlangıç — örn. 00:00-08:00)
function isNight(cell) {
  return cell.status === 'scheduled' && cell.startHour === 0
}
function isWork(cell) {
  return cell.status === 'scheduled' || cell.status === 'worked' || cell.status === 'overtime'
}

// rows: kanonik satırlar. weekDates: sıralı ISO tarihler.
// Dönüş: { warnings: [{ staff, kind, message }], counts: {byKind} }
export function analyzeAnomalies(rows, weekDates = []) {
  const warnings = []
  const orderedDates = [...weekDates].sort()

  for (const r of rows) {
    const name = r.name
    const byDate = new Map()
    // Aynı (kişi, tarih) birden çok kez → çakışan giriş
    for (const c of r.cells || []) {
      if (byDate.has(c.date)) {
        warnings.push({ staff: name, kind: 'duplicate', message: `${name}: ${c.date} aynı gün birden fazla kayıt` })
      } else {
        byDate.set(c.date, c)
      }
    }

    // Tarih sırasına göre çalışma/dinlenme dizisi
    const seq = orderedDates.map(d => byDate.get(d) || null)

    // Haftalık dinlenme yok mu? (tüm günler tanımlı VE hepsi çalışma)
    const definedDays = seq.filter(Boolean)
    const restDays = definedDays.filter(c => !isWork(c)).length
    if (definedDays.length >= 7 && restDays === 0) {
      warnings.push({ staff: name, kind: 'no_weekly_off', message: `${name}: hafta boyunca dinlenme günü yok` })
    }

    // Ardışık gece vardiyası serisi
    let nightStreak = 0, maxNight = 0
    for (const c of seq) {
      if (c && isNight(c)) { nightStreak++; maxNight = Math.max(maxNight, nightStreak) }
      else nightStreak = 0
    }
    if (maxNight >= MAX_CONSEC_NIGHT) {
      warnings.push({ staff: name, kind: 'consecutive_night', message: `${name}: ${maxNight} gün ardışık gece vardiyası` })
    }
  }

  const counts = {}
  for (const w of warnings) counts[w.kind] = (counts[w.kind] || 0) + 1
  return { warnings, counts }
}
