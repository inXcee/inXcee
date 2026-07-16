import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../../shared/store/authStore.js', () => ({
  useAuthStore: (selector) => selector({ user: { role: 'campus_manager' } }),
}))

import api from '../../../shared/api/client.js'
import DocumentsTab from './DocumentsTab.jsx'

describe('DocumentsTab smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockImplementation(url => {
      if (url.startsWith('/shifts/staff')) return Promise.resolve({ data: [{ id: 3, full_name: 'Ahmet Personel' }] })
      if (url.startsWith('/personnel/document-requirements')) return Promise.resolve({ data: {
        requirements: [{ id: 1, document_kind: 'contract', kind_label: 'Sözleşme', display_name: 'İş sözleşmesi', requires_expiry: 1, visibility: 'sensitive', is_active: 1 }],
        kinds: [{ value: 'contract', label: 'Sözleşme' }, { value: 'certificate', label: 'Sertifika' }],
      } })
      if (url.startsWith('/personnel/documents/catalog')) return Promise.resolve({ data: {
        documents: [{ id: 9, staff_id: 3, staff_name: 'Ahmet Personel', department_name: 'Operasyon', title: 'İSG Belgesi', kind_label: 'Eğitim', document_kind: 'training', status: 'active', visibility: 'operational', restricted: false, file_name: 'isg.pdf' }],
        total: 1,
        kinds: [{ value: 'training', label: 'Eğitim' }],
        statuses: [{ value: 'active', label: 'Geçerli' }],
      } })
      return Promise.resolve({ data: {} })
    })
  })

  it('katalog belgelerini ve zorunlu belge kurallarını render eder', async () => {
    renderWithProviders(<DocumentsTab departments={[{ id: 1, name: 'Operasyon' }]} />)
    expect(await screen.findByText('İSG Belgesi')).toBeInTheDocument()
    expect(screen.getAllByText('Ahmet Personel').length).toBeGreaterThan(0)
    // müdür için kural yönetimi görünür
    expect(await screen.findByText('ZORUNLU BELGE KURALLARI')).toBeInTheDocument()
    expect(screen.getByText('İş sözleşmesi')).toBeInTheDocument()
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/personnel/documents/catalog'))
      expect(api.get).toHaveBeenCalledWith('/personnel/document-requirements')
    })
  })

  it('tür filtresini katalog sorgusuna geçirir', async () => {
    renderWithProviders(<DocumentsTab departments={[]} />)
    await screen.findByText('İSG Belgesi')
    // Tür filtresi select'i: 'training' option'ı olan combobox
    const kindSelect = screen.getAllByRole('combobox').find(s => s.querySelector('option[value="training"]'))
    expect(kindSelect).toBeTruthy()
    fireEvent.change(kindSelect, { target: { value: 'training' } })
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('document_kind=training'))
    })
  })
})
