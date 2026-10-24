import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import FieldTrackingPanel from './FieldTrackingPanel.jsx'

vi.mock('../../shared/api/client.js', () => ({ default: { get: vi.fn(), put: vi.fn() } }))
vi.mock('../../shared/components/ConfirmDialog.jsx', () => ({ confirmDialog: vi.fn(() => Promise.resolve(true)) }))

// Web "Saha takibi" (spec 2026-10-24-oda-qr-saha §Hedefler 7): kişi başı temizlik ve QR oranı, blok başına etiket
// kapsaması, açık yanlış-kapı kayıtları; QR zorunluluğunu yalnız müdür değiştirir.
const report = {
  date: '2026-10-24',
  enforcement: 'off',
  mismatches_open: 2,
  workers: [
    { worker_id: 1, full_name: 'Ayşe Saha', cleaned: 4, skipped: 1, qr_verified: 3, first_at: '2026-10-24 06:10:00', last_at: '2026-10-24 09:40:00' },
    { worker_id: 2, full_name: 'Mehmet Saha', cleaned: 0, skipped: 2, qr_verified: 0, first_at: null, last_at: null },
  ],
  blocks: [{ block: 'M1', locations: 68, verified: 10, installed: 5, printed: 3, stale: 1, damaged: 0, removed: 0, none: 49 }],
}

beforeEach(() => {
  api.get.mockResolvedValue({ data: report })
  api.put.mockResolvedValue({ data: { enforcement: 'verified_labels' } })
})

afterEach(() => vi.clearAllMocks())

describe('FieldTrackingPanel', () => {
  it('kişi başı temizlik ve QR yüzdesi; blok etiket kapsaması; açık yanlış kapı sayısı', async () => {
    renderWithProviders(<FieldTrackingPanel canManage={false} />)
    const ayse = (await screen.findByText('Ayşe Saha')).closest('tr')
    expect(within(ayse).getByText('4')).toBeInTheDocument()
    expect(within(ayse).getByText('%75')).toBeInTheDocument()
    const mehmet = screen.getByText('Mehmet Saha').closest('tr')
    expect(within(mehmet).getAllByText('—').length).toBeGreaterThan(0)
    const m1 = screen.getByText('M1').closest('tr')
    expect(within(m1).getByText('10')).toBeInTheDocument()
    expect(within(m1).getByText('49')).toBeInTheDocument()
    expect(screen.getByText(/2 yanlış kapı/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/housekeeping/field-report')
  })

  it('yönetici olmayan QR zorunluluğunu yalnız görür', async () => {
    renderWithProviders(<FieldTrackingPanel canManage={false} />)
    await screen.findByText('Ayşe Saha')
    expect(screen.queryByRole('combobox', { name: /QR zorunluluğu/ })).toBeNull()
    expect(screen.getByText(/QR zorunluluğu: Kapalı/)).toBeInTheDocument()
  })

  it('müdür QR zorunluluğunu onaydan sonra değiştirir', async () => {
    renderWithProviders(<FieldTrackingPanel canManage />)
    fireEvent.change(await screen.findByRole('combobox', { name: /QR zorunluluğu/ }), { target: { value: 'verified_labels' } })
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled())
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/housekeeping/field-qr-enforcement', { mode: 'verified_labels' }))
  })

  it('onay verilmezse ayar değişmez', async () => {
    confirmDialog.mockResolvedValueOnce(false)
    renderWithProviders(<FieldTrackingPanel canManage />)
    fireEvent.change(await screen.findByRole('combobox', { name: /QR zorunluluğu/ }), { target: { value: 'verified_labels' } })
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled())
    expect(api.put).not.toHaveBeenCalled()
  })
})
