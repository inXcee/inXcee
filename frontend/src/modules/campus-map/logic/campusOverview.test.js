import { describe, it, expect } from 'vitest'
import { buildAttentionQueue, buildOverviewRows, sortOverviewRows } from './campusOverview.js'

// /campus-map/summary yanıtının panelin kullandığı alt kümesi.
const summary = {
  M1: { block: 'M1', total_rooms: 30, total_beds: 60, occupied: 55, occupancy_pct: 92, empty_rooms: 2, full_rooms: 28, quarantine: 1, maintenance: 0, open_faults: 3, cleaning_total: 30, cleaning_done: 22, cleaning_skipped: 0, cleaning_pct: 73 },
  M2: { block: 'M2', total_rooms: 30, total_beds: 60, occupied: 47, occupancy_pct: 78, empty_rooms: 6, full_rooms: 22, quarantine: 0, maintenance: 2, open_faults: 0, cleaning_total: 30, cleaning_done: 30, cleaning_skipped: 0, cleaning_pct: 100 },
  S1: { block: 'S1', total_rooms: 24, total_beds: 48, occupied: 48, occupancy_pct: 100, empty_rooms: 0, full_rooms: 24, quarantine: 0, maintenance: 0, open_faults: 1, cleaning_total: 24, cleaning_done: 12, cleaning_skipped: 0, cleaning_pct: 50 },
  A: { block: 'A', total_rooms: 20, total_beds: 20, occupied: 9, occupancy_pct: 45, empty_rooms: 11, full_rooms: 9, quarantine: 0, maintenance: 0, open_faults: 0, cleaning_total: 0, cleaning_done: 0, cleaning_skipped: 0, cleaning_pct: 0 },
}

describe('buildOverviewRows', () => {
  const { rows, totals } = buildOverviewRows(summary)

  it('her blok bir satır, varsayılan doluluk %’ye göre çoktan aza', () => {
    expect(rows.map(r => r.block)).toEqual(['S1', 'M1', 'M2', 'A'])
  })

  it('satır alanları özet ile birebir', () => {
    const m1 = rows.find(r => r.block === 'M1')
    expect(m1).toMatchObject({
      occupancy_pct: 92, empty_rooms: 2, full_rooms: 28,
      open_faults: 3, cleaning_pct: 73, quarantine: 1, maintenance: 0,
    })
  })

  it('temizlik görevi olmayan blokta yüzde yerine null (— gösterilecek)', () => {
    expect(rows.find(r => r.block === 'A').cleaning_pct).toBeNull()
  })

  it('TOPLAM satırı kampüs genelini toplar, doluluk yatak ağırlıklı hesaplanır', () => {
    expect(totals).toMatchObject({
      total_rooms: 104, total_beds: 188, occupied: 159,
      empty_rooms: 19, open_faults: 4, quarantine: 1, maintenance: 2,
    })
    // 159/188 = %85 (satır yüzdelerinin ortalaması DEĞİL)
    expect(totals.occupancy_pct).toBe(85)
    // temizlik: 64/84 tamamlandı
    expect(totals.cleaning_pct).toBe(76)
  })

  it('boş özet güvenli', () => {
    const empty = buildOverviewRows({})
    expect(empty.rows).toEqual([])
    expect(empty.totals.occupancy_pct).toBe(0)
    expect(buildOverviewRows(null).rows).toEqual([])
  })
})

describe('sortOverviewRows', () => {
  const { rows } = buildOverviewRows(summary)

  it('sayısal sütunda azalan/artan sıralar', () => {
    expect(sortOverviewRows(rows, 'open_faults', 'desc').map(r => r.block)[0]).toBe('M1')
    expect(sortOverviewRows(rows, 'empty_rooms', 'desc').map(r => r.block)[0]).toBe('A')
  })

  it('blok adına göre alfabetik sıralar', () => {
    expect(sortOverviewRows(rows, 'block', 'asc').map(r => r.block)).toEqual(['A', 'M1', 'M2', 'S1'])
  })

  it('null temizlik yüzdesi sıralamada en sona düşer', () => {
    const sorted = sortOverviewRows(rows, 'cleaning_pct', 'desc')
    expect(sorted.at(-1).block).toBe('A')
  })

  it('kaynağı bozmaz (yeni dizi döner)', () => {
    const before = rows.map(r => r.block)
    sortOverviewRows(rows, 'block', 'asc')
    expect(rows.map(r => r.block)).toEqual(before)
  })
})

describe('buildAttentionQueue', () => {
  const queue = buildAttentionQueue(summary)

  it('yalnız aksiyon gerektirenleri listeler', () => {
    expect(queue.every(item => item.block && item.kind && item.text)).toBe(true)
    // M2'nin arızası yok, temizliği %100, doluluk %78 → uyarı üretmemeli
    expect(queue.filter(i => i.block === 'M2' && i.kind !== 'maintenance')).toEqual([])
  })

  it('önem sırası: arıza > boş yatak yok > eksik temizlik > karantina/bakım', () => {
    expect(queue.map(i => i.kind).slice(0, 3)).toEqual(['fault', 'fault', 'full'])
    expect(queue[0].block).toBe('M1') // 3 arıza, S1'in 1 arızasından önce
  })

  it('boş yatağı kalmayan bloğu yakalar', () => {
    const full = queue.find(i => i.kind === 'full')
    expect(full.block).toBe('S1')
    expect(full.text).toMatch(/boş yatak yok/i)
  })

  it('tamamlanmamış temizliği kalan görev sayısıyla verir', () => {
    const cleaning = queue.find(i => i.kind === 'cleaning' && i.block === 'S1')
    expect(cleaning.text).toMatch(/12/)
  })

  it('karantina ve bakım ayrı satır', () => {
    expect(queue.find(i => i.kind === 'quarantine')?.block).toBe('M1')
    expect(queue.find(i => i.kind === 'maintenance')?.block).toBe('M2')
  })

  it('sorun yoksa boş liste', () => {
    const clean = buildAttentionQueue({
      X: { block: 'X', occupancy_pct: 50, empty_rooms: 5, open_faults: 0, cleaning_total: 4, cleaning_done: 4, cleaning_pct: 100, quarantine: 0, maintenance: 0 },
    })
    expect(clean).toEqual([])
    expect(buildAttentionQueue(null)).toEqual([])
  })
})
