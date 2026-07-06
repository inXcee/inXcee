import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ModeKpis from './ModeKpis.jsx'

const T = { total_beds: 100, occupied: 60, empty: 10, quarantine: 2, maintenance: 1,
  fault: 3, clean_total: 50, clean_done: 40, day: 30, night: 30 }

describe('campus-map/ModeKpis smoke', () => {
  it('occupancy modunda yatak/dolu KPI gösterir', () => {
    render(<ModeKpis mode="occupancy" totalStats={T} />)
    expect(screen.getByText('TOPLAM YATAK')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('shifts modunda gündüz/gece KPI gösterir', () => {
    render(<ModeKpis mode="shifts" totalStats={T} />)
    expect(screen.getByText('GUNDUZ VARDIYA')).toBeInTheDocument()
    expect(screen.getByText('GECE VARDIYA')).toBeInTheDocument()
  })
})
