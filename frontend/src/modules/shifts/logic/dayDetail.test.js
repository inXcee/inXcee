import { describe, it, expect } from 'vitest'
import {
  buildShiftMatrix,
  buildShiftOverview,
  dayDetailRows,
  dayDetailSummary,
  groupMatchesSearch,
  personStatusLabel,
} from './dayDetail.js'

const detail = {
  date: '2026-07-05',
  group_by: 'dept',
  totals: { working: 3, on_leave: 1, sick: 1, absent: 1, off: 1, groups: 2 },
  groups: [
    {
      name: 'Yemekhane',
      shifts: [
        { shift_def_id: 10, shift_name: 'Sabah', start_hour: '08:00', end_hour: '16:00', count: 2, people: [
          { staff_id: 1, full_name: 'Ali', role_name: 'Aşçı', work_location_name: 'Mutfak', site: 'Yemekhane' },
          { staff_id: 2, full_name: 'Veli', role_name: 'Garson', work_location_name: 'Mutfak', site: 'Yemekhane' },
        ] },
      ],
      on_leave: [{ staff_id: 4, full_name: 'Ayşe', leave_type: 'annual', leave_type_label: 'Yıllık izin' }],
      sick: [{ staff_id: 5, full_name: 'Mehmet' }],
      absent: [{ staff_id: 6, full_name: 'Hasan', reason: 'Haber vermedi' }],
      off: [{ staff_id: 7, full_name: 'Fatma' }],
      totals: { working: 2, on_leave: 1, sick: 1, absent: 1, off: 1 },
    },
    {
      name: 'Temizlik',
      shifts: [
        { shift_def_id: 10, shift_name: 'Sabah', start_hour: '08:00', end_hour: '16:00', count: 1, people: [
          { staff_id: 8, full_name: 'Emre', role_name: 'Temizlikçi', work_location_name: 'OTC-A', site: 'OTC' },
        ] },
      ],
      on_leave: [], sick: [], absent: [], off: [],
      totals: { working: 1, on_leave: 0, sick: 0, absent: 0, off: 0 },
    },
  ],
}

// Çok departmanlı gerçek senaryo: matris yalnız yemek tarafını değil hepsini kapsamalı.
const multiDept = {
  date: '2026-07-05',
  group_by: 'dept',
  totals: { working: 12, on_leave: 2, sick: 1, absent: 1, off: 1, groups: 4 },
  groups: [
    {
      name: 'Temizlik',
      shifts: [
        { shift_def_id: 1, shift_name: 'Gündüz', start_hour: '08:00', end_hour: '16:00', count: 4, people: [] },
        { shift_def_id: 2, shift_name: 'Akşam', start_hour: '16:00', end_hour: '24:00', count: 2, people: [] },
      ],
      on_leave: [{ staff_id: 90, full_name: 'T1', leave_type_label: 'Yıllık izin' }],
      sick: [], absent: [{ staff_id: 91, full_name: 'T2', reason: '' }], off: [],
      totals: { working: 6, on_leave: 1, sick: 0, absent: 1, off: 0 },
    },
    {
      name: 'Mutfak',
      shifts: [{ shift_def_id: 1, shift_name: 'Gündüz', start_hour: '08:00', end_hour: '16:00', count: 3, people: [] }],
      on_leave: [{ staff_id: 92, full_name: 'M1', leave_type_label: 'Acil izin' }],
      sick: [{ staff_id: 93, full_name: 'M2' }], absent: [], off: [{ staff_id: 94, full_name: 'M3' }],
      totals: { working: 3, on_leave: 1, sick: 1, absent: 0, off: 1 },
    },
    {
      name: 'Güvenlik',
      // Gece vardiyası yalnız bu bölümde var — sütun yine de tüm tabloda çıkmalı
      shifts: [{ shift_def_id: 3, shift_name: 'Gece', start_hour: '00:00', end_hour: '08:00', count: 2, people: [] }],
      on_leave: [], sick: [], absent: [], off: [],
      totals: { working: 2, on_leave: 0, sick: 0, absent: 0, off: 0 },
    },
    {
      name: 'Teknik',
      shifts: [{ shift_def_id: 2, shift_name: 'Akşam', start_hour: '16:00', end_hour: '24:00', count: 1, people: [] }],
      on_leave: [], sick: [], absent: [], off: [],
      totals: { working: 1, on_leave: 0, sick: 0, absent: 0, off: 0 },
    },
  ],
}

describe('buildShiftMatrix — vardiya × bölüm', () => {
  const matrix = buildShiftMatrix(multiDept)

  it('sütunlar tüm bölümlerin vardiyalarının birleşimi, saate göre sıralı', () => {
    expect(matrix.columns.map(c => c.shift_name)).toEqual(['Gece', 'Gündüz', 'Akşam'])
  })

  it('her bölüm kendi satırında, çalışan sayısına göre çoktan aza', () => {
    expect(matrix.rows.map(r => r.name)).toEqual(['Temizlik', 'Mutfak', 'Güvenlik', 'Teknik'])
  })

  it('hücreler doğru vardiyaya düşer, olmayan vardiya 0 kalır', () => {
    const temizlik = matrix.rows.find(r => r.name === 'Temizlik')
    expect(temizlik.cells).toEqual([0, 4, 2]) // Gece 0 · Gündüz 4 · Akşam 2
    const guvenlik = matrix.rows.find(r => r.name === 'Güvenlik')
    expect(guvenlik.cells).toEqual([2, 0, 0])
    const teknik = matrix.rows.find(r => r.name === 'Teknik')
    expect(teknik.cells).toEqual([0, 0, 1])
  })

  it('satırda izin/rapor/devamsız ve kadro toplamı taşınır', () => {
    const mutfak = matrix.rows.find(r => r.name === 'Mutfak')
    expect(mutfak).toMatchObject({ working: 3, on_leave: 1, sick: 1, absent: 0, off: 1 })
    expect(mutfak.total).toBe(6) // 3 + 1 + 1 + 0 + 1 = o gün kadroda görünen herkes
  })

  it('sütun toplamları ve genel toplam tutarlı', () => {
    expect(matrix.columnTotals).toEqual([2, 7, 3]) // Gece 2 · Gündüz 4+3 · Akşam 2+1
    expect(matrix.columnTotals.reduce((a, b) => a + b, 0)).toBe(matrix.totals.assignments)
    expect(matrix.totals).toMatchObject({ working: 12, on_leave: 2, sick: 1, absent: 1, off: 1 })
    // Satır çalışan toplamları da genel çalışanla eşleşmeli
    expect(matrix.rows.reduce((sum, r) => sum + r.working, 0)).toBe(matrix.totals.working)
  })

  it('boş detay güvenli', () => {
    const empty = buildShiftMatrix({ groups: [], totals: {} })
    expect(empty.columns).toEqual([])
    expect(empty.rows).toEqual([])
    expect(empty.columnTotals).toEqual([])
    expect(buildShiftMatrix(null).rows).toEqual([])
  })
})

describe('buildShiftOverview', () => {
  it('vardiya toplamını ve departman dağılımını üretir', () => {
    const overview = buildShiftOverview(multiDept)
    expect(overview.map(shift => [shift.shift_name, shift.count])).toEqual([
      ['Gece', 2],
      ['Gündüz', 7],
      ['Akşam', 3],
    ])
    expect(overview.find(shift => shift.shift_name === 'Gündüz').groups).toEqual([
      { key: 'Temizlik', name: 'Temizlik', count: 4 },
      { key: 'Mutfak', name: 'Mutfak', count: 3 },
    ])
  })

  it('aynı vardiya tanımının farklı saatlerini ayrı gösterir', () => {
    const overview = buildShiftOverview({
      groups: [{
        name: 'Teknik',
        shifts: [
          { shift_def_id: 1, shift_name: 'Gündüz', start_hour: '08:00', end_hour: '12:00', count: 1, people: [] },
          { shift_def_id: 1, shift_name: 'Gündüz', start_hour: '12:00', end_hour: '16:00', count: 2, people: [] },
        ],
        totals: { working: 2 },
      }],
      totals: { working: 2 },
    })
    expect(overview).toHaveLength(2)
    expect(overview.map(shift => shift.count)).toEqual([1, 2])
  })
})

describe('dayDetailSummary', () => {
  it('toplu özet rozetlerini üretir', () => {
    expect(dayDetailSummary(detail)).toEqual([
      { key: 'roster', label: 'Gün kadrosu', value: 7 },
      { key: 'working', label: 'Çalışan', value: 3 },
      { key: 'on_leave', label: 'İzinli', value: 1 },
      { key: 'sick', label: 'Raporlu', value: 1 },
      { key: 'absent', label: 'Devamsız', value: 1 },
      { key: 'off', label: 'İzin günü', value: 1 },
    ])
  })
})

describe('groupMatchesSearch', () => {
  const group = detail.groups[0]

  it('departman, kişi, rol, konum ve durum detayında Türkçe arar', () => {
    expect(groupMatchesSearch(group, 'yemekhane')).toBe(true)
    expect(groupMatchesSearch(group, 'aşçı')).toBe(true)
    expect(groupMatchesSearch(group, 'mutfak')).toBe(true)
    expect(groupMatchesSearch(group, 'yıllık')).toBe(true)
    expect(groupMatchesSearch(group, 'haber')).toBe(true)
    expect(groupMatchesSearch(group, 'teknik')).toBe(false)
  })
})

describe('personStatusLabel', () => {
  it('durum + detayı okunur verir', () => {
    expect(personStatusLabel({ kind: 'working', shift_name: 'Sabah' })).toBe('Çalışıyor · Sabah')
    expect(personStatusLabel({ kind: 'on_leave', leave_type_label: 'Yıllık izin' })).toBe('İzinli · Yıllık izin')
    expect(personStatusLabel({ kind: 'sick' })).toBe('Raporlu')
    expect(personStatusLabel({ kind: 'absent', reason: 'Haber vermedi' })).toBe('Devamsız · Haber vermedi')
    expect(personStatusLabel({ kind: 'absent' })).toBe('Devamsız')
    expect(personStatusLabel({ kind: 'off' })).toBe('İzin günü')
  })
})

describe('dayDetailRows (Excel/print düz satırlar)', () => {
  const rows = dayDetailRows(detail)

  it('başlık + bölüm/vardiya/kişi/rol/nokta/durum satırları', () => {
    expect(rows.headers).toEqual(['BÖLÜM', 'VARDİYA', 'KİŞİ', 'ROL', 'NOKTA', 'DURUM'])
    // Çalışanlar önce, sonra izin/rapor/devamsız/off — bölüm sırası korunur
    expect(rows.rows[0]).toEqual(['Yemekhane', 'Sabah', 'Ali', 'Aşçı', 'Mutfak', 'Çalışıyor · Sabah'])
    expect(rows.rows[1]).toEqual(['Yemekhane', 'Sabah', 'Veli', 'Garson', 'Mutfak', 'Çalışıyor · Sabah'])
    expect(rows.rows[2]).toEqual(['Yemekhane', '', 'Ayşe', '', '', 'İzinli · Yıllık izin'])
    expect(rows.rows[3]).toEqual(['Yemekhane', '', 'Mehmet', '', '', 'Raporlu'])
    expect(rows.rows[4]).toEqual(['Yemekhane', '', 'Hasan', '', '', 'Devamsız · Haber vermedi'])
    expect(rows.rows[5]).toEqual(['Yemekhane', '', 'Fatma', '', '', 'İzin günü'])
    expect(rows.rows[6]).toEqual(['Temizlik', 'Sabah', 'Emre', 'Temizlikçi', 'OTC-A', 'Çalışıyor · Sabah'])
  })

  it('satır sayısı toplam kişi sayısına eşit', () => {
    const totalPeople = detail.totals.working + detail.totals.on_leave + detail.totals.sick + detail.totals.absent + detail.totals.off
    expect(rows.rows).toHaveLength(totalPeople)
  })

  it('boş detay güvenli', () => {
    const empty = dayDetailRows({ groups: [], totals: {} })
    expect(empty.rows).toEqual([])
    expect(dayDetailSummary({ totals: {} })[0]).toEqual({ key: 'roster', label: 'Gün kadrosu', value: 0 })
  })
})
