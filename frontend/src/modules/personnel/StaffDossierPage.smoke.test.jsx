import { fireEvent, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(),
  },
}))

import api from '../../shared/api/client.js'
import StaffDossierPage from './StaffDossierPage.jsx'

const DOSSIER = {
  person: {
    id: 7,
    full_name: 'Ayşe Dossier',
    position: 'Vardiya Lideri',
    dept_name: 'Operasyon',
    role_name: 'Lider',
    primary_work_location_name: 'Ana Saha',
    is_active: 1,
    gender: 'female',
    tc_no: '711******11',
    phone: '05550000000',
    email: 'ayse@example.com',
  },
  access: { can_view_sensitive_fields: false, can_manage_operational_documents: true, can_manage_sensitive_documents: false },
  identity_link: { status: 'confirmed', personnel_id: 17 },
  today: { shift: { status: 'worked', shift_name: 'Gündüz', start_hour: 8, end_hour: 17 }, attendance: null },
  next_shift: { work_date: '2026-07-17', shift_name: 'Gündüz' },
  work_30d: { worked: 20, absent: 1, on_leave: 2, off_days: 7, overtime_hours: 4 },
  documents: { completion_rate: 75, missing: 2, expired: 1, expiring: 1 },
  counters: { open_followups: 3, overdue_followups: 1, active_inventory: 1, active_kkd: 1, open_attendance_exceptions: 1 },
  risks: [{ code: 'missing_documents', title: '2 zorunlu belge eksik', severity: 'warning', count: 2 }],
  risk_score: 10,
  upcoming: [{ kind: 'contract', entity_id: 7, date: '2026-07-20', title: 'Sözleşme bitişi', days_remaining: 4, severity: 'warning' }],
  recent_activity: [{ id: 'shift-1', kind: 'shift', date: '2026-07-16', title: 'Gündüz · worked', severity: 'info' }],
  data_quality: { missing_fields: [] },
  room: { block: 'S2', room_no: '204', bed_no: '2' },
}

describe('StaffDossierPage smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/shifts/personnel/7')
    api.get.mockImplementation(url => {
      if (url === '/personnel/7/dossier') return Promise.resolve({ data: DOSSIER })
      if (url === '/shifts/staff/7/detail') {
        return Promise.resolve({ data: {
          assignmentHistory: [{ id: 1, dept_name: 'Operasyon', role_name: 'Lider', work_location_name: 'Ana Saha', effective_from: '2026-01-01' }],
          shiftHistory: [{ work_date: '2026-07-16', shift_name: 'Gündüz', status: 'worked', work_location_name: 'Ana Saha' }],
          attendanceLogs: [],
          leaveHistory: [],
          overtimeRecords: [],
          stats: { totalOvertime: 4, absentCount: 1 },
        } })
      }
      if (url === '/personnel/7/documents') {
        return Promise.resolve({ data: {
          documents: [{ id: 5, source: 'staff', document_kind: 'training', kind_label: 'Eğitim', title: 'İSG Eğitim Belgesi', status: 'active', can_access: true, visibility: 'operational', uploaded_at: '2026-07-10', file_name: 'isg.pdf' }],
          attachments: [{ id: 'attachment-1', source: 'leave', kind_label: 'İzin eki', title: 'izin.pdf', status: 'active', read_only: true, can_access: true }],
          requirements: [{ id: 1, document_kind: 'contract', display_name: 'İş sözleşmesi', satisfied: false }],
          summary: { total: 1, active: 1, archived: 0, required: 1, missing: 1, expired: 0, expiring: 0, attachments: 1 },
          kinds: [{ value: 'training', label: 'Eğitim' }, { value: 'other', label: 'Diğer' }],
        } })
      }
      if (url === '/personnel/7/360') {
        return Promise.resolve({ data: {
          person: { pickup_name: 'Merkez Durak' },
          room_history: [],
          transport_summary: { assignments: 20, no_show: 1 },
          discipline: [],
          discipline_total: { yellow: 0, red: 0 },
          laundry: { recent_count: 2 },
          maintenance: [],
        } })
      }
      return Promise.resolve({ data: {} })
    })
  })

  it('birleşik genel bakışı ve lazy sekmeleri render eder', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/shifts/personnel/:staffId" element={<StaffDossierPage />} />
      </Routes>,
      { route: '/shifts/personnel/7' },
    )

    expect(await screen.findByText('Ayşe Dossier')).toBeInTheDocument()
    expect(screen.getByText('2 zorunlu belge eksik')).toBeInTheDocument()
    expect(screen.getByText('%75')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Kimlik ve İletişim' }))
    expect(await screen.findByText('GÖREV VE LOKASYON GEÇMİŞİ')).toBeInTheDocument()
    expect(await screen.findByText('711******11')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Çalışma ve Devam' }))
    expect(await screen.findByText('VARDİYA GEÇMİŞİ')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Belgeler' }))
    expect(await screen.findByText('İSG Eğitim Belgesi')).toBeInTheDocument()
    expect(screen.getByText('İş sözleşmesi')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/personnel/7/documents')

    fireEvent.click(screen.getByRole('button', { name: 'Operasyonel Bağlantılar' }))
    expect(await screen.findByText('Merkez Durak')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/personnel/7/360')
  })
})
