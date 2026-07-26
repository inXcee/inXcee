import { describe, it, expect } from 'vitest'
import { buildCampusReportHtml, campusReportRows } from './campusReportExport.js'

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
