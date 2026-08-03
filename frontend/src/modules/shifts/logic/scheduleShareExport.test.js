import { describe, expect, it } from 'vitest'
import {
  buildScheduleShareHtml,
  buildScheduleShareModel,
  computeScheduleCanvasLayout,
  scheduleCoverageDigest,
  scheduleShareFilename,
} from './scheduleShareExport.js'

describe('scheduleCoverageDigest', () => {
  const week = ['2026-07-06', '2026-07-07']
  const groups = [{
    name: 'Yemek', people: [
      { role_name: 'Ikramci', days: { '2026-07-06': { status: 'worked', work_location_name: 'İşçi Lokali' }, '2026-07-07': { status: 'worked' } } },
      { role_name: 'Bulasikhane', days: { '2026-07-06': { status: 'worked' } } },
    ],
  }]

  it('buckets unassigned cells into a neutral area and separates role groups', () => {
    const digest = scheduleCoverageDigest(groups, week)
    const areaNames = digest.areaRows.map(([n]) => n)
    // Atanmamış hücreler nötr kovaya gider — yemekhaneye sayılmaz.
    expect(areaNames).toContain('Konum belirtilmemiş')
    expect(areaNames).toContain('İşçi Lokali')
    const roleNames = digest.roleRows.map(([n]) => n)
    expect(roleNames).toContain('Yemek/İkram')
    expect(roleNames).toContain('Bulaşıkhane')
    // Yemek/İkram grubu bulaşıkhaneden önce sıralanır
    expect(roleNames.indexOf('Yemek/İkram')).toBeLessThan(roleNames.indexOf('Bulaşıkhane'))
  })
})

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
    expect(html).toContain('Revizyon 1')
    expect(html).toContain('class="person-row"')
    expect(html).toContain('border: 2px solid #475569')
    expect(html).toContain('border-top: 1.6px solid #64748b')
  })

  it('summarizes split-shift segments in personnel share output', () => {
    const splitStaff = [{
      ...STAFF[0],
      days: { [WEEK[0]]: shift({ segments: [
        { start_time: '08:00', end_time: '12:00', work_location_name: 'OTC Lokal', status: 'planned' },
        { start_time: '13:00', end_time: '17:00', work_location_name: 'Kamp', status: 'planned' },
      ] }) },
    }]
    const html = buildScheduleShareHtml(payload({ staffGrid: splitStaff, visibleGrid: splitStaff }))
    expect(html).toContain('08:00-12:00')
    expect(html).toContain('2 parca')
    expect(html).toContain('OTC Lokal / Kamp')
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

  it('renders department page splits, notes and signature blocks', () => {
    const html = buildScheduleShareHtml(payload({
      options: {
        title: 'Imzali Departman Ciktisi',
        pageBreakByDept: true,
        pageSize: 'A3',
        preparedBy: 'Vardiya Amirligi',
        publicationDate: '2026-07-05',
        revision: '3',
        documentNo: 'VRD-2026-07',
        note: 'Bu cizelge personele duyurulacak.',
        includeSignatures: true,
      },
    }))

    expect(html).toContain('@page { size: A3 landscape')
    expect(html).toContain('dept-block split')
    expect(html).toContain('Hazirlayan: Vardiya Amirligi')
    expect(html).toContain('Yayin: 5 Tem / Rev: 3')
    expect(html).toContain('Belge No: VRD-2026-07')
    expect(html).toContain('Bu cizelge personele duyurulacak.')
    expect(html).toContain('Kontrol Eden')
  })

  it('creates stable filenames for downloaded images', () => {
    expect(scheduleShareFilename('2026-07-06', 'png')).toBe('vardiya-cizelgesi-2026-07-06.png')
    expect(scheduleShareFilename('2026-07-06', 'jpg')).toBe('vardiya-cizelgesi-2026-07-06.jpg')
    expect(scheduleShareFilename('2026-07-06', 'png', '3')).toBe('vardiya-cizelgesi-2026-07-06-r3.png')
  })

  it('applies custom colors to shifts and statuses in every mode', () => {
    const html = buildScheduleShareHtml(payload({
      options: {
        colorMode: 'custom',
        shiftColors: { 1: '#FF0000' },
        workColor: '#00AA00',
        offColor: '#000000',
        absentColor: '#123456',
      },
    }))
    // Vardiya 1 → özel kırmızı; Vardiya 2 (custom override yok) → workColor
    expect(html).toContain('#FF0000')
    expect(html).toContain('#00AA00')
    // OFF ve YOK özel renkleri
    expect(html).toContain('#000000')
    expect(html).toContain('#123456')
    // Legend de özel OFF rengini yansıtır
    expect(html).toMatch(/swatch[^>]*background:#000000/)
  })

  it('custom off color overrides even in shift color mode', () => {
    const html = buildScheduleShareHtml(payload({
      options: { colorMode: 'shift', offColor: '#ABCDEF' },
    }))
    expect(html).toContain('#ABCDEF')
  })

  it('computes canvas layout geometry without a real 2D context', () => {
    const model = buildScheduleShareModel(payload())
    const layout = computeScheduleCanvasLayout(model, null)
    expect(layout.cols).toBe(7)
    expect(layout.width).toBeGreaterThan(0)
    expect(layout.height).toBeGreaterThan(200)
    expect(layout.dayW).toBeGreaterThan(0)
    expect(layout.nameW).toBeGreaterThan(0)
  })
})

// Canlı şikâyet: noktası girilmemiş herkes özet tabloda "Yemekhane" altında
// toplanıyordu. Sayım tablosu olduğu için boş etiket yerine nötr kova kullanılır.
describe('noktasız vardiya yemekhaneye sayılmaz', () => {
  const week = ['2026-07-06']
  const groups = [{
    name: 'Teknik',
    people: [
      { role_name: 'Teknisyen', days: { '2026-07-06': { status: 'worked' } } },
      { role_name: 'Ikramci', days: { '2026-07-06': { status: 'worked', work_location_name: 'İşçi Lokali' } } },
    ],
  }]

  it('nokta kovası "Yemekhane" değil nötr addır', () => {
    const { areaRows } = scheduleCoverageDigest(groups, week)
    const adlar = areaRows.map(([name]) => name)
    expect(adlar).toContain('Konum belirtilmemiş')
    expect(adlar).not.toContain('Yemekhane')
  })

  it('gerçek nokta girilmişse aynen sayılır', () => {
    const { areaRows } = scheduleCoverageDigest(groups, week)
    expect(areaRows.find(([name]) => name === 'İşçi Lokali')?.[1]).toBe(1)
  })
})
