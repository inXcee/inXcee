import { describe, expect, it } from 'vitest'
import { buildPersonnelDrilldownPrintHtml, escapePersonnelPrintHtml } from './personnelTrackingDrilldownPrint.js'

describe('personnelTrackingDrilldownPrint', () => {
  it('escapes user-controlled text and includes the active view with filters', () => {
    const html = buildPersonnelDrilldownPrintHtml({
      meta: { definition: '<İzin & rapor>', scope: 'period', period: { from: '2026-08-01', to: '2026-08-31' }, summary: { primary_value: 1, people_count: 1, record_count: 1, day_total: 1, hour_total: 0 } },
      view: 'records', filterLabels: ['Proje: FPU'], generatedBy: 'Müdür',
      items: [{ record_id: 1, staff_id: 54, full_name: '<script>alert(1)</script>', occurred_at: '2026-08-05', subtype: 'sick', status: 'approved', quantity: 1, unit: 'day', reason: 'R&D', before: { status: '<pending>' }, after: { status: 'approved' } }],
    })
    expect(html).toContain('&lt;İzin &amp; rapor&gt;')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('Kayıtlar görünümü')
    expect(html).toContain('Proje: FPU')
  })

  it('escapes all HTML-sensitive characters', () => {
    expect(escapePersonnelPrintHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })
})
