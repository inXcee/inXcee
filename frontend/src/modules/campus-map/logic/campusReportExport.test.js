import { describe, it, expect } from 'vitest'
import {
  buildCampusReportHtml,
  campusDetailedReportSections,
  campusReportRows,
} from './campusReportExport.js'

const stats = {
  M1: { block: 'M1', total_rooms: 30, total_beds: 60, occupied: 55, occupancy_pct: 92, empty_rooms: 2, full_rooms: 28, quarantine: 1, maintenance: 0, open_faults: 3, cleaning_total: 30, cleaning_done: 22, cleaning_pct: 73 },
  A: { block: 'A', total_rooms: 20, total_beds: 20, occupied: 9, occupancy_pct: 45, empty_rooms: 11, full_rooms: 9, quarantine: 0, maintenance: 0, open_faults: 0, cleaning_total: 0, cleaning_done: 0, cleaning_pct: 0 },
}

describe('campusReportRows', () => {
  const { overview, attention } = campusReportRows(stats)

  it('durum tablosu başlık + blok satırları + TOPLAM', () => {
    expect(overview.headers).toEqual([
      'BLOK', 'DOLULUK %', 'DOLU YATAK', 'TOPLAM YATAK', 'BOŞ ODA', 'DOLU ODA',
      'ARIZA', 'TEMİZLİK %', 'KARANTİNA', 'BAKIM',
    ])
    expect(overview.rows[0]).toEqual(['M1', 92, 55, 60, 2, 28, 3, 73, 1, 0])
    // Temizlik görevi olmayan blok boş bırakılır (0 yazıp yanıltmasın)
    expect(overview.rows[1]).toEqual(['A', 45, 9, 20, 11, 9, 0, '', 0, 0])
    expect(overview.rows.at(-1)).toEqual(['TOPLAM', 80, 64, 80, 13, 37, 3, 73, 1, 0])
  })

  it('dikkat kuyruğu satırları önem sırasıyla', () => {
    expect(attention.headers).toEqual(['BLOK', 'TÜR', 'DURUM'])
    expect(attention.rows[0][0]).toBe('M1')
    expect(attention.rows[0][1]).toBe('ARIZA')
    expect(attention.rows.some(r => r[1] === 'KARANTİNA')).toBe(true)
  })

  it('boş veri güvenli', () => {
    const empty = campusReportRows({})
    expect(empty.overview.rows).toEqual([])
    expect(empty.attention.rows).toEqual([])
  })
})

describe('buildCampusReportHtml', () => {
  it('başlık, özet ve iki tabloyu içerir', () => {
    const html = buildCampusReportHtml(stats, '2026-07-25')
    expect(html).toContain('KAMPÜS DURUM RAPORU')
    expect(html).toContain('2026-07-25')
    expect(html).toContain('M1')
    expect(html).toContain('TOPLAM')
    expect(html).toContain('DİKKAT GEREKENLER')
  })

  it('kullanıcı verisini HTML-escape eder', () => {
    const html = buildCampusReportHtml({
      X: { block: '<script>x</script>', total_rooms: 1, total_beds: 1, occupied: 0, occupancy_pct: 0, empty_rooms: 1, full_rooms: 0, quarantine: 0, maintenance: 0, open_faults: 0, cleaning_total: 0, cleaning_done: 0, cleaning_pct: 0 },
    }, '2026-07-25')
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('sorun yoksa dikkat bölümü temiz mesajı basar', () => {
    const html = buildCampusReportHtml({
      X: { block: 'X', total_rooms: 4, total_beds: 8, occupied: 4, occupancy_pct: 50, empty_rooms: 2, full_rooms: 1, quarantine: 0, maintenance: 0, open_faults: 0, cleaning_total: 2, cleaning_done: 2, cleaning_pct: 100 },
    }, '2026-07-25')
    expect(html).toContain('Aksiyon bekleyen yok')
  })
})

describe('campusDetailedReportSections', () => {
  const rooms = [
    {
      id: 1, block: 'M1', room_no: '101', floor: 1, status: 'active',
      capacity: 6, active_beds: 5, occupied: 1, notes: 'Sessiz oda',
      occupants: [{
        personnel_id: 10, full_name: 'Ayşe Demir', company: 'Yapı AŞ',
        job_title: 'Kaynakçı', department_name: 'Saha', phone_number: '05320000000',
        check_in_date: '2026-01-02', assigned_at: '2026-07-01 09:00:00', bed_no: 2,
      }],
    },
    {
      id: 2, block: 'M1', room_no: '102', floor: 1, status: 'maintenance',
      capacity: 6, active_beds: 6, occupied: 0, notes: '', occupants: [],
    },
  ]

  it('oda, kişi ve firma tablolarını ayrıntılı üretir', () => {
    const report = campusDetailedReportSections(stats, rooms, {
      includeNotes: true,
      includeContact: true,
    })
    expect(report.counts).toEqual({ rooms: 2, people: 1, companies: 1 })
    expect(report.rooms.headers).toContain('ODA NOTU')
    expect(report.rooms.rows[0]).toEqual(['M1', '101', 1, 'Aktif', 1, 5, 6, 4, 'Sessiz oda'])
    expect(report.people.headers).toContain('TELEFON')
    expect(report.people.rows[0]).toEqual(expect.arrayContaining([
      'M1', '101', 1, 2, 'Ayşe Demir', 'Yapı AŞ', 'Kaynakçı', 'Saha', '05320000000',
    ]))
    expect(report.companies.rows[0]).toEqual(['Yapı AŞ', 1, 1, 1, 'M1'])
  })

  it('boş ve aktif olmayan odaları seçeneklerle filtreler', () => {
    const report = campusDetailedReportSections(stats, rooms, {
      includeEmptyRooms: false,
      onlyActiveRooms: true,
    })
    expect(report.counts.rooms).toBe(1)
    expect(report.rooms.rows[0][1]).toBe('101')
    expect(report.people.headers).not.toContain('TELEFON')
  })

  it('seçilen bölümleri PDF görünümüne taşır', () => {
    const html = buildCampusReportHtml(stats, '2026-07-26', {
      rooms,
      options: {
        title: 'M1 Oda ve Kişi Raporu',
        sections: { summary: false, rooms: true, people: true, companies: true, attention: false },
      },
    })
    expect(html).toContain('M1 ODA VE KİŞİ RAPORU')
    expect(html).toContain('Ayşe Demir')
    expect(html).toContain('FİRMALAR')
    expect(html).not.toContain('DİKKAT GEREKENLER')
  })
})
