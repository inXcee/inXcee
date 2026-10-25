import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import TrendCard from './TrendCard.jsx'

// Doluluk trendi saha verisinden (oda bazlı) gelince etiket bunu söyler; anlık görüntüsü olmayan gün sıfır sayılmaz.
describe('TrendCard', () => {
  it('oda bazlı doluluk etiketi ve son değer', () => {
    render(<TrendCard metric="occupancy" source="field" data={[{ date: '2026-10-24', value: null }, { date: '2026-10-25', value: 72 }]} />)
    expect(screen.getByText('Doluluk · oda bazlı')).toBeInTheDocument()
    expect(screen.getByText('72%')).toBeInTheDocument()
    expect(screen.queryByText('↑')).toBeNull() // dünkü değer yok: ok çizilmez
  })

  it('son gün bilinmiyorsa sıfır değil tire', () => {
    render(<TrendCard metric="occupancy" source="beds" data={[{ date: '2026-10-24', value: 60 }, { date: '2026-10-25', value: null }]} />)
    expect(screen.getByText('Doluluk')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
