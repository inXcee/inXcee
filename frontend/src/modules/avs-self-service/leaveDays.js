// İzin gün sayısı hesabı — backend (shifts/service.js createLeaveService) ile
// BİREBİR aynı olmalı: dahil takvim günü → round((end - start) / 1gün) + 1.
// Geçersiz/eksik/ters tarihte 0 döner (önizleme gizlenir).
const MS_PER_DAY = 86400000

export function leaveDays(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  if (end < start) return 0
  return Math.round((end - start) / MS_PER_DAY) + 1
}
