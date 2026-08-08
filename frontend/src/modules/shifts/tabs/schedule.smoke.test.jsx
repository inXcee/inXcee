import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import { useAuthStore } from '../../../shared/store/authStore.js'

vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import ScheduleTab from './ScheduleTab.jsx'

describe('ScheduleTab smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ user: { role: 'campus_manager' } })
  })

  it('çökmeden render olur ve görünüm geçişini gösterir', () => {
    renderWithProviders(<ScheduleTab departments={[]} shiftDefs={[]} onPersonClick={() => {}} />)
    expect(screen.getByText('HAFTALIK')).toBeInTheDocument()
    expect(screen.getByText('Seçim')).toBeInTheDocument()
    expect(screen.getByText('CANLI KONTROL')).toBeInTheDocument()
    expect(screen.getByText('GÜNLÜK')).toBeInTheDocument()
  })

  // Asıl çizelge beş yardımcı panelin ALTINDA render ediliyordu: kullanıcı
  // çizelgeye bakarken güne tıklamak için sayfanın tepesine dönüyordu.
  it('çizelge tablosu yardımcı panellerin ÜSTÜNDE gelir', async () => {
    const { container } = renderWithProviders(<ScheduleTab departments={[]} shiftDefs={[]} onPersonClick={() => {}} />)
    await waitFor(() => expect(container.querySelector('table')).toBeTruthy())
    const tablo = container.querySelector('table')
    const gunDetayi = screen.getByText(/GÜN DETAYI/)
    // compareDocumentPosition: FOLLOWING = panel tablodan SONRA geliyor demek
    expect(tablo.compareDocumentPosition(gunDetayi) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // Uzun listede aşağı inince hangi sütunun hangi gün olduğu kayboluyordu.
  it('gün başlıkları ve personel sütunu yapışkan', async () => {
    const { container } = renderWithProviders(<ScheduleTab departments={[]} shiftDefs={[]} onPersonClick={() => {}} />)
    await waitFor(() => expect(container.querySelector('table thead th')).toBeTruthy())
    // Sayfada başka tablolar da var (yardımcı paneller); ölçüm çizelgeninki.
    const basliklar = [...container.querySelector('table').querySelectorAll('thead th')]
    expect(basliklar.length).toBeGreaterThan(1)
    basliklar.forEach(th => expect(th.style.position).toBe('sticky'))
    expect(basliklar[0].style.left).toBe('0px')      // personel sütunu yatayda
    basliklar.forEach(th => expect(th.style.top).toBe('0px'))  // başlık satırı dikeyde
  })

  it('panel gizleme seçeneği var', () => {
    renderWithProviders(<ScheduleTab departments={[]} shiftDefs={[]} onPersonClick={() => {}} />)
    expect(screen.getByText(/Paneller/)).toBeInTheDocument()
  })
})
