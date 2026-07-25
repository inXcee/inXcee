import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BlockDetailSections from './BlockDetailSections.jsx'
import api from '../../shared/api/client.js'

vi.mock('../../shared/api/client.js', () => ({ default: { get: vi.fn(), patch: vi.fn(() => Promise.resolve({ data: { ok: true } })) } }))

const full = {
  block: 'M1',
  can: { faults: true, cleaning: true, rooms: true },
  faults: [
    { id: 1, location: 'M1 Kat 1 Oda 118', description: 'Kombi arızası', priority: 'high', status: 'open', technician_name: 'Teknik Ali' },
    { id: 2, location: 'M1 Kat 2 Oda 204', description: 'Musluk akıyor', priority: 'medium', status: 'in_progress', technician_name: null },
  ],
  cleaning: { total: 30, done: 22, skipped: 0, pending: 8, pct: 73 },
  rooms: [
    { id: 11, room_no: '101', floor: 1, status: 'active', active_beds: 6, occupied: 2, occupants: [
      { personnel_id: 501, full_name: 'Ahmet Yıldız', company: 'ACME İnşaat', bed_no: 1, assigned_at: '2026-05-02 10:00' },
      { personnel_id: 502, full_name: 'Mehmet Kaya', company: '', bed_no: 2, assigned_at: '2026-06-11 09:30' },
    ] },
    { id: 12, room_no: '102', floor: 1, status: 'active', active_beds: 6, occupied: 0, occupants: [] },
  ],
}

const renderSections = (props = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BlockDetailSections block="M1" {...props} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: full })
})

describe('BlockDetailSections', () => {
  it('arıza, temizlik ve oda bölümlerini getirir', async () => {
    renderSections()
    expect(await screen.findByText(/AÇIK ARIZALAR/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/campus-map/block/M1/detail')
    // Arızalar öncelik etiketiyle, açık başlar
    expect(screen.getByText('ACİL')).toBeInTheDocument()
    expect(screen.getByText('Kombi arızası')).toBeInTheDocument()
    expect(screen.getByText(/atanan: Teknik Ali/)).toBeInTheDocument()
    // Temizlik özeti
    expect(screen.getByText('%73')).toBeInTheDocument()
    expect(screen.getByText(/8 kaldı/)).toBeInTheDocument()
    expect(screen.getByText(/ODALAR VE KİŞİLER/)).toBeInTheDocument()
  })

  it('odaya tıklayınca o odadaki kişiler şirket ve giriş tarihiyle açılır', async () => {
    const user = userEvent.setup()
    renderSections()
    await user.click(await screen.findByText(/ODALAR VE KİŞİLER/))

    expect(screen.queryByText('Ahmet Yıldız')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /101/ }))

    expect(await screen.findByText('Ahmet Yıldız')).toBeInTheDocument()
    expect(screen.getByText(/ACME İnşaat · giriş 2026-05-02/)).toBeInTheDocument()
    // Şirketi olmayan kişide de bilgi kaybı olmasın
    expect(screen.getByText(/şirket yok/)).toBeInTheDocument()
  })

  it('kişiye tıklayınca onPersonClick çağrılır', async () => {
    const onPersonClick = vi.fn()
    const user = userEvent.setup()
    renderSections({ onPersonClick })
    await user.click(await screen.findByText(/ODALAR VE KİŞİLER/))
    await user.click(screen.getByRole('button', { name: /101/ }))
    await user.click(await screen.findByText('Ahmet Yıldız'))
    expect(onPersonClick).toHaveBeenCalledWith(501)
  })

  it('boş odada bilgilendirme gösterir', async () => {
    const user = userEvent.setup()
    renderSections()
    await user.click(await screen.findByText(/ODALAR VE KİŞİLER/))
    await user.click(screen.getByRole('button', { name: /102/ }))
    expect(await screen.findByText('Bu odada kayıtlı kişi yok.')).toBeInTheDocument()
  })

  it('yetkisi olmayan bölüm hiç render edilmez', async () => {
    api.get.mockResolvedValue({
      data: { block: 'M1', can: { faults: false, cleaning: true, rooms: false }, cleaning: { total: 4, done: 4, skipped: 0, pending: 0, pct: 100 } },
    })
    renderSections()
    expect(await screen.findByText(/BUGÜNKÜ TEMİZLİK/)).toBeInTheDocument()
    expect(screen.queryByText(/AÇIK ARIZALAR/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ODALAR VE KİŞİLER/)).not.toBeInTheDocument()
  })

  it('arıza yoksa bölüm yine görünür ama boş der', async () => {
    api.get.mockResolvedValue({
      data: { block: 'M2', can: { faults: true, cleaning: false, rooms: false }, faults: [] },
    })
    const user = userEvent.setup()
    renderSections()
    await user.click(await screen.findByText(/AÇIK ARIZALAR/))
    expect(await screen.findByText('Açık arıza yok.')).toBeInTheDocument()
  })
})

describe('BlockDetailSections — tek oda durumu (Faz C1)', () => {
  const openRoom = async (user) => {
    await user.click(await screen.findByText(/ODALAR VE KİŞİLER/))
    await user.click(screen.getByRole('button', { name: /101/ }))
  }

  it('yönetici tek odayı karantinaya alabilir (blok geneli değil)', async () => {
    const user = userEvent.setup()
    renderSections({ isManager: true })
    await openRoom(user)

    await user.click(await screen.findByRole('button', { name: /KARANTINA/ }))
    expect(api.patch).toHaveBeenCalledWith('/capacity/rooms/11/status', { status: 'quarantine' })
  })

  it('odanın mevcut durumu buton olarak gösterilmez', async () => {
    const user = userEvent.setup()
    renderSections({ isManager: true })
    await openRoom(user)
    // Oda zaten 'active' → AKTIF butonu olmamalı
    expect(screen.queryByRole('button', { name: /AKTIF/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /BAKIM/ })).toBeInTheDocument()
  })

  it('yönetici değilse oda durumu butonları çıkmaz', async () => {
    const user = userEvent.setup()
    renderSections({ isManager: false })
    await openRoom(user)
    expect(screen.queryByRole('button', { name: /KARANTINA/ })).not.toBeInTheDocument()
  })
})
