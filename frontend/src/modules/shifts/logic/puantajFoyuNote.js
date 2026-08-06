// Puantaj föyünde hücre notu kuralı.
//
// Excel, notu olan her hücrenin köşesine kırmızı üçgen koyar. Föy eskiden
// neredeyse HER güne not yazıyordu (tarih, durum, vardiya, nokta, FM) — sonuç
// baştan aşağı kırmızı üçgenle kaplı, imzaya gidecek bir kâğıt. Üstelik o
// bilgilerin tamamı zaten "VARDİYA DETAY" sayfasında satır satır duruyor.
//
// Kural: not YALNIZCA ücreti/hakkı etkileyen, kâğıdın yüzünde görünmesi
// istenen olaylar için yazılır. PLANLI günler bilerek dışarıda: plan girilip
// puantaj işlenmemiş aylarda bunlar yüzlerce hücre eder ve kâğıdı yine kırmızıya
// boğar. Rutin vardiya/nokta bilgisi detay sayfasında kalır.

export const NOTE_REASON_MISSING = 'Devamsızlık nedeni girilmemiş'

// "Alacak izin" ile "denkleştirme" aynı şeyin iki adı: fazla mesainin ücret
// yerine serbest zaman olarak kullanılması. Kâğıtta ikisi birden yazılır ki
// hangi terimi kullanan olursa olsun aynı satırı görsün.
export const OWED_LEAVE_LABEL = 'Alacak izin (denkleştirme)'

function hasOvertime(dayCell) {
  return Number(dayCell.overtimeHours || 0) > 0
}

function isOwedLeave(dayCell) {
  return dayCell.status === 'on_leave' && dayCell.leaveType === 'owed'
}

export function foyuCellNote(dayCell) {
  if (!dayCell || !dayCell.status) return null

  // Devamsızlık ücreti etkiler ve gerekçesi sorulur.
  if (dayCell.status === 'absent') {
    return dayCell.absentReason ? `Devamsız — ${dayCell.absentReason}` : NOTE_REASON_MISSING
  }

  // Alacak izin/denkleştirme: hak kullanımı, ayrıca görünsün.
  if (isOwedLeave(dayCell)) return OWED_LEAVE_LABEL

  // FİİLEN yapılan mesai — planlanan değil.
  if (hasOvertime(dayCell)) return `Fazla mesai ${Number(dayCell.overtimeHours)} saat`

  return null
}

// Kâğıdın köşesinde tek satırda "kaç istisna var" yazsın diye.
export function countFoyuNotes(rows = []) {
  let absent = 0
  let missingReason = 0
  let overtime = 0
  let owed = 0
  rows.forEach(row => {
    (row.cells || []).forEach(cell => {
      if (!cell?.status) return
      if (cell.status === 'absent') {
        absent += 1
        if (!cell.absentReason) missingReason += 1
      } else if (isOwedLeave(cell)) owed += 1
      else if (hasOvertime(cell)) overtime += 1
    })
  })
  return { absent, missingReason, overtime, owed, total: absent + overtime + owed }
}
