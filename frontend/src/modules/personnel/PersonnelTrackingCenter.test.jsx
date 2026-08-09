import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import PersonnelTrackingCenter from './PersonnelTrackingCenter.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

const overview = {
  kpis: {
    active: 2, offboarding: 0, exited: 1, undated_exited: 2, hired: 1, permanent_movements: 1,
    temporary_project_work: 1, shift_changes: 3, annual_leave_days: 2, sick_leave_days: 1,
    other_leave_days: 0, leave_hours: 4, overtime_hours: 12, absent_days: 0,
    open_alerts: 1, overdue_alerts: 0, critical_alerts: 0,
  },
  trends: [{ month: '2026-08', shift_changes: 3, movements: 1, exits: 1 }],
}

const trackingPerson = {
  id: 44, full_name: 'Zeynep Kaya', employment_status: 'active', project_id: 8, project_name: 'FPU', department_id: 2,
  department_name: 'Operasyon', annual_leave_days: 2, other_leave_days: 1, leave_hours: 4, sick_leave_days: 1, sick_occurrences: 1, overtime_hours: 12,
  absent_days: 0, shift_changes: 3, permanent_movements: 1, open_alerts: 1,
}
const trackingPersonLow = {
  id: 45, full_name: 'Cem Akın', employment_status: 'active', project_id: null, project_name: null, department_id: 2,
  department_name: 'Operasyon', annual_leave_days: 0, other_leave_days: 0, leave_hours: 0, sick_leave_days: 0,
  sick_occurrences: 0, overtime_hours: 2, absent_days: 0, shift_changes: 0, permanent_movements: 0, open_alerts: 0,
}

const person = {
  staff_id: 44, full_name: 'Ayşe Yılmaz', position: 'Vardiya Lideri', project_name: 'FPU',
  department_name: 'Operasyon', employment_status: 'active', status: 'approved', record_count: 2,
  total_quantity: 3, day_total: 3, hour_total: 0, last_occurred_at: '2026-08-03',
}

function drilldown(params = {}) {
  const view = params.view || 'people'
  const empty = params.metric === 'absence'
  return {
    metric: params.metric, definition: params.metric === 'leave' ? 'Seçili dönemle çakışan izin ve rapor kayıtları' : 'Metrik tanımı',
    scope: params.metric === 'active' ? 'current' : 'period', period: { from: '2026-07-11', to: '2026-08-09' }, view,
    summary: { primary_value: empty ? 0 : 3, primary_unit: params.metric === 'leave' ? 'day' : 'record', people_count: empty ? 0 : 1, record_count: empty ? 0 : 2, day_total: params.metric === 'leave' ? 3 : 0, hour_total: 0, undated_count: params.metric === 'exited' ? 2 : 0 },
    breakdowns: {
      status: empty ? [] : [{ key: 'approved', value: 2 }],
      subtype: empty ? [] : [{ key: 'annual', count: 1, quantity: 3 }],
      project: empty ? [] : [{ key: 'FPU', id: 8, count: 2, quantity: 3 }],
      department: empty ? [] : [{ key: 'Operasyon', id: 2, count: 2, quantity: 3 }],
    },
    items: empty ? [] : view === 'people' ? [person] : [{ ...person, record_id: 91, source_type: 'leave_request', occurred_at: '2026-08-01', end_at: '2026-08-03', subtype: 'annual', quantity: 3, unit: 'day', reason: 'Yıllık izin', actor_name: 'Müdür' }],
    total: empty ? 0 : view === 'people' ? 1 : 2, page: Number(params.page || 1), limit: 50,
  }
}

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="geçerli adres">{location.pathname}{location.search}</output>
}

function Harness({ onPersonClick = vi.fn() }) {
  return <><PersonnelTrackingCenter projects={[{ id: 8, name: 'FPU' }]} departments={[{ id: 2, name: 'Operasyon' }]} onPersonClick={onPersonClick} /><LocationProbe /></>
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: { id: 1, role: 'campus_manager', full_name: 'Müdür' } })
  api.get.mockImplementation((url, config = {}) => {
    if (url === '/personnel/tracking/overview') return Promise.resolve({ data: overview })
    if (url === '/personnel/tracking/people') return Promise.resolve({ data: { total: 2, items: [trackingPerson, trackingPersonLow] } })
    if (url === '/personnel/tracking/events') return Promise.resolve({ data: { total: 0, items: [] } })
    if (url === '/personnel/tracking/alerts') return Promise.resolve({ data: { items: [] } })
    if (url === '/personnel/tracking/drilldown') return Promise.resolve({ data: drilldown(config.params) })
    return Promise.resolve({ data: [] })
  })
})

describe('Personel Takip Merkezi ayrıntı paneli', () => {
  it('KPI kartlarını gerçek buton yapar ve izin detayını onaylı kayıtlarla açar', async () => {
    renderWithProviders(<Harness />, { route: '/shifts?tab=staff&view=tracking' })
    const leaveButton = await screen.findByRole('button', { name: 'İzin / rapor ayrıntısını aç' })
    expect(leaveButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(leaveButton)
    expect(await screen.findByRole('dialog', { name: 'İzin ve raporlar' })).toBeInTheDocument()
    expect(leaveButton).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/personnel/tracking/drilldown', expect.objectContaining({ params: expect.objectContaining({ metric: 'leave', view: 'people', record_status: 'approved' }) })))
    expect(screen.getByLabelText('geçerli adres')).toHaveTextContent('metric=leave')
    expect(screen.getByLabelText('geçerli adres')).toHaveTextContent('metric_status=approved')
    expect(await screen.findByText('Ayşe Yılmaz')).toBeInTheDocument()
  })

  it('URL içindeki metrik, kayıt görünümü ve durum seçimini yenilemede geri yükler', async () => {
    renderWithProviders(<Harness />, { route: '/shifts?tab=staff&view=tracking&metric=overtime&metric_view=records&metric_status=recorded&metric_page=1' })
    expect(await screen.findByRole('dialog', { name: 'Fazla mesai' })).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: /Kayıtlar/ })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('button', { name: 'Kayıtlı' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/personnel/tracking/drilldown', expect.objectContaining({ params: expect.objectContaining({ metric: 'overtime', view: 'records', record_status: 'recorded' }) })))
  })

  it('sekme ve kayıt durumu seçimlerini URL ile API sorgusuna taşır', async () => {
    renderWithProviders(<Harness />, { route: '/shifts?metric=leave&metric_view=people&metric_status=approved' })
    await screen.findByRole('dialog', { name: 'İzin ve raporlar' })
    fireEvent.click(await screen.findByRole('tab', { name: /Kayıtlar/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Bekleyen' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/personnel/tracking/drilldown', expect.objectContaining({ params: expect.objectContaining({ view: 'records', record_status: 'pending' }) })))
    expect(screen.getByLabelText('geçerli adres')).toHaveTextContent('metric_view=records')
    expect(screen.getByLabelText('geçerli adres')).toHaveTextContent('metric_status=pending')
  })

  it('tür, proje ve departman kırılımlarını URL korumalı ayrıntı filtrelerine dönüştürür', async () => {
    renderWithProviders(<Harness />, { route: '/shifts?metric=leave&metric_view=records&metric_status=approved' })
    await screen.findByRole('dialog', { name: 'İzin ve raporlar' })

    fireEvent.click(await screen.findByRole('button', { name: 'Tür: Yıllık izin ile filtrele (1)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Proje: FPU ile filtrele (2)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Departman: Operasyon ile filtrele (2)' }))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/personnel/tracking/drilldown', expect.objectContaining({
      params: expect.objectContaining({ subtype: 'annual', project_id: '8', department_id: '2' }),
    })))
    const address = screen.getByLabelText('geçerli adres')
    expect(address).toHaveTextContent('metric_subtype=annual')
    expect(address).toHaveTextContent('metric_project_id=8')
    expect(address).toHaveTextContent('metric_department_id=2')
    expect(await screen.findByLabelText('Etkin ayrıntı filtreleri')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Tür filtresini temizle' }))
    await waitFor(() => expect(address).not.toHaveTextContent('metric_subtype='))
    expect(address).toHaveTextContent('metric_project_id=8')
  })

  it('sıfır değerli KPI için anlamlı boş durum açar', async () => {
    renderWithProviders(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: 'Devamsızlık ayrıntısını aç' }))
    expect(await screen.findByRole('dialog', { name: 'Devamsızlıklar' })).toBeInTheDocument()
    expect(await screen.findByText('Bu kapsamda kayıt yok.')).toBeInTheDocument()
  })

  it('Escape ile kapanır, temel filtreleri korur ve odağı açan karta döndürür', async () => {
    renderWithProviders(<Harness />, { route: '/shifts?tab=staff&view=tracking&project_id=8' })
    const button = await screen.findByRole('button', { name: 'Aktif ayrıntısını aç' })
    fireEvent.click(button)
    await screen.findByRole('dialog', { name: 'Aktif personel' })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('geçerli adres')).toHaveTextContent('project_id=8')
    expect(screen.getByLabelText('geçerli adres')).not.toHaveTextContent('metric=')
    await waitFor(() => expect(button).toHaveFocus())
  })

  it('aylık trend ve proje dağılımını URL korumalı ayrıntıya bağlar', async () => {
    renderWithProviders(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: '2026-08: 5 hareketi göster' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/personnel/tracking/drilldown', expect.objectContaining({ params: expect.objectContaining({ metric: 'movement', view: 'records', bucket: '2026-08' }) })))
    fireEvent.click(screen.getAllByRole('button', { name: 'Detay panelini kapat' })[0])
    fireEvent.click(await screen.findByRole('button', { name: 'FPU: 1 personeli göster' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/personnel/tracking/drilldown', expect.objectContaining({ params: expect.objectContaining({ metric: 'people', project_id: '8' }) })))
  })

  it('personel tablosundaki mesai hücresini yalnız o kişinin ham kayıtlarıyla açar', async () => {
    renderWithProviders(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: 'Zeynep Kaya fazla mesai detayını aç' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/personnel/tracking/drilldown', expect.objectContaining({ params: expect.objectContaining({ metric: 'overtime', view: 'records', staff_id: '44', record_status: 'recorded' }) })))
    expect(screen.getByLabelText('geçerli adres')).toHaveTextContent('staff_id=44')
  })

  it('karşılaştırmayı en çok/en az sıralar, URL’de korur ve liderden ham kaydı açar', async () => {
    renderWithProviders(<Harness />)
    expect(await screen.findByRole('tab', { name: 'İzin' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/1 personelde kayıt/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'En az ↑' }))
    await waitFor(() => expect(screen.getByLabelText('geçerli adres')).toHaveTextContent('compare_order=asc'))
    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Cem Akın')

    fireEvent.click(screen.getByRole('tab', { name: 'Mesai' }))
    expect(screen.getByLabelText('geçerli adres')).toHaveTextContent('compare_metric=overtime')
    fireEvent.click(await screen.findByRole('button', { name: 'Zeynep Kaya Mesai detayını aç' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/personnel/tracking/drilldown', expect.objectContaining({
      params: expect.objectContaining({ metric: 'overtime', view: 'records', staff_id: '44', sort: 'quantity', order: 'desc' }),
    })))
  })

  it('sütun başlığından sıralar ve yalnız hareketi olan personeli gösterebilir', async () => {
    renderWithProviders(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: 'Rapor sütununu en çoğa sırala' }))
    expect(screen.getByLabelText('geçerli adres')).toHaveTextContent('compare_metric=report')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Yalnız hareketi olanlar' }))
    await waitFor(() => expect(screen.getByLabelText('geçerli adres')).toHaveTextContent('compare_nonzero=1'))
    expect(screen.getByRole('row', { name: /Zeynep Kaya/ })).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Cem Akın/ })).not.toBeInTheDocument()
  })

  it('panel satırında kaynak ekran ve önceden doldurulmuş görev bağlantıları sunar', async () => {
    renderWithProviders(<Harness />, { route: '/shifts?metric=leave&metric_view=records&metric_status=approved' })
    expect(await screen.findByRole('link', { name: 'Kaynağa Git' })).toHaveAttribute('href', '/shifts?tab=leave&staff=44')
    const taskLink = screen.getByRole('link', { name: '+ Görev' })
    expect(taskLink.getAttribute('href')).toContain('/shifts/personnel/44?')
    expect(taskLink.getAttribute('href')).toContain('new_followup=1')
    expect(taskLink.getAttribute('href')).toContain('followup_category=attendance')
  })
})
