import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: { patch: vi.fn(() => Promise.resolve({ data: { ok: true } })) },
}))

import api from '../../shared/api/client.js'
import RoomStatePanel from './RoomStatePanel.jsx'

describe('housekeeping/RoomStatePanel smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('açık odayı not + bitiş tarihiyle kilitler', async () => {
    const onChanged = vi.fn()
    renderWithProviders(<RoomStatePanel room={{ id: 7, use_state: 'open' }} block="S1" roomNo="101" onChanged={onChanged} />)
    fireEvent.change(screen.getByPlaceholderText(/Kapatma\/kilit notu/), { target: { value: 'anahtar yok' } })
    fireEvent.click(screen.getByText(/Kilitli/))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/housekeeping/rooms/7/state',
      { use_state: 'locked', state_note: 'anahtar yok', state_until: null }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('kapalı odada açıklama gösterir, Açık yalnız durumu gönderir; vardiya ayrı kaydedilir', async () => {
    renderWithProviders(<RoomStatePanel room={{ id: 8, use_state: 'closed', state_note: 'boş', occupant_shift: null }}
      block="S1" roomNo="102" />)
    expect(screen.getByText(/Temizlik görevi açılmaz/)).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Açık/))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/housekeeping/rooms/8/state', { use_state: 'open' }))
    fireEvent.click(screen.getByText(/Gececi/))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/housekeeping/rooms/8/state', { occupant_shift: 'night' }))
  })
})
