const normalize = value => String(value || '').toLocaleLowerCase('tr-TR')

export const CAMPUS_COMMANDS = [
  { id: 'occupancy', label: 'Doluluk görünümünü aç', keywords: 'oda yatak kapasite doluluk', mode: 'occupancy' },
  { id: 'faults', label: 'Arıza görünümünü aç', keywords: 'arıza bakım teknik servis', mode: 'faults', permission: 'faults' },
  { id: 'cleaning', label: 'Temizlik görünümünü aç', keywords: 'temizlik housekeeping görev', mode: 'cleaning', permission: 'cleaning' },
  { id: 'shifts', label: 'Gündüz gece vardiya görünümünü aç', keywords: 'vardiya gündüz gece çalışma saati', mode: 'shifts', permission: 'rooms' },
  { id: 'company', label: 'Şirket dağılımı görünümünü aç', keywords: 'şirket firma taşeron dağılım', mode: 'company', permission: 'rooms' },
  { id: 'quarantine', label: 'Karantina görünümünü aç', keywords: 'karantina izole oda', mode: 'quarantine', permission: 'rooms' },
  { id: 'reports', label: 'Blok raporlarını aç', keywords: 'rapor dışa aktar çıktı', path: '/reports-advanced', roles: ['campus_manager', 'shift_supervisor'] },
]

export function buildCampusSearchResults({
  query,
  blocks = [],
  rooms = [],
  personnel = [],
  faults = [],
  permissions = {},
  role,
}) {
  const needle = normalize(query).trim()
  if (!needle) return []
  const includes = value => normalize(value).includes(needle)
  const results = []

  for (const item of blocks) {
    if (includes(`${item.block} blok tip ${item.type}`)) {
      results.push({ type: 'block', id: item.block, block: item.block, title: `${item.block} Blok`, meta: `Tip ${item.type}` })
    }
  }
  for (const room of rooms) {
    if (includes(`${room.block} ${room.room_no} oda`)) {
      results.push({
        type: 'room', id: room.id, block: room.block, roomId: room.id,
        title: `${room.block}-${room.room_no}`, meta: `${room.occupied || 0}/${room.active_beds || 0} kişi`,
      })
    }
  }
  for (const person of personnel) {
    if (includes(`${person.full_name} ${person.block || ''} ${person.room_no || ''}`)) {
      results.push({
        type: 'person', id: person.id, block: person.block || null, roomId: person.room_id || null,
        title: person.full_name, meta: person.block ? `${person.block}-${person.room_no}` : 'Atanmamış',
      })
    }
  }
  for (const fault of faults) {
    if (includes(`${fault.location} ${fault.description} ${fault.priority}`)) {
      results.push({
        type: 'fault', id: fault.id, block: fault.block || null,
        title: fault.location, meta: fault.description,
      })
    }
  }
  for (const command of CAMPUS_COMMANDS) {
    if (command.permission && !permissions[command.permission]) continue
    if (command.roles && !command.roles.includes(role)) continue
    if (includes(`${command.label} ${command.keywords}`)) {
      results.push({ type: 'command', ...command, title: command.label, meta: 'Komut' })
    }
  }

  const order = { block: 0, room: 1, person: 2, fault: 3, command: 4 }
  return results
    .sort((left, right) => order[left.type] - order[right.type] || left.title.localeCompare(right.title, 'tr'))
    .slice(0, 24)
}

export function deriveCampusDataState({
  online = true,
  loading = false,
  summaryError = false,
  operationsError = false,
  updatedAt = 0,
  now = Date.now(),
}) {
  if (!online) return { id: 'offline', label: 'Bağlantı yok', color: '#dc2626' }
  if (loading) return { id: 'loading', label: 'Yükleniyor', color: '#38bdf8' }
  if (summaryError && operationsError) return { id: 'error', label: 'Veri alınamadı', color: '#dc2626' }
  if (summaryError || operationsError) return { id: 'partial', label: 'Kısmi veri', color: '#f59e0b' }
  if (updatedAt && now - updatedAt > 90_000) return { id: 'stale', label: 'Eski veri', color: '#f59e0b' }
  return { id: 'live', label: 'Canlı', color: '#16a34a' }
}

export function workspaceTabs(permissions = {}) {
  return [
    { id: 'overview', label: 'Genel Bakış', visible: true },
    { id: 'rooms', label: 'Odalar', visible: permissions.rooms },
    { id: 'people', label: 'Kişiler', visible: permissions.rooms },
    { id: 'companies', label: 'Şirketler', visible: permissions.rooms },
    { id: 'shifts', label: 'Vardiyalar', visible: permissions.rooms },
    { id: 'faults', label: 'Arızalar', visible: permissions.faults },
    { id: 'cleaning', label: 'Temizlik', visible: permissions.cleaning },
    { id: 'contact', label: 'İletişim', visible: permissions.faults || permissions.rooms },
    { id: 'activity', label: 'Aktivite', visible: true },
  ].filter(tab => tab.visible)
}
