import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import api from '../../../shared/api/client.js'
import { StaffNotesPanel, StaffTimelinePanel } from './StaffNotesTimeline.jsx'

const ACCESS = { can_manage_followups: true, can_view_sensitive_fields: true }

describe('StaffNotesPanel smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockImplementation(url => {
      if (url.includes('/notes')) return Promise.resolve({ data: [{ id: 1, note: 'Deneme not', author_name: 'Müdür', category: 'general', visibility: 'operational', pinned: 1, created_at: '2026-07-10' }] })
      if (url.includes('/followups')) return Promise.resolve({ data: { followups: [{ id: 2, title: 'Sözleşme yenile', priority: 'high', category: 'document', status: 'open', is_overdue: true, due_at: '2026-07-01' }], summary: { open: 1, overdue: 1, done: 0 } } })
      if (url === '/users') return Promise.resolve({ data: [{ id: 5, full_name: 'Vardiya Amiri' }] })
      return Promise.resolve({ data: [] })
    })
  })

  it('notları ve görevleri render eder', async () => {
    renderWithProviders(<StaffNotesPanel staffId={7} access={ACCESS} />)
    expect(await screen.findByText('Deneme not')).toBeInTheDocument()
    expect(await screen.findByText('Sözleşme yenile')).toBeInTheDocument()
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/personnel/7/notes')
      expect(api.get).toHaveBeenCalledWith('/personnel/7/followups')
    })
  })

  it('takip merkezinden gelen görev alanlarını önceden doldurur', async () => {
    renderWithProviders(<StaffNotesPanel staffId={7} access={ACCESS} />, { route: '/shifts/personnel/7?tab=notes&new_followup=1&followup_title=Takip%3A%20Fazla%20mesai&followup_priority=high&followup_category=attendance' })
    expect(await screen.findByDisplayValue('Takip: Fazla mesai')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Yüksek')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Devam')).toBeInTheDocument()
  })
})

describe('StaffTimelinePanel smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: {
      items: [{ id: 'shift-1', kind: 'shift', date: '2026-07-16', title: 'Gündüz · worked', severity: 'info' }],
      page: 1, total: 1, total_pages: 1,
    } })
  })

  it('zaman çizelgesini render eder ve tür filtresini uygular', async () => {
    renderWithProviders(<StaffTimelinePanel staffId={7} />)
    expect(await screen.findByText('Gündüz · worked')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Belge' }))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/personnel/7/dossier/timeline', expect.objectContaining({ params: expect.objectContaining({ types: 'document' }) }))
    })
  })
})
