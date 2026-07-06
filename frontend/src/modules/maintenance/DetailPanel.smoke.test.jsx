import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/comments')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: {
        id: 7, location: 'M1 Kat 1 Oda 101', description: 'Musluk akıtıyor',
        status: 'open', priority: 'medium', opened_at: new Date().toISOString(),
      } })
    }),
    post: vi.fn(() => Promise.resolve({})),
    patch: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
  },
}))

import DetailPanel from './DetailPanel.jsx'

describe('DetailPanel smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('arıza detayını başlık + açıklama ile render eder', async () => {
    renderWithProviders(<DetailPanel requestId={7} onClose={() => {}} />)
    expect(await screen.findByText('#7 — M1 Kat 1 Oda 101')).toBeInTheDocument()
    expect(screen.getByText('Musluk akıtıyor')).toBeInTheDocument()
  })
})
