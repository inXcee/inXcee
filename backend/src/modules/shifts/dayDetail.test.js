import { describe, it, expect } from 'vitest'
import { buildDayDetail } from './dayDetail.js'

// getDayDetailRows'un döndürdüğü düz satır şekli.
const rows = [
  // YEMEKHANE — çalışanlar
  { staff_id: 1, full_name: 'Ali', dept_name: 'Yemekhane', role_name: 'Aşçı', shift_def_id: 10, shift_name: 'Sabah', start_hour: '08:00', end_hour: '16:00', work_location_name: 'Yemekhane-Mutfak', site: 'Yemekhane', status: 'worked', leave_type: null, absent_reason: null },
  { staff_id: 2, full_name: 'Veli', dept_name: 'Yemekhane', role_name: 'Garson', shift_def_id: 10, shift_name: 'Sabah', start_hour: '08:00', end_hour: '16:00', work_location_name: 'Yemekhane-Mutfak', site: 'Yemekhane', status: 'scheduled', leave_type: null, absent_reason: null },
  { staff_id: 3, full_name: 'Zeynep', dept_name: 'Yemekhane', role_name: 'Garson', shift_def_id: 11, shift_name: 'Akşam', start_hour: '16:00', end_hour: '24:00', work_location_name: 'Yemekhane-Mutfak', site: 'Yemekhane', status: 'overtime', leave_type: null, absent_reason: null },
  // YEMEKHANE — izin/rapor/devamsız/off
  { staff_id: 4, full_name: 'Ayşe', dept_name: 'Yemekhane', role_name: 'Garson', shift_def_id: null, shift_name: null, start_hour: null, end_hour: null, work_location_name: null, site: null, status: 'on_leave', leave_type: 'annual', absent_reason: null },
  { staff_id: 5, full_name: 'Mehmet', dept_name: 'Yemekhane', role_name: 'Aşçı', shift_def_id: null, shift_name: null, start_hour: null, end_hour: null, work_location_name: null, site: null, status: 'on_leave', leave_type: 'sick', absent_reason: null },
  { staff_id: 6, full_name: 'Hasan', dept_name: 'Yemekhane', role_name: 'Garson', shift_def_id: null, shift_name: null, start_hour: null, end_hour: null, work_location_name: null, site: null, status: 'absent', leave_type: null, absent_reason: 'Haber vermedi' },
  { staff_id: 7, full_name: 'Fatma', dept_name: 'Yemekhane', role_name: 'Garson', shift_def_id: null, shift_name: null, start_hour: null, end_hour: null, work_location_name: null, site: null, status: 'off', leave_type: null, absent_reason: null },
  // TEMİZLİK — 1 çalışan
  { staff_id: 8, full_name: 'Emre', dept_name: 'Temizlik', role_name: 'Temizlikçi', shift_def_id: 10, shift_name: 'Sabah', start_hour: '08:00', end_hour: '16:00', work_location_name: 'OTC-A', site: 'OTC', status: 'worked', leave_type: null, absent_reason: null },
]

describe('buildDayDetail — departman gruplama', () => {
  const result = buildDayDetail(rows, { groupBy: 'dept' })

  it('gruplar çalışan sayısına göre çoktan aza sıralanır', () => {
    expect(result.group_by).toBe('dept')
    expect(result.groups.map(g => g.name)).toEqual(['Yemekhane', 'Temizlik'])
  })

  it('genel toplamlar doğru kovalanır', () => {
    expect(result.totals).toMatchObject({ working: 4, on_leave: 1, sick: 1, absent: 1, off: 1, groups: 2 })
  })

  it('vardiyalar başlangıç saatine göre, kişiler adla sıralı', () => {
    const yem = result.groups[0]
    expect(yem.shifts.map(s => s.shift_name)).toEqual(['Sabah', 'Akşam'])
    expect(yem.shifts[0].count).toBe(2)
    expect(yem.shifts[0].people.map(p => p.full_name)).toEqual(['Ali', 'Veli'])
    expect(yem.shifts[1].people.map(p => p.full_name)).toEqual(['Zeynep'])
  })

  it('izin/rapor/devamsız/off ayrı kovalarda, vardiyaya sızmaz', () => {
    const yem = result.groups[0]
    expect(yem.totals).toMatchObject({ working: 3, on_leave: 1, sick: 1, absent: 1, off: 1 })
    expect(yem.on_leave[0]).toMatchObject({ full_name: 'Ayşe', leave_type: 'annual', leave_type_label: 'Yıllık izin' })
    expect(yem.sick.map(p => p.full_name)).toEqual(['Mehmet'])
    expect(yem.absent[0]).toMatchObject({ full_name: 'Hasan', reason: 'Haber vermedi' })
    expect(yem.off.map(p => p.full_name)).toEqual(['Fatma'])
    // Çalışan hücrelerine izinli/raporlu karışmadı
    expect(yem.shifts.flatMap(s => s.people).map(p => p.full_name)).not.toContain('Ayşe')
  })

  it('grup çalışan toplamı vardiya sayılarının toplamına eşit', () => {
    result.groups.forEach(group => {
      expect(group.totals.working).toBe(group.shifts.reduce((sum, s) => sum + s.count, 0))
    })
  })
})

describe('buildDayDetail — site gruplama', () => {
  it('çalışanlar site’ye, work_location’ı olmayan izinliler "Bölüm dışı / izinli" grubuna gider', () => {
    const result = buildDayDetail(rows, { groupBy: 'site' })
    const names = result.groups.map(g => g.name)
    expect(names).toContain('Yemekhane') // Ali/Veli/Zeynep site=Yemekhane
    expect(names).toContain('OTC')       // Emre
    expect(names).toContain('Bölüm dışı / izinli') // work_location'sız izin/rapor/off
    const outside = result.groups.find(g => g.name === 'Bölüm dışı / izinli')
    expect(outside.totals).toMatchObject({ working: 0, on_leave: 1, sick: 1, absent: 1, off: 1 })
    expect(outside.shifts).toEqual([])
  })
})

describe('buildDayDetail — kenar durumlar', () => {
  it('boş giriş güvenli sonuç verir', () => {
    const result = buildDayDetail([], { groupBy: 'dept' })
    expect(result.groups).toEqual([])
    expect(result.totals).toMatchObject({ working: 0, on_leave: 0, sick: 0, absent: 0, off: 0, groups: 0 })
  })

  it('geçersiz group_by dept’e düşer, departmansız/vardiyasız etiketlenir', () => {
    const result = buildDayDetail([
      { staff_id: 9, full_name: 'Kim', dept_name: null, role_name: '', shift_def_id: null, shift_name: null, start_hour: null, end_hour: null, work_location_name: null, site: null, status: 'worked', leave_type: null, absent_reason: null },
    ], { groupBy: 'saçma' })
    expect(result.group_by).toBe('dept')
    expect(result.groups[0].name).toBe('Departmansız')
    expect(result.groups[0].shifts[0].shift_name).toBe('Vardiya atanmamış')
  })

  it('bilinmeyen izin türü generic "İzinli" etiketi alır', () => {
    const result = buildDayDetail([
      { staff_id: 10, full_name: 'Nur', dept_name: 'Teknik', role_name: '', shift_def_id: null, shift_name: null, start_hour: null, end_hour: null, work_location_name: null, site: null, status: 'on_leave', leave_type: 'owed', absent_reason: null },
    ], { groupBy: 'dept' })
    expect(result.groups[0].on_leave[0].leave_type_label).toBe('Alacak izin')
  })
})
