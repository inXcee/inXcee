import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TransportTab from './TransportTab.jsx'

vi.mock('../../../shared/i18n/index.js', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

// Canlıda 2026-08-02'de düşen hata: query başarılı ama data undefined gelince
// TabState boş durumu göstermeye karar vermeden önce çocuklar değerlendiği için
// `data.pickup` "Cannot read properties of undefined" fırlatıyordu.
describe('TransportTab — veri gelmediğinde çökmez', () => {
  it('data undefined iken boş durumu gösterir', () => {
    const query = { isPending: false, isError: false, isFetching: false, data: undefined }
    expect(() => render(<TransportTab query={query} data={undefined} />)).not.toThrow()
    expect(screen.getByText('avs_kiosk.transport.none')).toBeInTheDocument()
  })

  it('data boş nesne iken de boş durumu gösterir', () => {
    const query = { isPending: false, isError: false, isFetching: false, data: {} }
    expect(() => render(<TransportTab query={query} data={{}} />)).not.toThrow()
    expect(screen.getByText('avs_kiosk.transport.none')).toBeInTheDocument()
  })

  it('durak bilgisi varsa gösterir', () => {
    const data = { pickup: { name: 'Filyos Merkez', district: 'Çaycuma' }, schedule: { time: '07:30' } }
    const query = { isPending: false, isError: false, isFetching: false, data }
    render(<TransportTab query={query} data={data} />)
    expect(screen.getByText('Filyos Merkez')).toBeInTheDocument()
    expect(screen.getByText(/07:30/)).toBeInTheDocument()
  })

  it('yalnız yaklaşan seferler varsa listeler', () => {
    const data = {
      upcoming: [{
        assignment_id: 1, route_name: 'Zonguldak Hattı', direction: 'outbound',
        work_date: '2026-08-03', scheduled_departure: '2026-08-03 07:30:00', stop_name: 'Merkez',
      }],
    }
    const query = { isPending: false, isError: false, isFetching: false, data }
    render(<TransportTab query={query} data={data} />)
    expect(screen.getByText('Zonguldak Hattı')).toBeInTheDocument()
  })
})
