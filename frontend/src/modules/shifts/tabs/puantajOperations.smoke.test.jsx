import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import api from '../../../shared/api/client.js'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import PuantajOperationsView, { PuantajOperationsContent } from './PuantajOperationsView.jsx'

const payload = {
  metrics: {
    active_staff: 12,
    scheduled: 9,
    worked: 7,
    on_leave: 1,
    absent: 1,
    pending_scan: 2,
    unassigned_staff: 1,
    unplanned_scans: 1,
    action_required: 2,
    critical_actions: 1,
    coverage_missing: 1,
    pending_leave_requests: 1,
    pending_overtime_requests: 1,
    overtime_hours_month: 34,
    employer_cost_month: 125000,
  },
  roster: [
    {
      schedule_id: 1,
      staff_id: 7,
      full_name: 'Okutma Bekleyen',
      dept_name: 'Mutfak',
      role_name: 'Ikramci',
      shift_name: 'Sabah',
      start_hour: 6,
      end_hour: 15,
      work_location_name: 'OTC Yemekhane',
      attendance_state: 'pending_scan',
      event_count: 0,
      open_exception_count: 0,
      overtime_hours: 0,
    },
  ],
  unassigned_staff: [
    {
      staff_id: 12,
      dept_id: 3,
      full_name: 'Plansiz Kart Basan',
      dept_name: 'Mutfak',
      role_name: 'Ikramci',
      work_location_name: 'OTC Yemekhane',
      attendance_state: 'unplanned_scan',
      event_count: 1,
      first_event_at: '2026-07-14T07:10:00+03:00',
    },
  ],
  actions: [
    { key: 'exception:41', category: 'card', type: 'single_scan', severity: 'critical', staff_id: 13, full_name: 'Kart Istisnasi', dept_name: 'Mutfak', title: 'Kart Istisnasi', detail: 'Tek kart okutma bulundu', exception_id: 41, can_resolve: true },
    { key: 'unassigned:14', category: 'schedule', type: 'missing_schedule', severity: 'warning', staff_id: 14, full_name: 'Vardiya Eksik', dept_name: 'Teknik', title: 'Vardiya Eksik', detail: 'Aktif personel icin gunluk vardiya girilmemis', can_resolve: false },
  ],
  action_summary: { total: 2, by_category: { card: 1, schedule: 1 }, by_severity: { critical: 1, warning: 1 } },
  coverage: [
    { rule_id: 1, work_date: '2026-07-14', name: 'Yemekhane acilisi', dept_id: 1, role_id: 1, work_location_id: 1, shift_def_id: null, work_location_name: 'OTC Yemekhane', role_name: 'Ikramci', start_time: '06:00', end_time: '09:00', assigned: 2, min_staff: 3, missing: 1 },
  ],
  pending: {
    leaves: [{ id: 1, staff_id: 8, full_name: 'Izin Bekleyen', dept_name: 'Mutfak', start_date: '2026-07-20', end_date: '2026-07-21', leave_type: 'annual' }],
    overtime: [{ id: 2, staff_id: 9, full_name: 'Mesai Bekleyen', dept_name: 'Teknik', work_date: '2026-07-14', requested_hours: 2 }],
  },
  duty_managers: [{ staff_id: 10, full_name: 'Vardiya Amiri', shift_name: 'Sabah' }],
  risks: [{ type: 'high_overtime', severity: 'warning', staff_id: 11, full_name: 'Yuksek Mesai', dept_name: 'Teknik', value: 34, message: '34 saat aylik mesai' }],
  trends: [{ date: '2026-07-14', scheduled: 9, worked: 7, on_leave: 1, absent: 1, off: 0, overtime_hours: 3, open_exceptions: 2, coverage_missing: 1, not_due: false }],
  breakdowns: {
    departments: [{ dimension: 'department', dimension_id: 1, name: 'Mutfak', staff_count: 8, person_days: 80, worked_days: 60, leave_days: 10, absent_days: 2, overtime_hours: 12, employer_total_cost: 90000 }],
    roles: [{ dimension: 'role', dimension_id: 1, name: 'Ikramci', staff_count: 5, person_days: 50, worked_days: 40, leave_days: 5, absent_days: 1 }],
    locations: [{ dimension: 'location', dimension_id: 1, name: 'OTC Yemekhane', staff_count: 6, person_days: 55, worked_days: 44, leave_days: 4, absent_days: 1 }],
  },
}

describe('Puantaj operations workspace', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders daily flow, coverage, requests, trends and cost breakdowns', () => {
    render(<PuantajOperationsContent payload={payload} selectedDate="2026-07-14" />)

    expect(screen.getByText('GUNLUK PERSONEL AKISI')).toBeInTheDocument()
    expect(screen.getByText('AKSIYON MERKEZI')).toBeInTheDocument()
    expect(screen.getByText('Okutma Bekleyen')).toBeInTheDocument()
    expect(screen.getByText('Plansiz Kart Basan')).toBeInTheDocument()
    expect(screen.getAllByText('Plansiz okutma').length).toBeGreaterThan(1)
    expect(screen.getByText('Okutma bekliyor')).toBeInTheDocument()
    expect(screen.getByText('Yemekhane acilisi')).toBeInTheDocument()
    expect(screen.getByText('Izin Bekleyen')).toBeInTheDocument()
    expect(screen.getByText('Yuksek Mesai')).toBeInTheDocument()
    expect(screen.getByText('DEPARTMAN / MALIYET')).toBeInTheDocument()
    expect(screen.getAllByText('OTC Yemekhane').length).toBeGreaterThan(1)
  })

  it('keeps large operation queues bounded and expands them on demand', () => {
    const largePayload = {
      ...payload,
      actions: Array.from({ length: 80 }, (_, index) => ({
        key: `action-${index}`,
        category: index % 2 ? 'schedule' : 'card',
        severity: index < 3 ? 'critical' : 'warning',
        staff_id: index + 1,
        title: `Aksiyon ${index + 1}`,
        detail: 'Kontrol bekliyor',
        can_resolve: false,
      })),
      roster: Array.from({ length: 80 }, (_, index) => ({
        schedule_id: index + 1,
        staff_id: index + 1,
        full_name: `Personel ${index + 1}`,
        dept_name: index % 2 ? 'Mutfak' : 'Teknik',
        role_name: 'Gorevli',
        shift_name: 'Sabah',
        start_hour: 6,
        end_hour: 15,
        attendance_state: 'worked',
      })),
      unassigned_staff: [],
      risks: Array.from({ length: 60 }, (_, index) => ({
        type: 'high_overtime',
        severity: 'warning',
        staff_id: index + 1,
        full_name: `Riskli Personel ${index + 1}`,
        value: index,
        message: `${index + 1} saat mesai`,
      })),
    }

    render(<PuantajOperationsContent payload={largePayload} selectedDate="2026-07-14" />)

    expect(screen.getAllByTestId('operations-action-row')).toHaveLength(25)
    expect(screen.getAllByTestId('operations-roster-row')).toHaveLength(35)

    fireEvent.click(screen.getByRole('button', { name: 'Aksiyonlar: daha fazla goster' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gunluk personel: daha fazla goster' }))
    expect(screen.getAllByTestId('operations-action-row')).toHaveLength(50)
    expect(screen.getAllByTestId('operations-roster-row')).toHaveLength(70)

    fireEvent.change(screen.getByLabelText('Gunluk personel ara'), { target: { value: 'Personel 80' } })
    expect(screen.getAllByTestId('operations-roster-row')).toHaveLength(1)
    expect(screen.getByText('Personel 80')).toBeInTheDocument()
  })

  it('shows empty operation sections when collection fields are malformed', () => {
    render(<PuantajOperationsContent payload={{ metrics: {}, roster: {}, actions: null, pending: { leaves: {} }, breakdowns: { roles: {} } }} selectedDate="2026-07-14" />)

    expect(screen.getByText('AKSIYON MERKEZI')).toBeInTheDocument()
    expect(screen.getByText('Bu filtrede bekleyen aksiyon yok.')).toBeInTheDocument()
    expect(screen.getByText('Filtreye uyan personel kaydi yok.')).toBeInTheDocument()
    expect(screen.getByText('Aylik risk uyarisi yok.')).toBeInTheDocument()
  })

  it('opens personnel and changes the selected trend day', () => {
    const onPersonClick = vi.fn()
    const onSelectedDate = vi.fn()
    render(
      <PuantajOperationsContent
        payload={payload}
        selectedDate="2026-07-14"
        onSelectedDate={onSelectedDate}
        onPersonClick={onPersonClick}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Okutma Bekleyen' }))
    expect(onPersonClick).toHaveBeenCalledWith(7)
    fireEvent.click(screen.getByText(/14 Tem/))
    expect(onSelectedDate).toHaveBeenCalledWith('2026-07-14')
  })

  it('filters actions and resolves a card exception from the queue', () => {
    const onResolveException = vi.fn()
    render(
      <PuantajOperationsContent
        payload={payload}
        selectedDate="2026-07-14"
        onResolveException={onResolveException}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Coz' }))
    expect(onResolveException).toHaveBeenCalledWith(41, 'resolved')

    fireEvent.click(screen.getByRole('button', { name: /Cizelge/ }))
    expect(screen.getByText('Vardiya Eksik')).toBeInTheDocument()
    expect(screen.queryByText('Kart Istisnasi')).not.toBeInTheDocument()
  })

  it('reconciles the selected day and updates an exception through the API', async () => {
    vi.spyOn(api, 'get').mockImplementation(url => Promise.resolve({ data: url === '/shifts/work-locations' ? [] : payload }))
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { processed: 2, exceptions: 1 } })
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({ data: { id: 41, status: 'resolved' } })
    renderWithProviders(<PuantajOperationsView month="2031-02" deptFilter="" />)

    await screen.findByText('AKSIYON MERKEZI')
    fireEvent.click(screen.getByRole('button', { name: 'Gunu uzlastir' }))
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/shifts/attendance/reconcile', { date: '2031-02-01' }))

    fireEvent.click(screen.getByRole('button', { name: 'Coz' }))
    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith('/shifts/attendance/exceptions/41', {
      status: 'resolved',
      note: 'Gunluk operasyon merkezinden guncellendi',
    }))
  })

  it('turns a card overtime candidate into a traceable approval request', async () => {
    const overtimePayload = {
      ...payload,
      actions: [...payload.actions, {
        key: 'exception:77',
        category: 'card',
        type: 'overtime_candidate',
        severity: 'info',
        staff_id: 31,
        full_name: 'Kart Mesai Adayi',
        dept_name: 'Mutfak',
        title: 'Kart Mesai Adayi',
        detail: '65 dakika mesai adayi',
        exception_id: 77,
        overtime_candidate_minutes: 65,
        planned_end: '2031-02-01T12:00:00.000Z',
        actual_check_in: '2031-02-01T03:00:00.000Z',
        actual_check_out: '2031-02-01T13:05:00.000Z',
        can_resolve: true,
      }],
    }
    vi.spyOn(api, 'get').mockImplementation(url => Promise.resolve({
      data: url === '/shifts/work-locations' ? [] : overtimePayload,
    }))
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      data: { request: { id: 92, requested_hours: 1.25, status: 'pending' } },
    })
    renderWithProviders(<PuantajOperationsView month="2031-02" deptFilter="" />)

    await screen.findByText('AKSIYON MERKEZI')
    fireEvent.click(screen.getByRole('button', { name: 'Mesai talebi: Kart Mesai Adayi' }))

    expect(screen.getByText('MESAI ADAYINI TALEBE DONUSTUR')).toBeInTheDocument()
    expect(screen.getByLabelText('Mesai saati')).toHaveValue(1.08)
    expect(screen.getByLabelText('Gerceklesen baslangic')).toHaveValue('15:00')
    expect(screen.getByLabelText('Gerceklesen bitis')).toHaveValue('16:05')
    fireEvent.change(screen.getByLabelText('Mesai saati'), { target: { value: '1.25' } })
    fireEvent.change(screen.getByLabelText('Mesai karsiligi'), { target: { value: 'time_off' } })
    fireEvent.change(screen.getByLabelText('Mesai gerekcesi'), { target: { value: 'Yemekhane kapanis destegi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Onaya gonder' }))

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/shifts/attendance/exceptions/77/overtime-request', {
      requested_hours: 1.25,
      actual_hours: 1.25,
      actual_start: '15:00',
      actual_end: '16:05',
      reason: 'Yemekhane kapanis destegi',
      compensation_type: 'time_off',
    }))
  })

  it('finds available coverage candidates and assigns the selected person', async () => {
    const operationsPayload = {
      ...payload,
      actions: [...payload.actions, {
        key: 'coverage:1:2026-07-14',
        category: 'coverage',
        severity: 'warning',
        title: 'Yemekhane acilisi',
        detail: '1 kisi eksik',
        can_resolve: false,
      }],
    }
    const candidate = {
      id: 21,
      full_name: 'Uygun Kapsama Adayi',
      dept_id: 1,
      dept_name: 'Mutfak',
      role_id: 1,
      role_name: 'Ikramci',
      primary_work_location_id: 1,
      eligible: true,
      same_day_assignments: 0,
      reasons: [],
      workload: 2,
      score: 97,
      rest_before_hours: 14,
    }
    const busyCandidate = { ...candidate, id: 22, full_name: 'Ayni Gun Calisan', same_day_assignments: 1 }
    const getSpy = vi.spyOn(api, 'get').mockImplementation(url => {
      if (url === '/shifts/work-locations') return Promise.resolve({ data: [] })
      if (url === '/shifts/schedule/candidates') return Promise.resolve({ data: { candidates: [candidate, busyCandidate] } })
      return Promise.resolve({ data: operationsPayload })
    })
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { row: { id: 301 } } })
    renderWithProviders(<PuantajOperationsView month="2031-02" deptFilter="" />)

    await screen.findByText('AKSIYON MERKEZI')
    const recoveryButtons = screen.getAllByRole('button', { name: 'Aday bul: Yemekhane acilisi' })
    expect(recoveryButtons).toHaveLength(2)
    fireEvent.click(recoveryButtons[0])

    await screen.findByText('Uygun Kapsama Adayi', {}, { timeout: 5000 })
    expect(screen.queryByText('Ayni Gun Calisan')).not.toBeInTheDocument()
    expect(screen.getByText('Ayni gun gorevi var: 1')).toBeInTheDocument()
    expect(getSpy).toHaveBeenCalledWith('/shifts/schedule/candidates', { params: {
      date: '2031-02-01',
      dept_id: 1,
      role_id: 1,
      work_location_id: 1,
      shift_def_id: undefined,
      start_time: '06:00',
      end_time: '09:00',
    } })

    fireEvent.click(screen.getByRole('button', { name: 'Goreve ata: Uygun Kapsama Adayi' }))
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/shifts/schedule/segments', {
      staff_id: 21,
      dept_id: 1,
      work_date: '2031-02-01',
      shift_def_id: null,
      role_id: 1,
      work_location_id: 1,
      start_time: '06:00',
      end_time: '09:00',
      break_minutes: 0,
      note: 'Operasyon kapsama tamamlama: Yemekhane acilisi',
    }))
  })

  it('builds an OFF plan for selected unassigned personnel', () => {
    const onApplyPlan = vi.fn()
    render(
      <PuantajOperationsContent
        payload={payload}
        selectedDate="2026-07-14"
        plannerOpen
        onApplyPlan={onApplyPlan}
        shiftDefs={[{ id: 5, name: 'Sabah', start_hour: 6, end_hour: 15 }]}
        workLocations={[{ id: 9, name: 'OTC Yemekhane', is_active: 1 }]}
      />,
    )

    fireEvent.click(screen.getByLabelText('Plansiz Kart Basan sec'))
    fireEvent.click(screen.getByRole('button', { name: 'OFF' }))
    fireEvent.click(screen.getByRole('button', { name: '1 Personele Uygula' }))
    expect(onApplyPlan).toHaveBeenCalledWith(expect.objectContaining({
      status: 'off',
      shiftDefId: null,
      workLocationId: null,
      staffRows: [expect.objectContaining({ staff_id: 12, dept_id: 3 })],
    }))
  })

  it('posts a version-safe bulk shift plan and work location', async () => {
    vi.spyOn(api, 'get').mockImplementation(url => Promise.resolve({
      data: url === '/shifts/work-locations'
        ? [{ id: 9, name: 'OTC Yemekhane', is_active: 1 }]
        : payload,
    }))
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { rows: [{ id: 91 }] } })
    renderWithProviders(
      <PuantajOperationsView
        month="2031-02"
        deptFilter=""
        shiftDefs={[{ id: 5, name: 'Sabah', start_hour: 6, end_hour: 15 }]}
      />,
    )

    await screen.findByText('AKSIYON MERKEZI')
    fireEvent.click(screen.getByRole('button', { name: 'Vardiyasizlari planla' }))
    fireEvent.click(screen.getByLabelText('Plansiz Kart Basan sec'))
    fireEvent.change(screen.getByLabelText('Vardiya'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Calisma noktasi'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: '1 Personele Uygula' }))

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/shifts/schedule', {
      entries: [{
        staff_id: 12,
        dept_id: 3,
        work_date: '2031-02-01',
        status: 'scheduled',
        shift_def_id: 5,
        work_location_id: 9,
        expected_version: 0,
      }],
    }))
  })
})
