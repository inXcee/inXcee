import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({})),
  },
}))

import UnassignedPool from './UnassignedPool.jsx'

describe('UnassignedPool smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('odasız personel yokken boş durum gösterir', async () => {
    renderWithProviders(<UnassignedPool selectedRoom={null} />)
    expect(await screen.findByText('Tüm personeller odalara yerleştirilmiş')).toBeInTheDocument()
  })
})
