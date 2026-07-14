import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import { useAuthStore } from '../../../shared/store/authStore.js'

const getMock = vi.fn(() => Promise.resolve({ data: [] }))
const postMock = vi.fn(() => Promise.resolve({ data: { ok: true } }))
const deleteMock = vi.fn(() => Promise.resolve({ data: { ok: true } }))
const patchMock = vi.fn(() => Promise.resolve({ data: { ok: true } }))
vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: (...args) => getMock(...args),
    post: (...args) => postMock(...args),
    delete: (...args) => deleteMock(...args),
    patch: (...args) => patchMock(...args),
  },
}))

import PuantajTab from './PuantajTab.jsx'

describe('PuantajTab smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ token: null, user: null })
    getMock.mockImplementation(() => Promise.resolve({ data: [] }))
    postMock.mockImplementation(() => Promise.resolve({ data: { ok: true } }))
    deleteMock.mockImplementation(() => Promise.resolve({ data: { ok: true } }))
    patchMock.mockImplementation(() => Promise.resolve({ data: { ok: true } }))
  })

  it('çökmeden render olur ve görünüm kontrollerini gösterir', () => {
    renderWithProviders(<PuantajTab departments={[]} />)
    expect(screen.getByText('ONAY')).toBeInTheDocument()
    expect(screen.getByText(/CSV İndir/)).toBeInTheDocument()
    expect(screen.getByText('📋 LİSTE')).toBeInTheDocument()
    expect(screen.getByText('🔎 KONTROL')).toBeInTheDocument()
    expect(screen.getByText('PUANTAJ KAPANIŞ KONTROLÜ')).toBeInTheDocument()
    expect(screen.getByText(/P → N/)).toBeInTheDocument()
  })

  it('onay masasında departman onay matrisi görünür (P4)', async () => {
    useAuthStore.setState({ user: { role: 'campus_manager' } })
    getMock.mockImplementation((url) => {
      if (url === '/shifts/puantaj/approval/overview') {
        return Promise.resolve({ data: {
          period: '2026-07', total_days: 31,
          all: { period_status: 'draft' },
          departments: [
            { dept_id: 1, name: 'Yemekhane', staff_count: 8, period_status: 'submitted', approved_days: 5, pending_days: 2, returned_days: 1, last_event_at: '2026-07-10 10:00:00', issues: { scheduled: 1, empty: 3, absent_no_reason: 0 } },
          ],
        } })
      }
      if (url === '/shifts/puantaj/approval') {
        return Promise.resolve({ data: { period: '2026-07', period_approval: { status: 'draft' }, daily_approvals: [], events: [] } })
      }
      return Promise.resolve({ data: [] })
    })
    renderWithProviders(<PuantajTab departments={[]} />)
    fireEvent.click(screen.getByText('ONAY'))
    expect(await screen.findByText('DEPARTMAN ONAY MATRISI')).toBeInTheDocument()
    expect(screen.getByText('Yemekhane')).toBeInTheDocument()
    expect(screen.getByText('5/31')).toBeInTheDocument()
  })

  it('kart kontrol sayaci istisna calisma alanini acar', async () => {
    useAuthStore.setState({ user: { role: 'campus_manager' } })
    getMock.mockImplementation((url) => {
      if (url === '/shifts/attendance/exceptions') {
        return Promise.resolve({ data: {
          rows: [{
            id: 45,
            staff_id: 1,
            full_name: 'Kart Test Personeli',
            dept_name: 'OTC',
            work_date: '2026-07-10',
            exception_type: 'late_arrival',
            severity: 'warning',
            message: '25 dakika gec giris',
            actual_check_in: '2026-07-10T03:25:00.000Z',
            actual_check_out: '2026-07-10T12:00:00.000Z',
          }],
          summary: { total: 1, by_type: { late_arrival: 1 }, by_severity: { warning: 1 } },
        } })
      }
      if (url === '/shifts/puantaj/approval') {
        return Promise.resolve({ data: { period_approval: { status: 'draft' }, daily_approvals: [], events: [] } })
      }
      return Promise.resolve({ data: [] })
    })

    renderWithProviders(<PuantajTab departments={[]} />)
    const button = await screen.findByRole('button', { name: 'KART KONTROL 1' })
    fireEvent.click(button)

    expect(await screen.findByText('KART / KİOSK KONTROLÜ')).toBeInTheDocument()
    expect(screen.getByText('Kart Test Personeli')).toBeInTheDocument()
    expect(screen.getByText('25 dakika gec giris')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AYI UZLAŞTIR' })).toBeInTheDocument()
  })

  it('calendar keeps day entries when days endpoint returns full payload', async () => {
    getMock.mockImplementation((url) => {
      if (url === '/shifts/puantaj') {
        return Promise.resolve({ data: [
          { id: 1, full_name: 'Ali Test', department_id: 1, dept_name: 'OTC', worked_days: 1, off_days: 1 },
        ] })
      }
      if (url === '/shifts/puantaj/days') {
        return Promise.resolve({ data: {
          month: '2026-07',
          days: {
            1: [
              { date: '2026-07-01', day_of_week: 3, status: 'worked' },
              { date: '2026-07-02', day_of_week: 4, status: 'off' },
            ],
          },
        } })
      }
      if (url === '/shifts/holidays') return Promise.resolve({ data: [] })
      if (url === '/shifts/puantaj/codes') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })

    renderWithProviders(<PuantajTab departments={[]} />)
    fireEvent.click(screen.getAllByText(/TAKV/)[0])

    const workedCell = await screen.findByTitle(/Ali Test.*2026-07-01/)
    const offCell = await screen.findByTitle(/Ali Test.*2026-07-02/)
    expect(workedCell).toHaveTextContent('N')
    expect(offCell).toHaveTextContent('H')
  })

  it('calendar day header opens daily breakdown sheet', async () => {
    getMock.mockImplementation((url) => {
      if (url === '/shifts/puantaj') {
        return Promise.resolve({ data: [
          { id: 1, full_name: 'Ali Test', department_id: 1, dept_name: 'OTC', worked_days: 1 },
          { id: 2, full_name: 'Ayse Test', department_id: 2, dept_name: 'FPU', leave_days: 1 },
        ] })
      }
      if (url === '/shifts/puantaj/days') {
        return Promise.resolve({ data: {
          month: '2026-07',
          days: {
            1: [{ date: '2026-07-01', day_of_week: 3, status: 'worked', work_location_name: 'OTC Lokal' }],
            2: [{ date: '2026-07-01', day_of_week: 3, status: 'on_leave', leave_type: 'sick', detail_note: 'Raporlu' }],
          },
        } })
      }
      if (url === '/shifts/holidays') return Promise.resolve({ data: [] })
      if (url === '/shifts/puantaj/codes') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })

    renderWithProviders(<PuantajTab departments={[]} />)
    fireEvent.click(screen.getAllByText(/TAKV/)[0])

    const dayButton = await screen.findByTitle('2026-07-01 gün dökümünü aç')
    fireEvent.click(dayButton)

    const title = await screen.findByText('GUN DOKUMU')
    expect(title).toBeInTheDocument()
    expect(title.closest('[style*="overflow-y: auto"]')).toBeTruthy()
    expect(screen.getByText('DEPARTMAN')).toBeInTheDocument()
    expect(screen.getByText('CALISMA NOKTASI')).toBeInTheDocument()
    expect(screen.getAllByText('Ali Test').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ayse Test').length).toBeGreaterThan(0)
  })

  it('control daily row opens the same daily breakdown sheet', async () => {
    getMock.mockImplementation((url) => {
      if (url === '/shifts/puantaj') {
        return Promise.resolve({ data: [
          { id: 1, full_name: 'Ali Test', department_id: 1, dept_name: 'OTC', worked_days: 1 },
          { id: 2, full_name: 'Ayse Test', department_id: 2, dept_name: 'FPU', worked_days: 0 },
        ] })
      }
      if (url === '/shifts/puantaj/days') {
        return Promise.resolve({ data: {
          month: '2026-07',
          days: {
            1: [{ date: '2026-07-01', day_of_week: 3, status: 'worked', work_location_name: 'OTC Lokal' }],
            2: [{ date: '2026-07-01', day_of_week: 3, status: 'scheduled', work_location_name: 'FPU Yemekhane' }],
          },
        } })
      }
      if (url === '/shifts/holidays') return Promise.resolve({ data: [] })
      if (url === '/shifts/puantaj/codes') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })

    renderWithProviders(<PuantajTab departments={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kontrol' }))

    expect(await screen.findByRole('button', { name: /SORUN:/ })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'P:1' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'P:1' }))
    expect(screen.getByText('1/31 gun')).toBeInTheDocument()

    const [openDay] = await screen.findAllByTitle('2026-07-01 gun dokumunu ac')
    fireEvent.click(openDay)

    expect(await screen.findByText('GUN DOKUMU')).toBeInTheDocument()
    expect((await screen.findAllByText('FPU Yemekhane')).length).toBeGreaterThan(0)
  })

  it('right click opens puantaj day detail editor with leave and document fields', async () => {
    useAuthStore.setState({ user: { role: 'campus_manager' } })
    getMock.mockImplementation((url) => {
      if (url === '/shifts/puantaj') {
        return Promise.resolve({ data: [
          { id: 1, full_name: 'Ali Test', department_id: 1, dept_name: 'OTC', worked_days: 0, leave_days: 1 },
        ] })
      }
      if (url === '/shifts/puantaj/days') {
        return Promise.resolve({ data: {
          month: '2026-07',
          days: {
            1: [
              { date: '2026-07-01', day_of_week: 3, status: 'on_leave', leave_type: 'unpaid', leave_hours: 4, detail_note: 'Saatlik izin' },
            ],
          },
        } })
      }
      if (url === '/shifts/holidays') return Promise.resolve({ data: [] })
      if (url === '/shifts/puantaj/codes') return Promise.resolve({ data: [] })
      if (url === '/shifts/period-locks') return Promise.resolve({ data: [] })
      if (url === '/shifts/puantaj/approval') {
        return Promise.resolve({ data: { period: '2026-07', period_approval: { status: 'draft' }, daily_approvals: [], events: [] } })
      }
      return Promise.resolve({ data: [] })
    })

    renderWithProviders(<PuantajTab departments={[]} />)
    fireEvent.click(screen.getAllByText(/TAKV/)[0])

    const cell = await screen.findByTitle(/Ali Test.*2026-07-01/)
    fireEvent.contextMenu(cell)

    expect(await screen.findByText('PUANTAJ DURUMU')).toBeInTheDocument()
    expect(screen.getByText('IZIN TURU')).toBeInTheDocument()
    expect(screen.getByText('SAATLIK IZIN')).toBeInTheDocument()
    expect(screen.getByText('BELGE (JPG/PNG/WEBP/PDF)')).toBeInTheDocument()
  })

  it('calendar keeps edited code visible and marks it when save fails', async () => {
    useAuthStore.setState({ user: { role: 'campus_manager' } })
    postMock.mockRejectedValueOnce(new Error('offline'))
    getMock.mockImplementation((url) => {
      if (url === '/shifts/puantaj') {
        return Promise.resolve({ data: [
          { id: 1, full_name: 'Ali Test', department_id: 1, dept_name: 'OTC', worked_days: 0 },
        ] })
      }
      if (url === '/shifts/puantaj/days') {
        return Promise.resolve({ data: {
          month: '2026-07',
          days: { 1: [] },
        } })
      }
      if (url === '/shifts/holidays') return Promise.resolve({ data: [] })
      if (url === '/shifts/puantaj/codes') return Promise.resolve({ data: [] })
      if (url === '/shifts/period-locks') return Promise.resolve({ data: [] })
      if (url === '/shifts/puantaj/approval') {
        return Promise.resolve({ data: { period: '2026-07', period_approval: { status: 'draft' }, daily_approvals: [], events: [] } })
      }
      return Promise.resolve({ data: [] })
    })

    renderWithProviders(<PuantajTab departments={[]} />)
    fireEvent.click(screen.getAllByText(/TAKV/)[0])

    const cell = await screen.findByTitle(/Ali Test.*2026-07-01/)
    fireEvent.click(cell)

    await waitFor(() => expect(cell).toHaveTextContent('N'))
    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/shifts/schedule', expect.objectContaining({
      entries: [expect.objectContaining({ staff_id: 1, work_date: '2026-07-01', expected_version: 0 })],
    })))
    expect(await screen.findByText(/KAYDEDILEMEYEN 1 HÜCRE VAR/)).toBeInTheDocument()
  })

  it('kod yönetiminde bordro ve belge kurallarını gösterir', async () => {
    useAuthStore.setState({ user: { role: 'campus_manager' } })
    getMock.mockImplementation((url) => {
      if (url === '/shifts/puantaj/codes') return Promise.resolve({ data: [{
        id: 1, code: 'N', label: 'Normal çalıştı', status: 'worked', color_hex: '22C55E',
        is_builtin: 1, is_active: 1, is_paid: 1, sgk_day_factor: 1, day_multiplier: 1,
        hour_multiplier: 1, overtime_effect: 'eligible', requires_document: 0, requires_reason: 0,
      }] })
      if (url === '/shifts/puantaj/approval') return Promise.resolve({ data: { period_approval: { status: 'draft' }, daily_approvals: [], events: [] } })
      return Promise.resolve({ data: [] })
    })

    renderWithProviders(<PuantajTab departments={[]} />)
    fireEvent.click(await screen.findByRole('button', { name: /KODLAR/ }))
    expect(await screen.findByText('PUANTAJ KODLARI')).toBeInTheDocument()
    expect(screen.getByTitle('Sosyal güvenlik gün etkisi')).toBeInTheDocument()
    expect(screen.getByText('Belge')).toBeInTheDocument()
    expect(screen.getByText('Gerekçe')).toBeInTheDocument()
  })
})
