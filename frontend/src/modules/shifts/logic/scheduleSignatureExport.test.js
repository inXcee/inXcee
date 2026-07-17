import { describe, expect, it } from 'vitest'
import {
  buildDailySignatureModel, buildSignatureModels, classifySignatureCell,
  renderSignaturePageHtml, renderSignaturePagesHtml, signaturePagesCss,
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
    expect(signaturePagesCss()).toContain('@page signature')
  })
})
