import { describe, it, expect } from 'vitest'
import { computeLocationOccupancy } from './queries.js'

const LOCATIONS = [
  { id: 1, name: 'OTC Yemekhane', site: 'OTC', color_class: 'a', is_active: 1 },
  { id: 2, name: 'Isci Lokali', site: 'LOKAL', color_class: 'b', is_active: 1 },
  { id: 3, name: 'Kamp Yemekhane', site: 'KAMP', color_class: 'c', is_active: 1 },
]
const RULES = [
  { work_location_id: 2, start_time: '06:15', end_time: '15:00', min_staff: 1, days_of_week: '1,2,3,4,5,6,7' },
  { work_location_id: 2, start_time: '15:00', end_time: '23:00', min_staff: 1, days_of_week: '1,2,3,4,5,6,7' },
]
const DATE = '2026-07-13'
const at = (h, m = 0) => h * 60 + m
const rowOf = (rows, name) => rows.find(r => r.name === name)

function assign(staff_id, full_name, work_location_id, start_time, end_time) {
  return { staff_id, full_name, work_location_id, start_time, end_time, role_name: 'Ikramci', dept_name: 'Mutfak' }
}

describe('computeLocationOccupancy', () => {
  it('bir an için lokasyon doluluğunu ve boş noktaları döner', () => {
    const assignments = [
      assign(10, 'Ali', 1, '08:00', '16:00'),
      assign(11, 'Ayse', 2, '06:15', '15:00'),
      assign(12, 'Veli', null, '08:00', '16:00'), // atanmamış → nötr grup
    ]
    const rows = computeLocationOccupancy({ assignments, locations: LOCATIONS, rules: RULES, date: DATE, atMinutes: at(9) })
    expect(rowOf(rows, 'OTC Yemekhane').count).toBe(1)
    expect(rowOf(rows, 'OTC Yemekhane').present[0].full_name).toBe('Ali')
    expect(rowOf(rows, 'Isci Lokali').count).toBe(1)
    expect(rowOf(rows, 'Isci Lokali').understaffed).toBe(false)
    expect(rowOf(rows, 'Kamp Yemekhane').empty).toBe(true)
    // atanmamış kişi nötr "Konum belirtilmemiş" satırında (Yemekhane'ye sayılmaz)
    const unassigned = rowOf(rows, 'Konum belirtilmemiş')
    expect(unassigned.is_default_area).toBe(true)
    expect(unassigned.count).toBe(1)
  })

  it('kural gerektirdiği saatte lokal boşsa understaffed işaretler', () => {
    const assignments = [assign(10, 'Ali', 1, '08:00', '16:00')] // Lokali'de kimse yok
    const rows = computeLocationOccupancy({ assignments, locations: LOCATIONS, rules: RULES, date: DATE, atMinutes: at(9) })
    const lokal = rowOf(rows, 'Isci Lokali')
    expect(lokal.count).toBe(0)
    expect(lokal.required).toBe(1)
    expect(lokal.understaffed).toBe(true)
    expect(lokal.empty).toBe(true)
  })

  it('kural saati dışında boş lokal understaffed değildir', () => {
    const assignments = []
    const rows = computeLocationOccupancy({ assignments, locations: LOCATIONS, rules: RULES, date: DATE, atMinutes: at(4) })
    const lokal = rowOf(rows, 'Isci Lokali')
    expect(lokal.required).toBe(0)       // 04:00 hiçbir kural kapsamıyor
    expect(lokal.understaffed).toBe(false)
    expect(lokal.empty).toBe(true)
  })

  it('gece aşırı vardiyayı doğru kapsar (20:00-08:00 → 02:00 dolu)', () => {
    const assignments = [assign(10, 'Ali', 1, '20:00', '08:00')]
    const rows = computeLocationOccupancy({ assignments, locations: LOCATIONS, rules: RULES, date: DATE, atMinutes: at(2) })
    expect(rowOf(rows, 'OTC Yemekhane').count).toBe(1)
  })

  it('saat aralığı dışındaki personel o an sayılmaz', () => {
    const assignments = [assign(11, 'Ayse', 2, '06:15', '15:00')]
    const rows = computeLocationOccupancy({ assignments, locations: LOCATIONS, rules: RULES, date: DATE, atMinutes: at(18) })
    expect(rowOf(rows, 'Isci Lokali').count).toBe(0)
  })

  it('saati olmayan (null) atama gün boyu mevcut sayılır', () => {
    const assignments = [assign(10, 'Ali', 1, null, null)]
    const rows = computeLocationOccupancy({ assignments, locations: LOCATIONS, rules: RULES, date: DATE, atMinutes: at(23) })
    expect(rowOf(rows, 'OTC Yemekhane').count).toBe(1)
  })

  it('tüm aktif lokasyonları site→ad sırasıyla, boşları da içerir', () => {
    const rows = computeLocationOccupancy({ assignments: [], locations: LOCATIONS, rules: [], date: DATE, atMinutes: at(9) })
    expect(rows.map(r => r.name)).toEqual(['Kamp Yemekhane', 'Isci Lokali', 'OTC Yemekhane'])
    expect(rows.every(r => r.empty)).toBe(true)
  })
})
