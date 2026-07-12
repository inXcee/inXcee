import { describe, expect, it } from 'vitest'
import {
  buildScheduleShareHtml,
  buildScheduleShareModel,
  scheduleShareFilename,
} from './scheduleShareExport.js'

const WEEK = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12']
const SHIFT_DEFS = [
  { id: 1, name: 'Gunduz', start_hour: 8, end_hour: 16, color_class: 'bg-blue-400' },
  { id: 2, name: 'Gece', start_hour: 20, end_hour: 8, color_class: 'bg-indigo-600' },
]

function shift(extra = {}) {
  return {
    status: 'scheduled',
    shift_def_id: 1,
    shift_name: 'Gunduz',
    start_hour: 8,
    end_hour: 16,
    shift_color: 'bg-blue-400',
    work_location_name: 'OTC Yemekhane',
    ...extra,
  }
}

const STAFF = [
  {
    id: 10,
    full_name: 'Ali Yilmaz',
    dept_name: 'Teknik',
    dept_color: 'bg-blue-500',
    role_name: 'Ikramci',
    position: 'OTC',
    days: {
      [WEEK[0]]: shift(),
      [WEEK[1]]: { status: 'off' },
      [WEEK[2]]: { status: 'absent', absent_reason: 'Gelmedi' },
    },
  },
  {
    id: 11,
    full_name: 'Ayse Kaya',
    dept_name: 'Lokal',
    dept_color: 'bg-emerald-500',
    role_name: 'Meydanci',
    position: 'FPU Lokal',
    days: {
      [WEEK[0]]: shift({ shift_def_id: 2, shift_name: 'Gece', shift_color: 'bg-indigo-600' }),
      [WEEK[1]]: { status: 'on_leave', leave_type: 'annual' },
    },
  },
]

function payload(overrides = {}) {
  return {
    weekStart: WEEK[0],
    weekEnd: WEEK[6],
    weekDays: WEEK,
    staffGrid: STAFF,
    visibleGrid: STAFF,
    shiftDefs: SHIFT_DEFS,
    options: { title: 'Personel Vardiya Paylasimi' },
    ...overrides,
  }
}

describe('scheduleShareExport', () => {
  it('builds grouped share model and weekly totals', () => {
    const model = buildScheduleShareModel(payload())

    expect(model.groups.map(g => g.name)).toEqual(['Teknik', 'Lokal'])
    expect(model.totals.people).toBe(2)
    expect(model.totals.work).toBe(2)
    expect(model.totals.rest).toBe(2)
    expect(model.totals.absent).toBe(1)
  })

  it('renders colored printable html with personnel, locations and legend', () => {
    const html = buildScheduleShareHtml(payload())

    expect(html).toContain('Personel Vardiya Paylasimi')
    expect(html).toContain('Ali Yilmaz')
    expect(html).toContain('OTC Yemekhane')
    expect(html).toContain('Gunduz')
    expect(html).toContain('#60A5FA')
    expect(html).toContain('PDF icin tarayici yazdir')
  })

  it('can export only the visible filtered list and hide location details', () => {
    const html = buildScheduleShareHtml(payload({
      visibleGrid: [STAFF[1]],
      options: { title: 'Filtreli Cikti', onlyVisible: true, includeLocation: false, includeRole: false },
    }))

    expect(html).toContain('Ayse Kaya')
    expect(html).not.toContain('Ali Yilmaz')
    expect(html).not.toContain('OTC Yemekhane')
  })

  it('creates stable filenames for downloaded images', () => {
    expect(scheduleShareFilename('2026-07-06', 'png')).toBe('vardiya-cizelgesi-2026-07-06.png')
  })
})
