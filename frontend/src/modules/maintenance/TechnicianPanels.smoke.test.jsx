import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
  },
}))

import { TechnicianManager } from './TechnicianPanels.jsx'

describe('TechnicianManager smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('başlığı ve teknisyen yokken boş durumu gösterir', async () => {
    renderWithProviders(<TechnicianManager />)
    expect(screen.getByText('TEKNİSYEN YÖNETİMİ')).toBeInTheDocument()
    expect(await screen.findByText('Teknisyen kaydı yok')).toBeInTheDocument()
  })
})
