import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { priInfo, statusInfo, getCurrentShift, StatusTimeline, SLACountdown, PRIORITIES, STATUSES } from './shared.jsx'

describe('maintenance/shared helper\'ları', () => {
  it('priInfo/statusInfo bilinen anahtarı, bilinmeyende varsayılanı döndürür', () => {
    expect(priInfo('high').label).toBe('ACİL')
    expect(priInfo('xxx')).toBe(PRIORITIES[1]) // varsayılan: NORMAL
    expect(statusInfo('done').label).toBe('TAMAMLANDI')
    expect(statusInfo('xxx')).toBe(STATUSES[0]) // varsayılan: AÇIK
  })

  it('getCurrentShift geçerli bir vardiya anahtarı döndürür', () => {
    expect(['1', '2', '3']).toContain(getCurrentShift())
  })

  it('StatusTimeline render edilir', () => {
    const { container } = render(<StatusTimeline status="in_progress" />)
    expect(container.querySelectorAll('div').length).toBeGreaterThan(0)
  })

  it('SLACountdown gelecekteki deadline için süre gösterir', () => {
    render(<SLACountdown deadline={new Date(Date.now() + 7200000).toISOString()} />)
    expect(screen.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument()
  })
})
