import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import { useAuthStore } from '../../shared/store/authStore.js'

vi.mock('../../shared/components/ConfirmDialog.jsx', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('./api.js', () => ({
  laundryApi: {
    getCardSettings: vi.fn(() => Promise.resolve({ intake_required: false, delivery_required: false })),
    updateCardSetting: vi.fn(),
  },
}))

import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { laundryApi } from './api.js'
import { CardSystemSettings } from './LaundrySettings.jsx'

describe('Çamaşır kart sistemi ayarları', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    laundryApi.getCardSettings.mockResolvedValue({ intake_required: false, delivery_required: false })
    useAuthStore.setState({ user: { id: 1, role: 'campus_manager' } })
  })

  it('iki anahtarı bağımsız tutar ve açmadan önce dağıtım onayı ister', async () => {
    laundryApi.updateCardSetting.mockResolvedValue({ intake_required: true, delivery_required: false })
    renderWithProviders(<CardSystemSettings />)
    const intake = await screen.findByRole('switch', { name: 'Kabulde kart zorunlu' })
    const delivery = screen.getByRole('switch', { name: 'Teslimde kart zorunlu' })
    fireEvent.click(intake)
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled())
    await waitFor(() => expect(laundryApi.updateCardSetting).toHaveBeenCalledWith('intake', true))
    expect(intake).toHaveAttribute('aria-checked', 'true')
    expect(delivery).toHaveAttribute('aria-checked', 'false')
  })

  it('API hatasında anahtarı eski değerine döndürür ve açık hata gösterir', async () => {
    laundryApi.updateCardSetting.mockRejectedValue({ response: { data: { error: 'Yetki reddedildi' } } })
    renderWithProviders(<CardSystemSettings />)
    const intake = await screen.findByRole('switch', { name: 'Kabulde kart zorunlu' })
    fireEvent.click(intake)
    expect(await screen.findByText('Yetki reddedildi')).toBeInTheDocument()
    expect(intake).toHaveAttribute('aria-checked', 'false')
  })

  it('çamaşır rolüne ayarları salt okunur gösterir', async () => {
    useAuthStore.setState({ user: { id: 2, role: 'laundry' } })
    renderWithProviders(<CardSystemSettings />)
    expect(await screen.findByText('Salt okunur')).toBeInTheDocument()
    expect(await screen.findByRole('switch', { name: 'Kabulde kart zorunlu' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Teslimde kart zorunlu' })).toBeDisabled()
  })
})
