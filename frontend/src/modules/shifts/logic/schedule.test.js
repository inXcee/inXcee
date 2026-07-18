import { describe, it, expect } from 'vitest'
import {
  buildStaffGrid,
  computeWeekStats,
  parseShiftCell,
  parseQuickScheduleCode,
  cellToScheduleCode,
  buildScheduleWarnings,
  buildStaffRecentSummary,
  buildPayrollClosingCheck,
  daysInMonth,
  parseScheduleSheet,
  planCellPaste,
} from './schedule.js'

const SHIFT_DEFS = [
  { id: 10, name: 'Gündüz', color_class: 'bg-blue-400' },
  { id: 20, name: 'Akşam', color_class: 'bg-orange-400' },
  { id: 30, name: 'Gece', color_class: 'bg-indigo-600' },
]
const WEEK = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']

describe('buildStaffGrid', () => {
  it('schedule satırlarını staff_id başına gün haritasına indeksler', () => {
    const rows = [
      { staff_id: 1, full_name: 'Ali', dept_name: 'A', work_date: '2026-06-01', status: 'scheduled' },
      { staff_id: 1, full_name: 'Ali', dept_name: 'A', work_date: '2026-06-02', status: 'on_leave' },
    ]
    const grid = buildStaffGrid(rows, [], '')
    expect(grid).toHaveLength(1)
    expect(grid[0].days['2026-06-01'].status).toBe('scheduled')
    expect(grid[0].days['2026-06-02'].status).toBe('on_leave')
  })

  it('çizelgede olmayan aktif personeli boş gün haritasıyla ekler', () => {
    const rows = [{ staff_id: 1, full_name: 'Ali', dept_name: 'A', work_date: '2026-06-01', status: 'scheduled' }]
    const allStaff = [
      { id: 1, full_name: 'Ali', department_id: 5, dept_name: 'A' },
      { id: 2, full_name: 'Veli', department_id: 5, dept_name: 'A' },
    ]
    const grid = buildStaffGrid(rows, allStaff, '')
    expect(grid.map(p => p.id).sort()).toEqual([1, 2])
    expect(grid.find(p => p.id === 2).days).toEqual({})
  })

  it('deptFilter verilince farklı departmandaki personeli eklemez', () => {
    const allStaff = [
      { id: 1, full_name: 'Ali', department_id: 5, dept_name: 'A' },
      { id: 2, full_name: 'Veli', department_id: 9, dept_name: 'B' },
    ]
    const grid = buildStaffGrid([], allStaff, '5')
    expect(grid.map(p => p.id)).toEqual([1])
  })

  it('departman sonra ada göre Türkçe sıralar', () => {
    const allStaff = [
      { id: 1, full_name: 'Zeki', department_id: 1, dept_name: 'B' },
      { id: 2, full_name: 'Ahmet', department_id: 1, dept_name: 'A' },
      { id: 3, full_name: 'Çınar', department_id: 1, dept_name: 'A' },
    ]
    const grid = buildStaffGrid([], allStaff, '')
    expect(grid.map(p => p.full_name)).toEqual(['Ahmet', 'Çınar', 'Zeki'])
  })
})

describe('computeWeekStats', () => {
  it('günlük çalışan/izinli/boş sayar ve toplar', () => {
    const grid = [
      { id: 1, days: { '2026-06-01': { status: 'scheduled' }, '2026-06-02': { status: 'on_leave' } } },
      { id: 2, days: { '2026-06-01': { status: 'worked' } } },
    ]
    const stats = computeWeekStats(grid, WEEK)
    expect(stats.total).toBe(2)
    expect(stats.perDay[0].working).toHaveLength(2) // 06-01: ikisi de çalışıyor
    expect(stats.perDay[1].leave).toHaveLength(1)   // 06-02: 1 izinli
    expect(stats.perDay[1].empty).toHaveLength(1)   // 06-02: 1 boş (id 2)
    expect(stats.working).toBe(2)
    expect(stats.onLeave).toBe(1)
  })
})

describe('parseShiftCell', () => {
  it('boş/tire değerleri null döner', () => {
    expect(parseShiftCell('', SHIFT_DEFS)).toBeNull()
    expect(parseShiftCell('-', SHIFT_DEFS)).toBeNull()
    expect(parseShiftCell(null, SHIFT_DEFS)).toBeNull()
  })

  it('izin kodlarını on_leave döner', () => {
    expect(parseShiftCell('izin', SHIFT_DEFS)).toEqual({ shiftDefId: null, status: 'on_leave' })
    expect(parseShiftCell('i', SHIFT_DEFS)).toEqual({ shiftDefId: null, status: 'on_leave' })
  })

  it('off kodunu haftalık izin döner', () => {
    expect(parseShiftCell('off', SHIFT_DEFS)).toEqual({ shiftDefId: null, status: 'off' })
  })

  it('1/G → 1.vardiya, 2/A → 2.vardiya, 3/Ge → 3.vardiya', () => {
    expect(parseShiftCell('1', SHIFT_DEFS)).toEqual({ shiftDefId: 10, status: 'scheduled' })
    expect(parseShiftCell('G', SHIFT_DEFS)).toEqual({ shiftDefId: 10, status: 'scheduled' })
    expect(parseShiftCell('A', SHIFT_DEFS)).toEqual({ shiftDefId: 20, status: 'scheduled' })
    expect(parseShiftCell('Ge', SHIFT_DEFS)).toEqual({ shiftDefId: 30, status: 'scheduled' })
  })

  it('sayısal indeks N → N.vardiya', () => {
    expect(parseShiftCell('2', SHIFT_DEFS)).toEqual({ shiftDefId: 20, status: 'scheduled' })
    expect(parseShiftCell('3', SHIFT_DEFS)).toEqual({ shiftDefId: 30, status: 'scheduled' })
  })

  it('aralık dışı sayı null döner', () => {
    expect(parseShiftCell('9', SHIFT_DEFS)).toBeNull()
  })
})

describe('parseQuickScheduleCode', () => {
  it('hizli vardiya kodlarini assign aksiyonuna cevirir', () => {
    expect(parseQuickScheduleCode('1', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: 10, status: 'scheduled' })
    expect(parseQuickScheduleCode('G', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: 10, status: 'scheduled' })
    expect(parseQuickScheduleCode('off', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: null, status: 'off' })
    expect(parseQuickScheduleCode('yok', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: null, status: 'absent' })
  })

  it('silme ve gecersiz kodlari ayirir', () => {
    expect(parseQuickScheduleCode('sil', SHIFT_DEFS)).toEqual({ action: 'delete' })
    expect(parseQuickScheduleCode('', SHIFT_DEFS)).toEqual({ action: 'noop' })
    expect(parseQuickScheduleCode('bilinmez', SHIFT_DEFS).action).toBe('invalid')
  })

  it('genel izin kodlari tur belirtmeden on_leave verir', () => {
    expect(parseQuickScheduleCode('i', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: null, status: 'on_leave', leaveType: null })
    expect(parseQuickScheduleCode('izin', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: null, status: 'on_leave', leaveType: null })
  })

  it('ozel izin turu kodlarini leaveType ile dondurur', () => {
    expect(parseQuickScheduleCode('YIL', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: null, status: 'on_leave', leaveType: 'annual' })
    expect(parseQuickScheduleCode('yillik', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: null, status: 'on_leave', leaveType: 'annual' })
    expect(parseQuickScheduleCode('ucr', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: null, status: 'on_leave', leaveType: 'unpaid' })
    expect(parseQuickScheduleCode('RAP', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: null, status: 'on_leave', leaveType: 'sick' })
    expect(parseQuickScheduleCode('rapor', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: null, status: 'on_leave', leaveType: 'sick' })
    expect(parseQuickScheduleCode('acil', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: null, status: 'on_leave', leaveType: 'emergency' })
    expect(parseQuickScheduleCode('dogum', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: null, status: 'on_leave', leaveType: 'maternity' })
    expect(parseQuickScheduleCode('alacak', SHIFT_DEFS)).toEqual({ action: 'assign', shiftDefId: null, status: 'on_leave', leaveType: 'owed' })
  })
})

describe('cellToScheduleCode', () => {
  it('hucreleri kopyalanabilir kisa koda cevirir', () => {
    expect(cellToScheduleCode({ status: 'scheduled', shift_def_id: 20 }, SHIFT_DEFS)).toBe('2')
    expect(cellToScheduleCode({ status: 'off' }, SHIFT_DEFS)).toBe('OFF')
    expect(cellToScheduleCode({ status: 'on_leave' }, SHIFT_DEFS)).toBe('I')
    expect(cellToScheduleCode({ status: 'absent' }, SHIFT_DEFS)).toBe('YOK')
  })

  it('izin turunu ozel kisa koda cevirir (kopyala/yapistir icin)', () => {
    expect(cellToScheduleCode({ status: 'on_leave', leave_type: 'annual' }, SHIFT_DEFS)).toBe('YIL')
    expect(cellToScheduleCode({ status: 'on_leave', leave_type: 'unpaid' }, SHIFT_DEFS)).toBe('UCR')
    expect(cellToScheduleCode({ status: 'on_leave', leave_type: 'sick' }, SHIFT_DEFS)).toBe('RAP')
    expect(cellToScheduleCode({ status: 'on_leave', leave_type: 'owed' }, SHIFT_DEFS)).toBe('ALACAK')
    // Tur eslesmezse generic I'ye duser
    expect(cellToScheduleCode({ status: 'on_leave', leave_type: 'other' }, SHIFT_DEFS)).toBe('I')
  })
})

describe('izin kodu round-trip', () => {
  it('cellToScheduleCode -> parseQuickScheduleCode ayni izin turunu korur', () => {
    for (const type of ['annual', 'unpaid', 'sick', 'emergency', 'maternity', 'paternity', 'marriage', 'bereavement', 'owed']) {
      const code = cellToScheduleCode({ status: 'on_leave', leave_type: type }, SHIFT_DEFS)
      const parsed = parseQuickScheduleCode(code, SHIFT_DEFS)
      expect(parsed).toEqual({ action: 'assign', shiftDefId: null, status: 'on_leave', leaveType: type })
    }
  })
})

describe('buildScheduleWarnings', () => {
  it('eksik kapsama, haftalik izin yok ve dinlenme uyarilarini uretir', () => {
    const grid = [
      {
        id: 1,
        full_name: 'Ali',
        dept_name: 'Güvenlik',
        days: {
          '2026-06-01': { status: 'scheduled', start_hour: '20:00', end_hour: '08:00' },
          '2026-06-02': { status: 'scheduled', start_hour: '08:00', end_hour: '17:00' },
          '2026-06-03': { status: 'scheduled', start_hour: '08:00', end_hour: '17:00' },
          '2026-06-04': { status: 'scheduled', start_hour: '08:00', end_hour: '17:00' },
          '2026-06-05': { status: 'scheduled', start_hour: '08:00', end_hour: '17:00' },
          '2026-06-06': { status: 'scheduled', start_hour: '08:00', end_hour: '17:00' },
          '2026-06-07': { status: 'scheduled', start_hour: '08:00', end_hour: '17:00' },
        },
      },
    ]
    const warnings = buildScheduleWarnings(grid, WEEK, { coverageMin: 2 })
    expect(warnings.some(w => w.type === 'coverage')).toBe(true)
    expect(warnings.some(w => w.type === 'weekly_off')).toBe(true)
    expect(warnings.some(w => w.type === 'rest')).toBe(true)
  })
})

describe('buildStaffRecentSummary', () => {
  it('son donem vardiya, izin, mesai ve ardisik calismayi ozetler', () => {
    const summary = buildStaffRecentSummary([
      { work_date: '2026-06-27', status: 'scheduled' },
      { work_date: '2026-06-28', status: 'worked' },
      { work_date: '2026-06-29', status: 'off' },
      { work_date: '2026-06-30', status: 'on_leave' },
      { work_date: '2026-07-01', status: 'absent' },
      { work_date: '2026-07-02', status: 'scheduled' },
      { work_date: '2026-07-03', status: 'scheduled' },
    ], [
      { work_date: '2026-07-02', hours: 2 },
      { work_date: '2026-07-03', hours: 1.5 },
    ], { referenceDate: '2026-07-03', days: 7 })

    expect(summary.workDays).toBe(4)
    expect(summary.offDays).toBe(1)
    expect(summary.leaveDays).toBe(1)
    expect(summary.absentDays).toBe(1)
    expect(summary.overtimeHours).toBe(3.5)
    expect(summary.maxConsecutive).toBe(2)
    expect(summary.currentConsecutive).toBe(2)
  })
})

describe('buildPayrollClosingCheck', () => {
  it('ay gunlerini ve kapanis risklerini hesaplar', () => {
    expect(daysInMonth('2026-02')).toHaveLength(28)
    const days = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07']
    const grid = [
      {
        id: 1,
        full_name: 'Ali',
        dept_name: 'A',
        days: {
          '2026-07-01': { status: 'scheduled' },
          '2026-07-02': { status: 'scheduled' },
          '2026-07-03': { status: 'scheduled' },
          '2026-07-04': { status: 'scheduled' },
          '2026-07-05': { status: 'scheduled' },
          '2026-07-06': { status: 'scheduled' },
          '2026-07-07': { status: 'absent' },
        },
      },
      {
        id: 2,
        full_name: 'Veli',
        dept_name: 'A',
        days: {
          '2026-07-01': { status: 'off' },
          '2026-07-02': { status: 'scheduled' },
        },
      },
    ]
    const check = buildPayrollClosingCheck(grid, days, {
      coverageMin: 2,
      overtimeRecords: [{ staff_id: 1, work_date: '2026-07-02', hours: 2 }],
      pendingLeaves: [{ staff_id: 2, status: 'pending', start_date: '2026-07-04', end_date: '2026-07-05' }],
    })

    expect(check.ok).toBe(false)
    expect(check.totals.empty).toBe(5)
    expect(check.totals.offMissing).toBe(1)
    expect(check.totals.absent).toBe(1)
    expect(check.totals.pendingLeave).toBe(1)
    expect(check.totals.overtimeHours).toBe(2)
    expect(check.issues.map(i => i.type)).toEqual(expect.arrayContaining(['empty', 'coverage', 'pending_leave', 'off_missing', 'absent', 'overtime']))
  })
})

describe('planCellPaste', () => {
  const rowOrderIds = [10, 11, 12]
  const weekDays = WEEK

  it('tek değer + çok hücre seçimi → broadcast (hepsine yayar)', () => {
    const targets = [
      { staffId: 10, date: WEEK[0] },
      { staffId: 11, date: WEEK[0] },
      { staffId: 12, date: WEEK[1] },
    ]
    const res = planCellPaste({ text: '1', targets, rowOrderIds, weekDays, shiftDefs: SHIFT_DEFS })
    expect(res.mode).toBe('broadcast')
    expect(res.assignments).toHaveLength(3)
    expect(res.assignments.every(a => a.shiftDefId === 10 && a.status === 'scheduled')).toBe(true)
    expect(res.deletions).toHaveLength(0)
  })

  it('broadcast izin türünü taşır', () => {
    const targets = [{ staffId: 10, date: WEEK[0] }, { staffId: 11, date: WEEK[0] }]
    const res = planCellPaste({ text: 'YIL', targets, rowOrderIds, weekDays, shiftDefs: SHIFT_DEFS })
    expect(res.mode).toBe('broadcast')
    expect(res.assignments).toEqual([
      { staffId: 10, date: WEEK[0], shiftDefId: null, status: 'on_leave', leaveType: 'annual' },
      { staffId: 11, date: WEEK[0], shiftDefId: null, status: 'on_leave', leaveType: 'annual' },
    ])
  })

  it('broadcast sil → tüm seçili hücreler silinir', () => {
    const targets = [{ staffId: 10, date: WEEK[0] }, { staffId: 11, date: WEEK[1] }]
    const res = planCellPaste({ text: 'sil', targets, rowOrderIds, weekDays, shiftDefs: SHIFT_DEFS })
    expect(res.mode).toBe('broadcast')
    expect(res.assignments).toHaveLength(0)
    expect(res.deletions).toEqual([{ staffId: 10, date: WEEK[0] }, { staffId: 11, date: WEEK[1] }])
  })

  it('çok hücreli pano → anchor\'dan pozisyonel yapıştırır', () => {
    const targets = [{ staffId: 10, date: WEEK[0] }]
    const res = planCellPaste({ text: '1\t2\nI\tOFF', targets, rowOrderIds, weekDays, shiftDefs: SHIFT_DEFS })
    expect(res.mode).toBe('positional')
    expect(res.assignments).toEqual([
      { staffId: 10, date: WEEK[0], shiftDefId: 10, status: 'scheduled', leaveType: null },
      { staffId: 10, date: WEEK[1], shiftDefId: 20, status: 'scheduled', leaveType: null },
      { staffId: 11, date: WEEK[0], shiftDefId: null, status: 'on_leave', leaveType: null },
      { staffId: 11, date: WEEK[1], shiftDefId: null, status: 'off', leaveType: null },
    ])
  })

  it('tek değer + tek hücre → pozisyonel (broadcast değil)', () => {
    const targets = [{ staffId: 12, date: WEEK[2] }]
    const res = planCellPaste({ text: '2', targets, rowOrderIds, weekDays, shiftDefs: SHIFT_DEFS })
    expect(res.mode).toBe('positional')
    expect(res.assignments).toEqual([{ staffId: 12, date: WEEK[2], shiftDefId: 20, status: 'scheduled', leaveType: null }])
  })

  it('grid taşması ızgara dışına yazmaz', () => {
    const targets = [{ staffId: 12, date: WEEK[6] }] // son satır, son gün
    const res = planCellPaste({ text: '1\t2\n1\t2', targets, rowOrderIds, weekDays, shiftDefs: SHIFT_DEFS })
    // sadece anchor hücresi ızgara içinde
    expect(res.assignments).toEqual([{ staffId: 12, date: WEEK[6], shiftDefId: 10, status: 'scheduled', leaveType: null }])
  })

  it('boş metin → hiçbir şey', () => {
    const res = planCellPaste({ text: '', targets: [{ staffId: 10, date: WEEK[0] }], rowOrderIds, weekDays, shiftDefs: SHIFT_DEFS })
    expect(res).toEqual({ assignments: [], deletions: [], mode: 'none' })
  })
})

describe('parseScheduleSheet', () => {
  const ctx = { allStaff: [{ id: 1, full_name: 'Ali Veli', department_id: 5 }], shiftDefs: SHIFT_DEFS, weekDays: WEEK }

  it('boş sayfa hatası döner', () => {
    expect(parseScheduleSheet([], ctx)).toEqual({ error: 'Bos dosya' })
  })

  it('başlık satırı yoksa hata döner', () => {
    expect(parseScheduleSheet([['x'], ['y']], ctx)).toEqual({ error: 'Baslik satiri bulunamadi' })
  })

  it('isimli gün başlıklarıyla eşleşen personel için entries üretir', () => {
    const rows = [
      ['Ad', 'Pzt', 'Sal', 'Çar'],
      ['Ali Veli', '1', 'izin', '2'],
    ]
    const res = parseScheduleSheet(rows, ctx)
    expect(res.matched).toHaveLength(1)
    expect(res.unmatched).toHaveLength(0)
    expect(res.entries).toEqual([
      { staff_id: 1, dept_id: 5, work_date: '2026-06-01', shift_def_id: 10, status: 'scheduled' },
      { staff_id: 1, dept_id: 5, work_date: '2026-06-02', shift_def_id: null, status: 'on_leave' },
      { staff_id: 1, dept_id: 5, work_date: '2026-06-03', shift_def_id: 20, status: 'scheduled' },
    ])
  })

  it('eşleşmeyen ismi unmatched listesine koyar, entry üretmez', () => {
    const rows = [
      ['Ad', 'Pzt', 'Sal'],
      ['Bilinmeyen Kişi', '1', '-'],
    ]
    const res = parseScheduleSheet(rows, ctx)
    expect(res.matched).toHaveLength(0)
    expect(res.unmatched).toEqual([{ name: 'Bilinmeyen Kişi', dayEntries: [{ dayIdx: 0, date: '2026-06-01', shiftDefId: 10, status: 'scheduled' }] }])
    expect(res.entries).toHaveLength(0)
  })

  it('isimli gün sütunu yoksa isim sonrası sütunları sırayla eşler', () => {
    const rows = [
      ['Ad', 'K1', 'K2', 'K3'],
      ['Ali Veli', '1', '2', '3'],
    ]
    const res = parseScheduleSheet(rows, ctx)
    expect(res.entries.map(e => e.work_date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })
})
