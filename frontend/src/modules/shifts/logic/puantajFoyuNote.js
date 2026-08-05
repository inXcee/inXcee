// Puantaj föyünde hücre notu kuralı.
//
// Excel, notu olan her hücrenin köşesine kırmızı üçgen koyar. Föy eskiden
// neredeyse HER güne not yazıyordu (tarih, durum, vardiya, nokta, FM) — sonuç
// baştan aşağı kırmızı üçgenle kaplı, imzaya gidecek bir kâğıt. Üstelik o
// bilgilerin tamamı zaten "VARDİYA DETAY" sayfasında satır satır duruyor.
//
// Kural: not YALNIZCA renkli kodun kendisinin anlatamadığı, açıklama isteyen
// istisnalar için yazılır. Rutin bilgi detay sayfasında kalır.

export const NOTE_REASON_MISSING = 'Devamsızlık nedeni girilmemiş'

export function foyuCellNote(dayCell) {
  if (!dayCell || !dayCell.status) return null

  // Devamsızlık ücreti etkiler ve gerekçesi sorulur — kâğıdın yüzünde görünsün.
  if (dayCell.status === 'absent') {
    return dayCell.absentReason ? `Devamsız — ${dayCell.absentReason}` : NOTE_REASON_MISSING
  }

  // Planlanmış ama gerçekleşme kaydı hiç girilmemiş gün: veri boşluğu,
  // puantaj kapanmadan kapatılması gerekir.
  if (dayCell.status === 'scheduled') return 'Planlı — gerçekleşme kaydı yok'

  return null
}

// Kâğıdın köşesinde tek satırda "kaç istisna var" yazsın diye.
export function countFoyuNotes(rows = []) {
  let absent = 0
  let missingReason = 0
  let planned = 0
  rows.forEach(row => {
    (row.cells || []).forEach(cell => {
      if (cell?.status === 'absent') {
        absent += 1
        if (!cell.absentReason) missingReason += 1
      } else if (cell?.status === 'scheduled') planned += 1
    })
  })
  return { absent, missingReason, planned, total: absent + planned }
}
