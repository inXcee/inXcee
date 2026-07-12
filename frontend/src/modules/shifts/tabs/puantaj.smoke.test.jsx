import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
  },
}))

import PuantajTab from './PuantajTab.jsx'

describe('PuantajTab smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('çökmeden render olur ve görünüm kontrollerini gösterir', () => {
    renderWithProviders(<PuantajTab departments={[]} />)
    expect(screen.getByText(/CSV İndir/)).toBeInTheDocument()
    expect(screen.getByText('📋 LİSTE')).toBeInTheDocument()
    expect(screen.getByText('PUANTAJ KAPANIŞ KONTROLÜ')).toBeInTheDocument()
    expect(screen.getByText(/P → N/)).toBeInTheDocument()
  })
})
