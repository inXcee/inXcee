import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

// api client'ı mock'la — gerçek ağ isteği gitmesin.
vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import CheckoutPage from './CheckoutPage.jsx'

describe('CheckoutPage smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('çökmeden render olur ve adım çubuğunu gösterir', () => {
    renderWithProviders(<CheckoutPage />)
    // İlk adım: ARAMA — StepBar her zaman ekranda.
    expect(screen.getByText('ARAMA')).toBeInTheDocument()
    expect(screen.getByText('TAMAMLA')).toBeInTheDocument()
  })
})
