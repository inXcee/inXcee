import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import StaffTab from './tabs/StaffTab.jsx'
import StaffDetailPanel from './StaffDetailPanel.jsx'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'

describe('shifts staff smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useAuthStore.setState({ user: null, token: null })
  })

  it('StaffTab çökmeden render olur', () => {
    renderWithProviders(<StaffTab departments={[]} onPersonClick={() => {}} />)
    expect(screen.getByText('TOPLAM PERSONEL')).toBeInTheDocument()
  })

  it('StaffDetailPanel çökmeden render olur (veri yok)', async () => {
    renderWithProviders(<StaffDetailPanel staffId={1} onClose={() => {}} />)
    expect(await screen.findByText('PERSONEL DOSYASI YÜKLENEMEDİ')).toBeInTheDocument()
  })

  it('personel dizini tablo, risk rozeti, seçim ve kart görünümünü destekler', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'campus_manager' } })
    api.get.mockImplementation(url => {
      if (url === '/shifts/staff') {
        return Promise.resolve({ data: [{
          id: 44,
          full_name: 'Ayşe Yılmaz',
          position: 'Vardiya Lideri',
          department_id: 2,
          dept_name: 'Operasyon',
          role_id: 3,
          role_name: 'Lider',
          primary_work_location_id: 5,
          primary_work_location_name: 'Ana Saha',
          gender: 'female',
          phone: '05550000000',
          is_active: 1,
          missing_documents: 2,
          expired_documents: 1,
          open_followups: 3,
          overdue_followups: 1,
          open_attendance_exceptions: 1,
          equipment_count: 2,
          active_inventory: 1,
          active_kkd: 1,
          risk_count: 4,
        }] })
      }
      if (url === '/shifts/staff/quality') return Promise.resolve({ data: { summary: {}, rows: [] } })
      return Promise.resolve({ data: [] })
    })

    renderWithProviders(<StaffTab departments={[{ id: 2, name: 'Operasyon' }]} onPersonClick={() => {}} />)

    expect(await screen.findByText('Ayşe Yılmaz')).toBeInTheDocument()
    expect(screen.getByText('1 süresi dolmuş belge')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Ayşe Yılmaz seç'))
    expect(screen.getByText('1 personel seçildi')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kartlar' }))
    expect(screen.getByRole('button', { name: 'Personel Dosyası' })).toBeInTheDocument()
  })
})
