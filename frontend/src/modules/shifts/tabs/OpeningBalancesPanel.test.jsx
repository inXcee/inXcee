import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

let role = 'campus_manager'
vi.mock('../../../shared/store/authStore.js', () => ({
  useAuthStore: (sel) => sel({ user: { role } }),
}))
vi.mock('../../../shared/components/ConfirmDialog.jsx', () => ({ confirmDialog: vi.fn(() => Promise.resolve(true)) }))
vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [
      { id: 5, staff_id: 9, full_name: 'AYŞE KAYA', dept_name: 'Mutfak', as_of_date: '2026-09-30', days: 12, status: 'pending', current_basis: 'unknown', current_remaining: null, projected_remaining: 9, note: 'İK Excel 30.09: işe giriş 2023-01-01 (YYS ile aynı)' },
      { id: 6, staff_id: 10, full_name: 'ALİ VELİ', as_of_date: '2026-09-30', days: 3, status: 'pending', current_basis: 'legal', current_remaining: 14, projected_remaining: 3 },
    ] })),
    post: vi.fn((url) => {
      if (url.includes('dryRun')) return Promise.resolve({ data: { ok: true, rows: [{ staff_id: 9, full_name: 'AYŞE KAYA', days: 12, as_of_date: '2026-09-30', current: { basis: 'unknown', remaining: null } }], errors: [] } })
      if (url.endsWith('/decision')) return Promise.resolve({ data: { id: 5, status: 'approved' } })
      if (url.endsWith('/decision-bulk')) return Promise.resolve({ data: { decided: 2, skipped: [], status: 'approved' } })
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
    fireEvent.click((await screen.findAllByRole('button', { name: 'Onayla' }))[0])
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/shifts/leave/opening-balances/5/decision', { decision: 'approve' }))
  })

  it('vardiya amiri onaylayamaz', async () => {
    role = 'shift_supervisor'
    renderWithProviders(<OpeningBalancesPanel />)
    fireEvent.click(screen.getByText(/İZİN AÇILIŞ BAKİYELERİ/))
    expect((await screen.findAllByText('müdür onayı')).length).toBe(2)
    expect(screen.queryByRole('button', { name: 'Onayla' })).not.toBeInTheDocument()
  })

  it('onaylanırsa kalanı ve doğrulama notunu gösterir; tümünü seçip toplu onaylar', async () => {
    renderWithProviders(<OpeningBalancesPanel />)
    fireEvent.click(screen.getByText(/İZİN AÇILIŞ BAKİYELERİ/))
    expect(await screen.findByText(/İK Excel 30.09: işe giriş 2023-01-01/)).toBeInTheDocument()
    expect(screen.getAllByText(/onaylanırsa:/).length).toBe(2)
    fireEvent.click(screen.getByLabelText('Tümünü seç'))
    fireEvent.click(screen.getByRole('button', { name: /Seçilenleri onayla \(2\)/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/shifts/leave/opening-balances/decision-bulk', { ids: [5, 6], decision: 'approve' }))
  })

  it('vardiya amiri seçim kutusu görmez', async () => {
    role = 'shift_supervisor'
    renderWithProviders(<OpeningBalancesPanel />)
    fireEvent.click(screen.getByText(/İZİN AÇILIŞ BAKİYELERİ/))
    await screen.findByText('AYŞE KAYA')
    expect(screen.queryByLabelText('Tümünü seç')).not.toBeInTheDocument()
  })
})
