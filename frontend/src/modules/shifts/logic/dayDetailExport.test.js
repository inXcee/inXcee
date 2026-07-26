import { describe, it, expect } from 'vitest'
import { buildDayDetailHtml } from './dayDetailExport.js'

const detail = {
  date: '2026-07-05',
  group_by: 'dept',
  totals: { working: 1, on_leave: 1, sick: 0, absent: 0, off: 0 },
  groups: [{
    name: 'Yemekhane',
    shifts: [{ shift_name: 'Sabah', start_hour: '08:00', end_hour: '16:00', count: 1, people: [
      { staff_id: 1, full_name: 'Ali', work_location_name: 'Mutfak' },
    ] }],
    on_leave: [{ staff_id: 4, full_name: 'Ayşe <script>', leave_type_label: 'Yıllık izin' }],
    sick: [], absent: [], off: [],
    totals: { working: 1, on_leave: 1, sick: 0, absent: 0, off: 0 },
  }],
}

describe('buildDayDetailHtml', () => {
  it('başlık, özet ve bölüm içeriğini üretir', () => {
    const html = buildDayDetailHtml(detail)
    expect(html).toContain('GÜN DETAYI · 2026-07-05 · Departman bazında')
    expect(html).toContain('Çalışan: 1')
    expect(html).toContain('Yemekhane')
    expect(html).toContain('Sabah')
    expect(html).toContain('<table class="matrix">')
    expect(html).toContain('border: 2px solid #475569')
    expect(html).toContain('border-top-width: 1.6px')
    expect(html).toContain('Gün kadrosu')
    expect(html).toContain('Ali')
    expect(html).toContain('⚪ İzinli (1)')
  })

  it('kullanıcı verisini HTML-escape eder (XSS yok)', () => {
    const html = buildDayDetailHtml(detail)
    expect(html).not.toContain('<script>')
    expect(html).toContain('Ayşe &lt;script&gt;')
  })

  it('boş gün bilgilendirme basar', () => {
    const html = buildDayDetailHtml({ date: '2026-07-06', group_by: 'dept', totals: {}, groups: [] })
    expect(html).toContain('Bu gün için çizelge kaydı yok.')
  })
})
