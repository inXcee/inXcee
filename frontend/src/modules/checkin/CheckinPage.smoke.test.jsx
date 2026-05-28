import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

// offlineDB jsdom'da indexedDB'siz patlayabilir — taslak fonksiyonlarını stub'la.
vi.mock('../../shared/utils/offlineDB.js', () => ({
  saveDraft: vi.fn(() => Promise.resolve()),
  loadDraft: vi.fn(() => Promise.resolve(null)),
  clearDraft: vi.fn(() => Promise.resolve()),
}))

import CheckinPage from './CheckinPage.jsx'

describe('CheckinPage smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('çökmeden render olur ve check-in adım çubuğunu gösterir', () => {
    renderWithProviders(<CheckinPage />)
    expect(screen.getByText('ARAMA')).toBeInTheDocument()
    expect(screen.getByText('ODA ATAMA')).toBeInTheDocument()
    expect(screen.getByText('ZİMMET')).toBeInTheDocument()
  })
})
