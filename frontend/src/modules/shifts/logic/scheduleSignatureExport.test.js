import { describe, expect, it } from 'vitest'
import {
  buildDailySignatureModel, buildSignatureModels, buildWeeklySignatureModel, classifySignatureCell,
  renderSignaturePageHtml, renderSignaturePagesHtml, renderWeeklySignaturePagesHtml, signaturePagesCss,
} from './scheduleSignatureExport.js'

const DATE = '2026-07-13'

function person(full_name, dept_name, cell, extra = {}) {
  return { full_name, dept_name, days: cell ? { [DATE]: cell } : {}, ...extra }
}

const PEOPLE = [
  person('Ahmet', 'Mutfak', { status: 'worked', shift_name: 'Gündüz', start_hour: 8, end_hour: 17, work_location_name: 'İşçi Lokali' }, { role_name: 'Ikramci' }),
  person('Zeynep', 'Mutfak', { status: 'scheduled', start_hour: 6, end_hour: 15, segments: [
    { start_time: '06:15', end_time: '10:00', work_location_name: 'OTC Yemekhane', status: 'planned' },
    { start_time: '10:00', end_time: '15:00', work_location_name: 'İşçi Lokali', status: 'planned' },
  ] }),
  person('Bulut', 'Servis', { status: 'off' }),
  person('Ceren', 'Servis', { status: 'on_leave', leave_type: 'annual' }),
  person('Deniz', 'Servis', { status: 'on_leave', leave_type: 'sick' }),
  person('Emre', 'Servis', { status: 'on_leave', leave_type: 'emergency' }),
  person('Faruk', 'Servis', { status: 'absent', absent_reason: 'Habersiz' }),
  person('Gizem', 'Servis', null), // hücre yok → planlanmamış
]

describe('classifySignatureCell', () => {
  it('classifies working, off, leaves, absent and unplanned', () => {
    expect(classifySignatureCell({ status: 'worked' })).toBe('working')
    expect(classifySignatureCell({ status: 'off' })).toBe('off')
    expect(classifySignatureCell({ status: 'on_leave', leave_type: 'annual' })).toBe('annual')
    expect(classifySignatureCell({ status: 'on_leave', leave_type: 'sick' })).toBe('report')
    expect(classifySignatureCell({ status: 'on_leave', leave_type: 'emergency' })).toBe('other_leave')
    expect(classifySignatureCell({ status: 'absent' })).toBe('absent')
    expect(classifySignatureCell(null)).toBe('unplanned') // boş hücre asla devamsız değil
  })
})

describe('buildDailySignatureModel', () => {
  const model = buildDailySignatureModel({ people: PEOPLE, date: DATE })

  it('lists only working staff in signature groups, dept→shift→name ordered and numbered', () => {
    expect(model.working_count).toBe(2)
    const mutfak = model.groups.find(g => g.dept_name === 'Mutfak')
    expect(mutfak.rows.map(r => r.full_name)).toEqual(['Zeynep', 'Ahmet']) // 06:15 önce, sonra 08:00
    expect(mutfak.rows[0].no).toBe(1)
    expect(mutfak.rows[1].no).toBe(2)
  })

  it('expands split shifts with per-segment time and location', () => {
    const zeynep = model.groups[0].rows.find(r => r.full_name === 'Zeynep')
    expect(zeynep.is_split).toBe(true)
    expect(zeynep.segments).toHaveLength(2)
    expect(zeynep.segments[0].time).toBe('06:15-10:00')
    expect(zeynep.work_location).toContain('OTC Yemekhane')
    expect(zeynep.work_location).toContain('İşçi Lokali')
  })

  it('routes non-working staff to the correct no-signature categories', () => {
    const byLabel = Object.fromEntries(model.non_signature.map(c => [c.label, c.people.map(p => p.full_name)]))
    expect(byLabel['OFF / Haftalık İzin']).toEqual(['Bulut'])
    expect(byLabel['Yıllık İzin']).toEqual(['Ceren'])
    expect(byLabel['Raporlu']).toEqual(['Deniz'])
    expect(byLabel['Diğer İzin']).toEqual(['Emre'])
    expect(byLabel['Devamsız']).toEqual(['Faruk'])
    expect(byLabel['Planlanmamış']).toEqual(['Gizem'])
    // devamsız açıklaması taşınır
    const faruk = model.non_signature.find(c => c.key === 'absent').people[0]
    expect(faruk.detail).toBe('Habersiz')
  })

  it('summarizes counts and supports multi-day build', () => {
    expect(model.summary).toMatchObject({ working: 2, off: 1, annual: 1, report: 1, other_leave: 1, absent: 1, unplanned: 1 })
    const multi = buildSignatureModels({ people: PEOPLE, dates: [DATE, '2026-07-14'] })
    expect(multi).toHaveLength(2)
    expect(multi[1].working_count).toBe(0) // ikinci günde hücre yok
  })
})

describe('signature HTML rendering', () => {
  const model = buildDailySignatureModel({ people: PEOPLE, date: DATE })

  it('renders a printable signature page with table, no-sign section and footer', () => {
    const html = renderSignaturePageHtml(model, { revision: '2', generated: '2026-07-13 09:00' })
    expect(html).toContain('GÜNLÜK VARDİYA İMZA LİSTESİ')
    expect(html).toContain('İmza')
    expect(html).toContain('Fiili Vardiya / Durum')
    expect(html).toContain('İMZA ALINMAYACAK PERSONEL')
    expect(html).toContain('Hazırlayan')
    expect(html).toContain('Onay (Vardiya Amiri)')
    expect(html).toContain('Revizyon: 2')
    expect(html).toContain('06:15-10:00') // parçalı vardiya segmenti
  })

  it('adds entry/exit columns for double signature', () => {
    const dbl = buildDailySignatureModel({ people: PEOPLE, date: DATE, options: { doubleSignature: true } })
    const html = renderSignaturePageHtml(dbl)
    expect(html).toContain('Giriş İmza')
    expect(html).toContain('Çıkış İmza')
  })

  it('produces one page per day and valid CSS', () => {
    const models = buildSignatureModels({ people: PEOPLE, dates: [DATE, '2026-07-14'] })
    const html = renderSignaturePagesHtml(models, {})
    expect((html.match(/class="sig-page"/g) || []).length).toBe(2)
    const css = signaturePagesCss()
    expect(css).toContain('@page signature')
    expect(css).toContain('table.sig { width: 100%; border-collapse: collapse; font-size: 9.5px; border: 2px solid #475569; }')
    expect(css).toContain('table.sig tbody tr td { border-top-width: 1.6px; border-bottom-width: 1.6px; }')
  })
})

describe('weekly signature sheet', () => {
  const SECOND_DATE = '2026-07-14'
  const weeklyPeople = [
    {
      full_name: 'Ahmet Kaya', dept_name: 'Mutfak', role_name: 'İkramcı', days: {
        [DATE]: { status: 'scheduled', shift_name: 'Gündüz', start_hour: 8, end_hour: 16, work_location_name: 'OTC' },
        [SECOND_DATE]: { status: 'off' },
      },
    },
    {
      full_name: 'Ayşe Demir', dept_name: 'Mutfak', role_name: 'Aşçı', days: {
        [DATE]: { status: 'on_leave', leave_type: 'sick', absent_reason: 'Özel sağlık açıklaması' },
        [SECOND_DATE]: { status: 'scheduled', shift_name: 'Akşam', start_hour: 16, end_hour: 24 },
      },
    },
  ]

  it('keeps one department sheet for the week and marks non-signing cells', () => {
    const model = buildWeeklySignatureModel({ people: weeklyPeople, dates: [DATE, SECOND_DATE] })
    expect(model.pages).toHaveLength(1)
    expect(model.pages[0].department).toBe('Mutfak')
    expect(model.pages[0].rows).toHaveLength(2)
    const ahmet = model.pages[0].rows.find(row => row.full_name === 'Ahmet Kaya')
    const ayse = model.pages[0].rows.find(row => row.full_name === 'Ayşe Demir')
    expect(ahmet.days[0]).toMatchObject({ category: 'working', can_sign: true })
    expect(ahmet.days[1]).toMatchObject({ label: 'OFF', can_sign: false })
    expect(ayse.days[0]).toMatchObject({ label: 'RAPORLU', detail: '', can_sign: false })
  })

  it('renders a landscape weekly form with practical change rows', () => {
    const model = buildWeeklySignatureModel({ people: weeklyPeople, dates: [DATE, SECOND_DATE], options: { blankRows: 2 } })
    const html = renderWeeklySignaturePagesHtml(model, { revision: '3', weekLabel: `${DATE} - ${SECOND_DATE}` })
    expect(html).toContain('HAFTALIK PERSONEL İMZA FÖYÜ')
    expect(html).toContain('Sonradan Eklenen / Vardiyası Değişen')
    expect(html).toContain('Revizyon: 3')
    expect(html).not.toContain('Özel sağlık açıklaması')
    const css = signaturePagesCss()
    expect(css).toContain('@page weekly-signature')
    expect(css).toContain('table.weekly-sig { width: 100%; table-layout: fixed; border-collapse: collapse; border: 2px solid #475569; }')
  })

  it('fits 25 personnel plus change rows on one economical page', () => {
    const manyPeople = Array.from({ length: 25 }, (_, index) => ({
      full_name: `Personel ${index + 1}`, dept_name: 'Teknik', days: {},
    }))
    const model = buildWeeklySignatureModel({ people: manyPeople, dates: [DATE], options: { rowsPerPage: 25, blankRows: 3 } })
    const html = renderWeeklySignaturePagesHtml(model)

    expect(model.pages).toHaveLength(1)
    expect(model.pages[0].rows).toHaveLength(25)
    expect(model.pages[0].show_blank_rows).toBe(true)
    expect(html).toContain('weekly-economy')
  })

  it('combines departments and renders each department once above its personnel group', () => {
    const manyPeople = Array.from({ length: 61 }, (_, index) => ({
      full_name: `Personel ${index + 1}`,
      dept_name: index < 31 ? 'Teknik' : 'Mutfak',
      days: {},
    }))
    const model = buildWeeklySignatureModel({ people: manyPeople, dates: [DATE], options: { groupMode: 'combined', rowsPerPage: 25, blankRows: 2 } })
    const html = renderWeeklySignaturePagesHtml(model)

    expect(model.pages).toHaveLength(3)
    expect(model.pages.map(page => page.rows.length)).toEqual([25, 25, 11])
    expect(model.pages.every(page => page.combined)).toBe(true)
    expect(model.pages[2].show_blank_rows).toBe(true)
    expect(html).toContain('class="weekly-dept-band"')
    expect(html).not.toContain('class="weekly-department"')
    expect(html).not.toContain('<th class="weekly-department">Bölüm</th>')
    expect(html).toContain('Teknik')
    expect(html).toContain('Mutfak')
  })

  it('can hide department bands for a completely plain compact list', () => {
    const model = buildWeeklySignatureModel({ people: weeklyPeople, dates: [DATE, SECOND_DATE], options: { groupMode: 'combined', showDepartmentBands: false, rowsPerPage: 25 } })
    const html = renderWeeklySignaturePagesHtml(model)

    expect(model.pages[0].combined).toBe(true)
    expect(html).not.toContain('class="weekly-dept-band"')
  })

  it('starts a second economical page only after 25 personnel', () => {
    const manyPeople = Array.from({ length: 26 }, (_, index) => ({
      full_name: `Personel ${index + 1}`, dept_name: 'Teknik', days: {},
    }))
    const model = buildWeeklySignatureModel({ people: manyPeople, dates: [DATE], options: { rowsPerPage: 25, blankRows: 3 } })
    expect(model.pages).toHaveLength(2)
    expect(model.pages[0].rows).toHaveLength(25)
    expect(model.pages[0].show_blank_rows).toBe(false)
    expect(model.pages[1].show_blank_rows).toBe(true)
  })
})

// Canlı şikâyet: çalışma noktası girilmemiş herkes imza çıktısında (PDF/PNG/Excel)
// "Yemekhane" olarak yazılıyordu. Nokta bilinmiyorsa uydurulmaz — boş bırakılır.
describe('çalışma noktası girilmemişse uydurulmaz', () => {
  const NOKTASIZ = [
    person('Noktasiz Kisi', 'Teknik', { status: 'worked', shift_name: 'Gündüz', start_hour: 8, end_hour: 17 }),
    person('Parcali Noktasiz', 'Teknik', { status: 'scheduled', start_hour: 6, end_hour: 15, segments: [
      { start_time: '06:00', end_time: '10:00', status: 'planned' },
      { start_time: '10:00', end_time: '15:00', status: 'planned' },
    ] }),
  ]

  it('düz vardiyada nokta boş kalır, Yemekhane yazılmaz', () => {
    const model = buildDailySignatureModel({ people: NOKTASIZ, date: DATE })
    const kisi = model.groups.flatMap(g => g.rows).find(row => row.full_name === 'Noktasiz Kisi')
    expect(kisi.work_location).toBe('')
  })

  it('parçalı vardiyada da nokta boş kalır', () => {
    const model = buildDailySignatureModel({ people: NOKTASIZ, date: DATE })
    const kisi = model.groups.flatMap(g => g.rows).find(row => row.full_name === 'Parcali Noktasiz')
    expect(kisi.work_location).toBe('')
    kisi.segments?.forEach(segment => expect(segment.location).toBe(''))
  })

  it('PDF/PNG çıktısında "Yemekhane" kelimesi geçmez', () => {
    const model = buildDailySignatureModel({ people: NOKTASIZ, date: DATE })
    const html = renderSignaturePageHtml(model)
    expect(html).not.toMatch(/Yemekhane/i)
  })

  it('gerçek nokta girilmişse aynen korunur', () => {
    const model = buildDailySignatureModel({ people: PEOPLE, date: DATE })
    const ahmet = model.groups.flatMap(g => g.rows).find(row => row.full_name === 'Ahmet')
    expect(ahmet.work_location).toBe('İşçi Lokali')
  })
})
