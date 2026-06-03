import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BLOCK_BY_NAME } from '../../shared/blocks.js'
import SidePanel from './SidePanel.jsx'

const s = {
  occupancy_pct: 70, total_beds: 12, occupied: 8, total_rooms: 6, empty_rooms: 1,
  full_rooms: 0, open_faults: 2, quarantine: 0, maintenance: 0,
  day_count: 4, night_count: 4, cleaning_total: 6, cleaning_done: 5, cleaning_skipped: 0,
  top_companies: [{ company: 'ABC', count: 5 }],
}

describe('campus-map/SidePanel smoke', () => {
  it('blok başlığı + doluluk + aksiyon butonlarını render eder', () => {
    render(<SidePanel block="M1" cfg={BLOCK_BY_NAME.M1} stats={s} rooms={[]} mode="occupancy"
      timeseries={null} onClose={() => {}} onNavigate={() => {}} onQuickFault={() => {}} />)
    expect(screen.getByText('M1')).toBeInTheDocument()
    expect(screen.getByText('%70')).toBeInTheDocument()
    expect(screen.getByText('KAPASITE SAYFASINDA AC →')).toBeInTheDocument()
  })

  it('cfg/stats yoksa null döner', () => {
    const { container } = render(<SidePanel block="M1" cfg={null} stats={null}
      rooms={[]} mode="occupancy" onClose={() => {}} onNavigate={() => {}} onQuickFault={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
