import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../api.js', () => ({
  laundryApi: {
    getCardSettings: vi.fn(),
    batchDeliver: vi.fn(),
    verifyCard: vi.fn(),
  },
}))

import { laundryApi } from '../api.js'
import BatchDeliveryModal from './BatchDeliveryModal.jsx'

describe('Masaüstü toplu teslim kart kapısı', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    laundryApi.getCardSettings.mockResolvedValue({ intake_required: false, delivery_required: true })
    laundryApi.batchDeliver.mockResolvedValue({ card_warning: null })
  })

  it('kart zorunluyken farklı odaları tek işlemde engeller', async () => {
    renderWithProviders(<BatchDeliveryModal
      items={[{ id: 1, room_id: 10 }, { id: 2, room_id: 20 }]}
      onClose={() => {}} onSuccess={() => {}}
    />)
    expect(await screen.findByText(/farklı odaların kayıtları birlikte teslim edilemez/)).toBeInTheDocument()
    expect(laundryApi.batchDeliver).not.toHaveBeenCalled()
  })

  it('aynı oda için tek gerekçeyi bütün seçili kayıtlara gönderir', async () => {
    const onSuccess = vi.fn()
    renderWithProviders(<BatchDeliveryModal
      items={[{ id: 1, room_id: 10 }, { id: 2, room_id: 10 }]}
      onClose={() => {}} onSuccess={onSuccess}
    />)
    await screen.findByLabelText('Çamaşır kartı doğrulama')
    fireEvent.change(screen.getByPlaceholderText('Teslim alan adı'), { target: { value: 'Ali Veli' } })
    fireEvent.change(screen.getByLabelText('Kart yoksa gerekçe'), { target: { value: 'kart kayıp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Teslim Et (2)' }))
    await waitFor(() => expect(laundryApi.batchDeliver).toHaveBeenCalledWith({
      item_ids: [1, 2], delivered_to: 'Ali Veli', card_override_reason: 'kart kayıp',
    }))
    expect(onSuccess).toHaveBeenCalled()
  })
})
