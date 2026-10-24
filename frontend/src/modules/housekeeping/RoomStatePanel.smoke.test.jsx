import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: { patch: vi.fn(() => Promise.resolve({ data: { ok: true } })) },
}))

import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import RoomStatePanel from './RoomStatePanel.jsx'

describe('housekeeping/RoomStatePanel smoke', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => useAuthStore.setState({ user: null }))

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

  // Saha ekranı: oda doluluğu webden de verilir (müdür + amir); saha personelinin işaretiyle aynı alan
  it('amir doluluk satırında Boş seçince oda doluluğunu yazar', async () => {
    useAuthStore.setState({ user: { id: 2, role: 'shift_supervisor' } })
    renderWithProviders(<RoomStatePanel room={{ id: 9, use_state: 'open', occupancy: null }} block="S1" roomNo="103" />)
    expect(screen.getByText('DOLULUK')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Boş/ }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/housekeeping/rooms/9/occupancy', { occupancy: 'empty' }))
  })

  it('doluluk satırı meydancıya ve kapalı odada gösterilmez', () => {
    useAuthStore.setState({ user: { id: 5, role: 'housekeeper' } })
    const { unmount } = renderWithProviders(<RoomStatePanel room={{ id: 10, use_state: 'open' }} block="S1" roomNo="104" />)
    expect(screen.queryByText('DOLULUK')).toBeNull()
    unmount()
    useAuthStore.setState({ user: { id: 1, role: 'campus_manager' } })
    renderWithProviders(<RoomStatePanel room={{ id: 11, use_state: 'closed' }} block="S1" roomNo="105" />)
    expect(screen.queryByText('DOLULUK')).toBeNull()
  })
})
