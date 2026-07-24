import { describe, it, expect } from 'vitest'
import { dayDetailRows, dayDetailSummary, personStatusLabel } from './dayDetail.js'

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

describe('dayDetailSummary', () => {
  it('toplu özet rozetlerini üretir', () => {
    expect(dayDetailSummary(detail)).toEqual([
      { key: 'working', label: 'Çalışan', value: 3 },
      { key: 'on_leave', label: 'İzinli', value: 1 },
      { key: 'sick', label: 'Raporlu', value: 1 },
      { key: 'absent', label: 'Devamsız', value: 1 },
      { key: 'off', label: 'İzin günü', value: 1 },
    ])
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
    expect(dayDetailSummary({ totals: {} })[0]).toEqual({ key: 'working', label: 'Çalışan', value: 0 })
  })
})
