import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}))

import PeopleTab from './PeopleTab.jsx'

describe('PeopleTab smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('personel yokken boş durum + arama kutusu render olur', async () => {
    renderWithProviders(<PeopleTab />)
    expect(await screen.findByText('KAYIT YOK')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ara: ad, durak, rol…')).toBeInTheDocument()
  })
})
