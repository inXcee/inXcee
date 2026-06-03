import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
  },
}))

import SearchTab from './SearchTab.jsx'

describe('discipline/SearchTab smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('arama panelini render eder', () => {
    renderWithProviders(<SearchTab />)
    expect(screen.getByText('PERSONEL ARA')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/İsim, şirket/)).toBeInTheDocument()
  })
})
