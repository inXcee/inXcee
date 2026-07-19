import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import api from '../../../shared/api/client.js'
import StaffPerformancePanel from './StaffPerformancePanel.jsx'
import { StaffSafetyPanel, StaffEquipmentPanel } from './StaffOperationalPanels.jsx'

describe('StaffOperationalPanels smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.post.mockResolvedValue({ data: { id: 25 } })
    api.get.mockImplementation(url => {
      if (url.includes('/performance/reviews')) return Promise.resolve({ data: [{ id: 1, period: '2026-Q2', total_score: 4, reviewed_at: '2026-06-01', strengths: 'Ekip uyumu' }] })
      if (url.includes('/performance/goals')) return Promise.resolve({ data: [{ id: 2, title: 'Sertifika tamamla', status: 'in_progress', progress: 40 }] })
      if (url.includes('/performance/positive')) return Promise.resolve({ data: { total: 2, items: [{ id: 3, reason: 'Fazla mesai', points: 2 }] } })
      if (url.includes('/safety/staff/')) return Promise.resolve({ data: [{ attendance_id: 9, title: 'Yüksekte çalışma', attended: 1, score: 90, cert_expires_at: '2027-01-01', session_date: '2026-01-01' }] })
      if (url.includes('/safety/accidents')) return Promise.resolve({ data: [] })
      if (url.includes('/inventory/checkouts/staff')) return Promise.resolve({ data: [{ id: 11, item_name: 'Baret', quantity: 1, returned_qty: 0, checked_out_at: '2026-05-01' }] })
      if (url.includes('/safety/kkd')) return Promise.resolve({ data: [{ id: 12, item_type: 'Eldiven', assigned_at: '2026-05-02' }] })
      return Promise.resolve({ data: [] })
    })
  })

  it('yeni hedef formunu açar ve API biçimine uygun kaydeder', async () => {
    renderWithProviders(<StaffPerformancePanel staffId={7} canManage />)
    fireEvent.click(await screen.findByRole('button', { name: /Yeni hedef/i }))
    fireEvent.change(screen.getByLabelText('Yeni hedef başlığı'), { target: { value: 'Ekip liderliği eğitimi' } })
    fireEvent.change(screen.getByLabelText('Yeni hedef tarihi'), { target: { value: '2026-12-31' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hedefi oluştur' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/performance/goals', expect.objectContaining({
      staff_id: 7,
      title: 'Ekip liderliği eğitimi',
      target_date: '2026-12-31',
    })))
  })

  it('performans paneli değerlendirme, hedef ve pozitif puanları render eder', async () => {
    renderWithProviders(<StaffPerformancePanel staffId={7} canManage />)
    expect(await screen.findByText('2026-Q2')).toBeInTheDocument()
    expect(await screen.findByText('Sertifika tamamla')).toBeInTheDocument()
    expect(await screen.findByText('Fazla mesai')).toBeInTheDocument()
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/performance/reviews?staff_id=7')
      expect(api.get).toHaveBeenCalledWith('/performance/goals?staff_id=7')
      expect(api.get).toHaveBeenCalledWith('/performance/positive/7')
    })
  })

  it('İSG paneli eğitim ve sertifika bilgisini gösterir', async () => {
    renderWithProviders(<StaffSafetyPanel staffId={7} />)
    expect(await screen.findByText('Yüksekte çalışma')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/safety/staff/7/training')
  })

  it('zimmet paneli envanter ve KKD kayıtlarını listeler', async () => {
    renderWithProviders(<StaffEquipmentPanel staffId={7} canManage />)
    expect(await screen.findByText(/Baret/)).toBeInTheDocument()
    expect(await screen.findByText(/Eldiven/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/inventory/checkouts/staff/7')
    expect(api.get).toHaveBeenCalledWith('/safety/kkd?staff_id=7')
  })
})
