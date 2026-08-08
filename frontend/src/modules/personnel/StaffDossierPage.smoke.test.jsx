import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

import api from '../../shared/api/client.js'
import StaffDossierPage from './StaffDossierPage.jsx'

const DOSSIER = {
  person: {
    id: 7,
    full_name: 'Ayşe Dossier',
    position: 'Vardiya Lideri',
    project_id: 3,
    project_name: 'FPU Projesi',
    department_id: 2,
    dept_name: 'Operasyon',
    role_id: 4,
    role_name: 'Lider',
    primary_work_location_id: 5,
    primary_work_location_site: 'Filyos',
    primary_work_location_name: 'Ana Saha',
    is_active: 1,
    gender: 'female',
    tc_no: '711******11',
    phone: '05550000000',
    email: 'ayse@example.com',
  },
  access: { can_view_sensitive_fields: false, can_manage_operational_documents: true, can_manage_sensitive_documents: false, can_manage_followups: true },
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
  annual_leave: {
    has_hire_date: true, has_started: true, entitled_days: 14, annual_used: 4, remaining: 10,
    service_years: 3, service_months: 2, hire_date: '2023-05-01',
    entitlement_start_date: '2024-05-01', next_anniversary: '2027-05-01', age_rule_applied: false,
  },
}

describe('StaffDossierPage smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.put.mockResolvedValue({ data: { ok: true } })
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
    expect(screen.getByRole('region', { name: 'Personel takip merkezi' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Personel dosyası tamamlanma durumu' })).toBeInTheDocument()
    expect(screen.getByLabelText('Personel dosyası hızlı işlemleri')).toBeInTheDocument()
    expect(screen.getByText(/FPU Projesi \/ Operasyon \/ Filyos \/ Ana Saha/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Özeti Kopyala' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excel' })).toBeInTheDocument()
    expect(screen.getByText('PERSONEL TAKİP MERKEZİ')).toBeInTheDocument()
    expect(screen.getAllByTitle('3 açık kayıt')).toHaveLength(2)
    expect(screen.getByText('2 zorunlu belge eksik')).toBeInTheDocument()
    expect(screen.getByText('%75')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Kimlik ve İletişim' }))
    expect(await screen.findByText('GÖREV VE LOKASYON GEÇMİŞİ')).toBeInTheDocument()
    expect(await screen.findByText('711******11')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Çalışma ve Devam' }))
    expect(await screen.findByText('VARDİYA GEÇMİŞİ')).toBeInTheDocument()
    expect(screen.getByText('YILLIK İZİN HAKKI')).toBeInTheDocument()
    expect(screen.getByText('HAK EDİLEN')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Belgeler' }))
    expect(await screen.findByText('İSG Eğitim Belgesi')).toBeInTheDocument()
    expect(screen.getByText('İş sözleşmesi')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/personnel/7/documents')

    fireEvent.click(screen.getByRole('tab', { name: 'Operasyonel Bağlantılar' }))
    expect(await screen.findByText('Merkez Durak')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/personnel/7/360')
  })

  it('erişilebilir tablist ve klavye ok navigasyonu sunar', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/shifts/personnel/:staffId" element={<StaffDossierPage />} />
      </Routes>,
      { route: '/shifts/personnel/7' },
    )
    await screen.findByText('Ayşe Dossier')
    const tablist = screen.getByRole('tablist')
    expect(tablist).toBeInTheDocument()
    const overviewTab = screen.getByRole('tab', { name: 'Genel Bakış' })
    expect(overviewTab).toHaveAttribute('aria-selected', 'true')
    // ← → ile sekme değişir
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    expect(await screen.findByText('GÖREV VE LOKASYON GEÇMİŞİ')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Kimlik ve İletişim' })).toHaveAttribute('aria-selected', 'true')
  })

  it('takip merkezi kartlarından doğru personel ayrıntısına tek tıkla geçer', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/shifts/personnel/:staffId" element={<StaffDossierPage />} />
      </Routes>,
      { route: '/shifts/personnel/7' },
    )

    await screen.findByText('PERSONEL TAKİP MERKEZİ')
    fireEvent.click(screen.getByRole('button', { name: /GÖREV VE ANA NOKTA/i }))
    expect(await screen.findByText('GÖREV VE LOKASYON GEÇMİŞİ')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Kimlik ve İletişim' })).toHaveAttribute('aria-selected', 'true')
  })

  it('personel dosyasını aynı ekrandan kapsamlı düzenler', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/shifts/personnel/:staffId" element={<StaffDossierPage />} />
      </Routes>,
      { route: '/shifts/personnel/7' },
    )

    fireEvent.click(await screen.findByRole('button', { name: /Dosyayı Düzenle/i }))
    const phone = screen.getByDisplayValue('05550000000')
    fireEvent.change(phone, { target: { value: '05551112233' } })
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/shifts/staff/7', expect.objectContaining({
      full_name: 'Ayşe Dossier',
      phone: '05551112233',
      is_active: 1,
    })))
    expect(api.put.mock.calls[0][1]).not.toHaveProperty('tc_no')
    expect(api.put.mock.calls[0][1]).not.toHaveProperty('salary')
    expect(api.put.mock.calls[0][1]).not.toHaveProperty('iban')
  })
})
