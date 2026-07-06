import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ComparePanel from './ComparePanel.jsx'

const stats = {
  M1: { occupancy_pct: 80, total_beds: 10, occupied: 8, empty_rooms: 1, quarantine: 0, maintenance: 0, open_faults: 1, cleaning_done: 0, cleaning_total: 0, day_count: 2, night_count: 2 },
  M2: { occupancy_pct: 50, total_beds: 10, occupied: 5, empty_rooms: 3, quarantine: 1, maintenance: 0, open_faults: 0, cleaning_done: 0, cleaning_total: 0, day_count: 1, night_count: 1 },
}

describe('campus-map/ComparePanel smoke', () => {
  it('seçili blokları karşılaştırma tablosunda gösterir', () => {
    render(<ComparePanel blocks={['M1', 'M2']} stats={stats} onClose={() => {}} onSelectSingle={() => {}} />)
    expect(screen.getByText('KARSILASTIRMA')).toBeInTheDocument()
    expect(screen.getByText('2 BLOK • TOPLAM')).toBeInTheDocument()
  })

  it('blok adına tıklayınca onSelectSingle tetikler', () => {
    const onSelectSingle = vi.fn()
    render(<ComparePanel blocks={['M1', 'M2']} stats={stats} onClose={() => {}} onSelectSingle={onSelectSingle} />)
    // M1 hem tabloda (buton) hem bar grafikte (span) var — tablo butonu ilk sırada
    fireEvent.click(screen.getAllByText('M1')[0])
    expect(onSelectSingle).toHaveBeenCalledWith('M1')
  })
})
