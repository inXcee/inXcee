import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { computeMetric, companyColor, extractBlock, defaultPins, MODES, Kpi, MiniStat } from './shared.jsx'

describe('campus-map/shared helper\'leri', () => {
  it('extractBlock mesajdan blok adı çıkarır', () => {
    expect(extractBlock('M1-101 karantinaya alindi')).toBe('M1')
    expect(extractBlock('hiçbir blok yok')).toBe(null)
    expect(extractBlock(null)).toBe(null)
  })

  it('companyColor deterministic (aynı isim aynı renk)', () => {
    expect(companyColor('ABC')).toBe(companyColor('ABC'))
    expect(companyColor(null)).toBe('#475569')
  })

  it('computeMetric occupancy modunda doluluk yüzdesi/rengi döner', () => {
    const s = { occupancy_pct: 90, total_beds: 10, occupied: 9, full_rooms: 1 }
    const m = computeMetric('occupancy', s, { type: 'M' })
    expect(m.color).toBe('#dc2626') // >= 85
    expect(m.centerLabel).toBe('%90')
    expect(m.badge).toEqual({ text: '!', color: '#dc2626' })
  })

  it('computeMetric veri yoksa gri fallback döner', () => {
    expect(computeMetric('occupancy', null, null).color).toBe('#6b7280')
  })

  it('defaultPins her blok için x/y üretir', () => {
    const pins = defaultPins()
    expect(Object.keys(pins).length).toBeGreaterThan(0)
    expect(MODES.length).toBe(6)
  })

  it('Kpi + MiniStat render eder', () => {
    render(<><Kpi label="DOLU" value={42} color="#16a34a" /><MiniStat label="BOS" value={5} /></>)
    expect(screen.getByText('DOLU')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('BOS')).toBeInTheDocument()
  })
})
