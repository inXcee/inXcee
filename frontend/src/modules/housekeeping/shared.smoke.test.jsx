import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { roomNoFromQr, CHECKLIST_ITEMS, SKIP_REASONS, ProgressStrip, GhostTile, FacilityCell } from './shared.jsx'

describe('housekeeping/shared primitive\'leri', () => {
  it('roomNoFromQr QR string\'inden oda no çıkarır', () => {
    expect(roomNoFromQr('M1-1-101')).toBe('101')
    expect(roomNoFromQr(null)).toBe(null)
    expect(roomNoFromQr('tekparca')).toBe(null)
  })

  it('CHECKLIST_ITEMS + SKIP_REASONS dışa aktarılır', () => {
    expect(CHECKLIST_ITEMS.some(i => i.privateOnly)).toBe(true)
    expect(SKIP_REASONS).toContain('Oda kilitli')
  })

  it('ProgressStrip tamamlama yüzdesini hesaplar', () => {
    const tasks = [{ completed_at: '2026-01-01' }, { completed_at: null }, { skipped: 1 }, {}]
    render(<ProgressStrip tasks={tasks} onGenerate={() => {}} generating={false} />)
    expect(screen.getByText('%25')).toBeInTheDocument() // 1/4 done
    expect(screen.getByText('+ GÖREV OLUŞTUR')).toBeInTheDocument()
  })

  it('GhostTile + FacilityCell render eder', () => {
    render(<><GhostTile rno="105" /><FacilityCell type="WC" /></>)
    expect(screen.getByText('105')).toBeInTheDocument()
    expect(screen.getByText('WC')).toBeInTheDocument()
  })
})
