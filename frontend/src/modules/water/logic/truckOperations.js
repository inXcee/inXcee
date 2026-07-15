const todayIso = () => new Date().toLocaleDateString('sv-SE')

export const truckFilterDefs = Object.freeze([
  { key: 'action', label: 'Aksiyon' },
  { key: 'mail', label: 'Mail bekleyen' },
  { key: 'ready', label: 'Mail hazır' },
  { key: 'missing', label: 'Eksik bilgi' },
  { key: 'photo', label: 'Fotosuz' },
  { key: 'today', label: 'Bugün gelecek' },
  { key: 'late', label: 'Geciken' },
  { key: 'all', label: 'Tümü' },
])

export function truckBadgeBySeverity(severity) {
  return {
    success: 'badge-green',
    critical: 'badge-red',
    warning: 'badge-amber',
    attention: 'badge-blue',
    muted: 'badge-gray',
  }[severity] || 'badge-gray'
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || '').split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function truckCheckSlots(truck) {
  const start = timeToMinutes(truck?.reminder_start_time || '08:00')
  const end = timeToMinutes(truck?.reminder_end_time || '17:00')
  const step = Math.max(15, Number(truck?.reminder_interval_minutes || 60))
  if (start == null || end == null || end < start) return []
  const slots = []
  for (let cursor = start; cursor <= end && slots.length < 16; cursor += step) {
    slots.push(minutesToTime(cursor))
  }
  return slots
}

export function truckPriorityScore(truck, today) {
  let score = 0
  if (truck?.deadline_passed || truck?.mail_phase === 'overdue') score += 60
  if (truck?.arrival_phase === 'late') score += 50
  if (truck?.mail_required) score += 24
  if ((truck?.missing_mail_fields || []).length) score += 18
  if (truck?.arrival_date === today) score += 14
  if (!truck?.photo_count && truck?.status !== 'cancelled') score += 6
  return score
}

export function gateEntryFileBase(truck, fallbackDate = todayIso()) {
  const plate = String(truck?.plate || 'arac').trim().replace(/\s+/g, '-')
  return `su-nakliye-personel-giris-${truck?.arrival_date || fallbackDate}-${plate}`
}

export function gateEntryRows(truck) {
  const entry = truck?.gate_entry || {}
  return [
    ['ADI SOYADI', entry.full_name || truck?.driver_name || '-'],
    [
      'T.C. KİMLİK / PASAPORT NUMARASI',
      `${entry.identity_label || (truck?.identity_type === 'passport' ? 'Pasaport' : 'T.C. Kimlik')}: ${entry.identity_no || truck?.driver_tc || '-'}`,
    ],
    ['TELEFON NUMARASI', entry.phone || truck?.driver_phone || '-'],
    [
      'ARAÇ PLAKASI',
      [entry.plate || truck?.plate, entry.trailer_plate || truck?.trailer_plate].filter(Boolean).join('\n') || '-',
    ],
    ['ZİYARET EDİLECEK FİRMA', entry.visit_company || truck?.visit_company || '-'],
    ['ZİYARET EDİLECEK KİŞİ', entry.host_person_name || truck?.host_person_name || '-'],
    [
      'ZİYARET EDİLECEK KİŞİ TELEFONU',
      entry.host_person_phone || truck?.host_person_phone || '-',
    ],
    ['GİRİŞ TARİHİ', entry.entry_date || truck?.arrival_date || '-'],
    [
      'GİRİŞ SAATİ',
      [entry.entry_start_time || truck?.arrival_start_time, entry.entry_end_time || truck?.arrival_end_time]
        .filter(Boolean).join('-') || '-',
    ],
    ['SAHA GİRİŞ NEDENİ', entry.entry_reason || truck?.entry_reason || 'SU AMAÇLI NAKLİYE'],
    ['ÇALIŞMA YAPACAĞI BÖLGE', entry.work_area || truck?.work_area || '-'],
  ]
}
