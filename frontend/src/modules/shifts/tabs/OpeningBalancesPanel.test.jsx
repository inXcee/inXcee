import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

let role = 'campus_manager'
vi.mock('../../../shared/store/authStore.js', () => ({
  useAuthStore: (sel) => sel({ user: { role } }),
}))
vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [
      { id: 5, staff_id: 9, full_name: 'AYŞE KAYA', dept_name: 'Mutfak', as_of_date: '2026-09-30', days: 12, status: 'pending', current_basis: 'unknown', current_remaining: null },
    ] })),
    post: vi.fn((url) => {
      if (url.includes('dryRun')) return Promise.resolve({ data: { ok: true, rows: [{ staff_id: 9, full_name: 'AYŞE KAYA', days: 12, as_of_date: '2026-09-30', current: { basis: 'unknown', remaining: null } }], errors: [] } })
      if (url.endsWith('/decision')) return Promise.resolve({ data: { id: 5, status: 'approved' } })
      return Promise.resolve({ data: { ok: true, ids: [6], rows: [], errors: [] } })
    }),
  },
}))

import api from '../../../shared/api/client.js'
import OpeningBalancesPanel from './OpeningBalancesPanel.jsx'

describe('OpeningBalancesPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); role = 'campus_manager' })

  it('önizlemeden sonra İK onayına gönderir; önizlemesiz gönderilemez', async () => {
    renderWithProviders(<OpeningBalancesPanel />)
    fireEvent.click(screen.getByText(/İZİN AÇILIŞ BAKİYELERİ/))
    fireEvent.change(screen.getByPlaceholderText(/iki sütun/), { target: { value: 'AYŞE KAYA\t12' } })
    fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: '2026-09-30' } })
    const send = screen.getByRole('button', { name: /İK onayına gönder/ })
    expect(send).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Önizle \(1\)/ }))
    await waitFor(() => expect(send).not.toBeDisabled())
    fireEvent.click(send)
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith('/shifts/leave/opening-balances',
      { as_of_date: '2026-09-30', source: 'excel', source_label: null, rows: [{ name: 'AYŞE KAYA', days: 12 }] }))
  })

  it('müdür bekleyen kaydı onaylar; vardiya amiri onay düğmesi görmez', async () => {
    renderWithProviders(<OpeningBalancesPanel />)
    fireEvent.click(screen.getByText(/İZİN AÇILIŞ BAKİYELERİ/))
    fireEvent.click(await screen.findByRole('button', { name: 'Onayla' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/shifts/leave/opening-balances/5/decision', { decision: 'approve' }))
  })

  it('vardiya amiri onaylayamaz', async () => {
    role = 'shift_supervisor'
    renderWithProviders(<OpeningBalancesPanel />)
    fireEvent.click(screen.getByText(/İZİN AÇILIŞ BAKİYELERİ/))
    expect(await screen.findByText('müdür onayı')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Onayla' })).not.toBeInTheDocument()
  })
})
