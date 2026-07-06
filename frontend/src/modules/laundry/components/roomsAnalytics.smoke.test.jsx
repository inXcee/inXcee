import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Stat, YearHeatmap, HourDayMatrix, SlaCard, ItemActionMenu } from './roomsAnalytics.jsx'

describe('roomsAnalytics smoke', () => {
  it('Stat değer + etiket gösterir', () => {
    render(<Stat label="TES" value={5} color="var(--green)" />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('TES')).toBeInTheDocument()
  })

  it('YearHeatmap boş veriyle çökmeden render olur', () => {
    render(<YearHeatmap points={[]} />)
    expect(screen.getByText('SON 12 AY — YILLIK ISI HARİTASI')).toBeInTheDocument()
  })

  it('HourDayMatrix boş veriyle çökmeden render olur', () => {
    render(<HourDayMatrix points={[]} />)
    expect(screen.getByText("SAAT × GÜN PATTERN'İ")).toBeInTheDocument()
  })

  it('SlaCard ihlal listesini gösterir', () => {
    render(<SlaCard violations={[{ id: 1, status: 'washing', hours: 50 }]} />)
    expect(screen.getByText('⚠ SLA İHLALİ (1)')).toBeInTheDocument()
  })

  it('ItemActionMenu ready durumda teslim butonu gösterir', () => {
    render(<ItemActionMenu item={{ id: 1, status: 'ready' }} onAdvance={() => {}} onDeliver={() => {}} onLost={() => {}} onClose={() => {}} />)
    expect(screen.getByText('🚚 Teslim et')).toBeInTheDocument()
  })
})
