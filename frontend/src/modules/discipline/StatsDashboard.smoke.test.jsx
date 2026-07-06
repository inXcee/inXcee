import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatsDashboard from './StatsDashboard.jsx'

describe('discipline/StatsDashboard smoke', () => {
  it('stats yoksa null döner', () => {
    const { container } = render(<StatsDashboard stats={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('KPI ve top offenders render eder', () => {
    render(<StatsDashboard stats={{
      total_records: 10, yellow_cards: 6, red_cards: 4,
      blacklisted_count: 2, critical_count: 1, warned_count: 3,
      topOffenders: [{ id: 1, full_name: 'Ali Veli', company: 'ABC', job_title: 'İşçi', discipline_points: 3, yellow: 1, red: 1, is_blacklisted: false }],
    }} />)
    expect(screen.getByText('TOPLAM KART')).toBeInTheDocument()
    expect(screen.getByText('EN ÇOK CEZA ALAN PERSONEL')).toBeInTheDocument()
    expect(screen.getByText('Ali Veli')).toBeInTheDocument()
  })
})
