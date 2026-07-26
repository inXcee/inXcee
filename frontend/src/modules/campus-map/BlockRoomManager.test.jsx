import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import BlockRoomManager from './BlockRoomManager.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))
vi.mock('../../shared/components/ConfirmDialog.jsx', () => ({
  confirmDialog: vi.fn(),
}))

const rooms = [
  {
    id: 21, room_no: '101', floor: 1, status: 'active', capacity: 4, active_beds: 4,
    occupied: 1, notes: 'Sessiz oda',
    occupants: [{ personnel_id: 71, full_name: 'Ayşe Demir', company: 'Yapı AŞ', bed_no: 1 }],
  },
  {
    id: 22, room_no: '102', floor: 1, status: 'active', capacity: 4, active_beds: 4,
    occupied: 1, notes: null,
    occupants: [{ personnel_id: 72, full_name: 'Burak Can', company: 'Beton AŞ', bed_no: 1 }],
  },
  {
    id: 23, room_no: '201', floor: 2, status: 'maintenance', capacity: 4, active_beds: 4,
    occupied: 0, notes: null, occupants: [],
  },
]

function renderManager(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BlockRoomManager
        block="M2"
        rooms={rooms}
        selectedRoomId={21}
        onRoomChange={vi.fn()}
        onNavigate={vi.fn()}
        onDataChanged={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('BlockRoomManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmDialog.mockResolvedValue(true)
    api.get.mockResolvedValue({ data: [] })
    api.patch.mockResolvedValue({ data: { ok: true } })
    api.post.mockResolvedValue({ data: { ok: true } })
  })

  it('oda, kişi, filtre, not ve blok bağlamlı hızlı akışları gösterir', () => {
    renderManager({ canEditRoom: true })
    expect(screen.getByText('ODA 101')).toBeInTheDocument()
    expect(screen.getByText('Ayşe Demir')).toBeInTheDocument()
    expect(screen.getByLabelText('Kat filtresi')).toBeInTheDocument()
    expect(screen.getByLabelText('Oda durumu filtresi')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Sessiz oda')).toBeInTheDocument()
    expect(screen.getByText('CHECK-IN')).toBeInTheDocument()
    expect(screen.getByText('TOPLU')).toBeInTheDocument()
    expect(screen.queryByText(/Vardiya/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Envanter/i)).not.toBeInTheDocument()
  })

  it('vardiya sorumlusuna oda durum ve yatak yönetimini göstermez', () => {
    renderManager({ canEditRoom: false })
    expect(screen.queryByRole('button', { name: 'BAKIM' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Aktif yatağı azalt')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'TAŞI' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ÇIKAR' })).toBeInTheDocument()
  })

  it('kişi taşıma için etki önizlemesi alır ve 30 saniyelik geri alma sunar', async () => {
    const user = userEvent.setup()
    renderManager()

    await user.click(screen.getByRole('button', { name: 'TAŞI' }))
    await user.click(screen.getByRole('button', { name: 'Taşıma hedef oda 102' }))
    await user.click(screen.getByRole('button', { name: '102 ODASINA TAŞI' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/capacity/reassign', {
      personnel_id: 71,
      room_id: 22,
    }))
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Kişi Taşıma Önizlemesi',
    }))
    expect(await screen.findByRole('button', { name: /GERİ AL/ })).toBeInTheDocument()
    expect(screen.getByText('30 sn içinde')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /GERİ AL/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/capacity/reassign', {
      personnel_id: 71,
      room_id: 21,
    }))
  })

  it('iki kişiyi odalar arasında takas eder', async () => {
    const user = userEvent.setup()
    renderManager()

    await user.click(screen.getByRole('button', { name: 'TAKAS' }))
    await user.click(screen.getByRole('button', { name: 'Takas hedef oda 102' }))
    await user.click(screen.getByRole('button', { name: /Burak Can/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/capacity/swap', {
      person_a_id: 71,
      person_b_id: 72,
    }))
  })

  it('yönetici oda durumunu etki önizlemesiyle değiştirir', async () => {
    const user = userEvent.setup()
    renderManager({ canEditRoom: true })

    await user.click(screen.getByRole('button', { name: 'BAKIM' }))

    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Oda Durumu Etki Önizlemesi',
      body: expect.stringContaining('1 kişi odadan çıkarılacak'),
    }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/capacity/rooms/21/status', {
      status: 'maintenance',
    }))
  })

  it('kişi aramasından seçilen personeli odaya yerleştirir', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({
      data: [{ id: 91, full_name: 'Cem Kaya', company: 'Yapı AŞ', room_id: null, block: null, room_no: null }],
    })
    renderManager()

    await user.type(screen.getByLabelText('Odaya yerleştirilecek kişiyi ara'), 'Cem')
    await user.click(await screen.findByRole('button', { name: /Cem Kaya/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/capacity/reassign', {
      personnel_id: 91,
      room_id: 21,
    }))
  })
})
