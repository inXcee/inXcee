// Gün detayı görünüm yardımcıları: toplu özet, kişi durum etiketi ve Excel/print
// için düz satır üretimi. Gruplama/kovalama backend'de (buildDayDetail) yapıldı;
// burada yalnız sunum. Saf fonksiyonlar.

const SUMMARY_FIELDS = [
  { key: 'working', label: 'Çalışan' },
  { key: 'on_leave', label: 'İzinli' },
  { key: 'sick', label: 'Raporlu' },
  { key: 'absent', label: 'Devamsız' },
  { key: 'off', label: 'İzin günü' },
]

export function dayDetailSummary(detail) {
  const totals = detail?.totals || {}
  return SUMMARY_FIELDS.map(field => ({ key: field.key, label: field.label, value: totals[field.key] || 0 }))
}

export function personStatusLabel({ kind, shift_name, leave_type_label, reason } = {}) {
  if (kind === 'working') return shift_name ? `Çalışıyor · ${shift_name}` : 'Çalışıyor'
  if (kind === 'on_leave') return leave_type_label ? `İzinli · ${leave_type_label}` : 'İzinli'
  if (kind === 'sick') return 'Raporlu'
  if (kind === 'absent') return reason ? `Devamsız · ${reason}` : 'Devamsız'
  if (kind === 'off') return 'İzin günü'
  return ''
}

// Bir bölümün tüm kişilerini Excel/print sırasına göre düz satırlara açar:
// önce vardiyalardaki çalışanlar, sonra izinli → raporlu → devamsız → izin günü.
export function dayDetailRows(detail) {
  const headers = ['BÖLÜM', 'VARDİYA', 'KİŞİ', 'ROL', 'NOKTA', 'DURUM']
  const rows = []
  for (const group of detail?.groups || []) {
    for (const shift of group.shifts || []) {
      for (const person of shift.people || []) {
        rows.push([
          group.name, shift.shift_name || '', person.full_name,
          person.role_name || '', person.work_location_name || '',
          personStatusLabel({ kind: 'working', shift_name: shift.shift_name }),
        ])
      }
    }
    for (const person of group.on_leave || []) {
      rows.push([group.name, '', person.full_name, '', '', personStatusLabel({ kind: 'on_leave', leave_type_label: person.leave_type_label })])
    }
    for (const person of group.sick || []) {
      rows.push([group.name, '', person.full_name, '', '', personStatusLabel({ kind: 'sick' })])
    }
    for (const person of group.absent || []) {
      rows.push([group.name, '', person.full_name, '', '', personStatusLabel({ kind: 'absent', reason: person.reason })])
    }
    for (const person of group.off || []) {
      rows.push([group.name, '', person.full_name, '', '', personStatusLabel({ kind: 'off' })])
    }
  }
  return { headers, rows }
}
