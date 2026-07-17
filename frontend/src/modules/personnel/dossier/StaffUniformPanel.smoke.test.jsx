import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import api from '../../../shared/api/client.js'
import StaffUniformPanel from './StaffUniformPanel.jsx'

const UNIFORM = {
  items: [
    { item_key: 'work_pants', label: 'İş pantolonu', category: 'clothing', category_label: 'Kıyafet', size_kind: 'text', size: '52', note: null, active_quantity: 2 },
    { item_key: 'safety_shoes', label: 'İş ayakkabısı', category: 'footwear', category_label: 'Ayakkabı', size_kind: 'numeric', size: null, note: null, active_quantity: 0 },
  ],
  issues: [
    { id: 5, item_key: 'work_pants', label: 'İş pantolonu', size: '52', quantity: 2, note: 'yazlık', issued_at: '2026-07-10', returned_at: null, issued_by_name: 'Müdür' },
  ],
  summary: { total_types: 2, sized: 1, active_issues: 1 },
}

describe('StaffUniformPanel smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: UNIFORM })
    api.put.mockResolvedValue({ data: { ok: true, saved: 1 } })
  })

  it('bedenleri, zimmeti ve özet metrikleri render eder', async () => {
    renderWithProviders(<StaffUniformPanel staffId={7} access={{ can_manage_followups: true, can_view_sensitive_fields: true }} />)
    expect(await screen.findByText('KIYAFET VE BEDENLER')).toBeInTheDocument()
    expect(screen.getAllByText('İş pantolonu').length).toBeGreaterThan(0)
    expect(screen.getAllByText('İş ayakkabısı').length).toBeGreaterThan(0)
    expect(screen.getByText('AKTİF ZİMMET')).toBeInTheDocument()
    expect(screen.getByText('yazlık', { exact: false })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/personnel/7/uniform')
  })

  it('beden düzenleyince kaydet butonu çıkar ve PUT çağırır', async () => {
    renderWithProviders(<StaffUniformPanel staffId={7} access={{ can_manage_followups: true }} />)
    await screen.findByText('KIYAFET VE BEDENLER')
    const shoeInput = screen.getByPlaceholderText('No')
    fireEvent.change(shoeInput, { target: { value: '43' } })
    const saveBtn = await screen.findByRole('button', { name: /Bedenleri Kaydet/ })
    fireEvent.click(saveBtn)
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/personnel/7/uniform/sizes', expect.objectContaining({
        sizes: expect.arrayContaining([expect.objectContaining({ item_key: 'safety_shoes', size: '43' })]),
      }))
    })
  })
})
