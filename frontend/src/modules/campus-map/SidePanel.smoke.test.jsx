import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BLOCK_BY_NAME } from '../../shared/blocks.js'
import SidePanel from './SidePanel.jsx'

// SidePanel artık blok detayını (arıza/temizlik/oda-kişi) kendi çeken bir alt
// bileşen render ediyor — smoke testte ağ çağrısı boş bırakılır.
vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => new Promise(() => {})) },
}))

const withQuery = ui => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {ui}
  </QueryClientProvider>
)

const s = {
  occupancy_pct: 70, total_beds: 12, occupied: 8, total_rooms: 6, empty_rooms: 1,
  full_rooms: 0, open_faults: 2, quarantine: 0, maintenance: 0,
  day_count: 4, night_count: 4, cleaning_total: 6, cleaning_done: 5, cleaning_skipped: 0,
  top_companies: [{ company: 'ABC', count: 5 }],
}

describe('campus-map/SidePanel smoke', () => {
  it('blok başlığı + doluluk + aksiyon butonlarını render eder', () => {
    render(withQuery(<SidePanel block="M1" cfg={BLOCK_BY_NAME.M1} stats={s} rooms={[]} mode="occupancy"
      timeseries={null} onClose={() => {}} onNavigate={() => {}} onQuickFault={() => {}} />))
    expect(screen.getByText('M1')).toBeInTheDocument()
    expect(screen.getByText('%70')).toBeInTheDocument()
    expect(screen.getByText('KAPASITE SAYFASINDA AC →')).toBeInTheDocument()
  })

  it('cfg/stats yoksa null döner', () => {
    const { container } = render(withQuery(<SidePanel block="M1" cfg={null} stats={null}
      rooms={[]} mode="occupancy" onClose={() => {}} onNavigate={() => {}} onQuickFault={() => {}} />))
    expect(container).toBeEmptyDOMElement()
  })
})

describe('campus-map/SidePanel yönetici aksiyonları', () => {
  it('yönetici için blok durum aksiyonları görünür (sağ tık gerektirmez)', () => {
    const onBulkAction = vi.fn()
    render(withQuery(<SidePanel block="M1" cfg={BLOCK_BY_NAME.M1} stats={s} rooms={[]} mode="occupancy"
      timeseries={null} onClose={() => {}} onNavigate={() => {}} onQuickFault={() => {}}
      isManager onBulkAction={onBulkAction} />))
    expect(screen.getByText('TÜM BLOK ODALARINI…')).toBeInTheDocument()
    // "KARANTINA" metni MiniStat rozetinde de geçiyor — buton rolüyle ayır.
    screen.getByRole('button', { name: /KARANTINA/ }).click()
    expect(onBulkAction).toHaveBeenCalledWith('quarantine')
    screen.getByRole('button', { name: /AKTIF/ }).click()
    expect(onBulkAction).toHaveBeenCalledWith('active')
  })

  it('yönetici değilse durum aksiyonları gizli', () => {
    render(withQuery(<SidePanel block="M1" cfg={BLOCK_BY_NAME.M1} stats={s} rooms={[]} mode="occupancy"
      timeseries={null} onClose={() => {}} onNavigate={() => {}} onQuickFault={() => {}}
      isManager={false} onBulkAction={() => {}} />))
    expect(screen.queryByText('TÜM BLOK ODALARINI…')).not.toBeInTheDocument()
  })
})
