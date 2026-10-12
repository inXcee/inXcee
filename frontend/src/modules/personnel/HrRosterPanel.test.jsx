import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

let role = 'campus_manager'
let payload
vi.mock('../../shared/store/authStore.js', () => ({ useAuthStore: (sel) => sel({ user: { role } }) }))
vi.mock('../../shared/components/ConfirmDialog.jsx', () => ({ confirmDialog: vi.fn(() => Promise.resolve(true)) }))
vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: payload })),
    post: vi.fn((url) => Promise.resolve({ data: url.includes('apply-fills') ? { staff: 1, fields: 3 } : { alias: 'BERNA ASLAN', staff_id: 7 } })),
  },
}))

import api from '../../shared/api/client.js'
import HrRosterPanel from './HrRosterPanel.jsx'

const base = (over = {}) => ({
  snapshot: { id: 1, age_hours: 3, people_count: 184, month: '2026-10', stale: false,
    run: { counts: { written: 4, conflicts: 1 }, conflicts: [{ name: 'BEDİA KORUM', date: '2026-10-04', cell: 'J16', excel: 'S', yys: 'H', reason: 'elle girilmiş özel kod' }] } },
  exit_pending: [{ staff_id: 3, full_name: 'HAKAN ERKEK', exit_date: '2026-10-05', project: 'Kamp Alanı' }],
  archived_present: [], missing: [{ staff_id: 7, full_name: 'BERNA ARSLAN', department: 'İkram', project: null }],
  roster_only: [{ name: 'BERNA ASLAN', position: 'Garson', project: 'Kamp Alanı', candidates: [{ staff_id: 7, full_name: 'BERNA ARSLAN', score: 0.95 }] }],
  mismatches: [], fillable: [{ staff_id: 9, full_name: 'ALİ VELİ', fields: { tc_no: '10000000146', position: 'Aşçı', project_id: 2 }, project_name: 'FPU' }],
  ...over,
})

describe('HrRosterPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); role = 'campus_manager'; payload = base() })

  it('özet, çakışmalar ve açık bölümler görünür; TC maskeli', async () => {
    renderWithProviders(<HrRosterPanel />)
    expect(await screen.findByText(/3 saat önce/)).toBeInTheDocument()
    expect(screen.getByText(/4 hücre yazıldı · 1 çakışma/)).toBeInTheDocument()
    expect(screen.getByText('HAKAN ERKEK')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Doldurulabilir boş alanlar/ }))
    expect(screen.getByText(/TC: 100\*\*\*\*\*\*46/)).toBeInTheDocument()
    expect(screen.queryByText('10000000146')).not.toBeInTheDocument()
  })

  it('aday ile eşleştirme kalıcı eşleştirme isteği gönderir', async () => {
    renderWithProviders(<HrRosterPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /= BERNA ARSLAN \(%95\)/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/personnel/aliases', { staff_id: 7, alias: 'BERNA ASLAN' }))
  })

  it('boş alan doldurma yalnız müdürde; onaydan sonra istek gider', async () => {
    renderWithProviders(<HrRosterPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /Doldurulabilir boş alanlar/ }))
    fireEvent.click(screen.getByRole('button', { name: /Boş alanları doldur \(1\)/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/personnel/hr-roster/apply-fills', {}))
  })

  it('vardiya amiri eşleştiremez ve dolduramaz', async () => {
    role = 'shift_supervisor'
    renderWithProviders(<HrRosterPanel />)
    expect(await screen.findByText('HAKAN ERKEK')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /= BERNA ARSLAN/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Doldurulabilir boş alanlar/ }))
    expect(screen.queryByRole('button', { name: /Boş alanları doldur/ })).not.toBeInTheDocument()
  })

  it('bayat liste uyarısı ve liste yokken bilgi', async () => {
    payload = base({ snapshot: { ...base().snapshot, age_hours: 400, stale: true } })
    const { unmount } = renderWithProviders(<HrRosterPanel />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/bayat/)
    unmount()
    payload = { snapshot: null, exit_pending: [], archived_present: [], missing: [], roster_only: [], mismatches: [], fillable: [] }
    renderWithProviders(<HrRosterPanel />)
    expect(await screen.findByText(/Henüz kadro listesi gelmedi/)).toBeInTheDocument()
  })
})
