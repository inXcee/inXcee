import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}))

import RoutesTab from './RoutesTab.jsx'

describe('RoutesTab smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rota yokken boş durum + ROTA ekle butonu', async () => {
    renderWithProviders(<RoutesTab />)
    expect(await screen.findByText('HENÜZ ROTA YOK')).toBeInTheDocument()
    expect(screen.getByText('+ ROTA')).toBeInTheDocument()
  })

  it('+ ROTA tıklanınca yeni rota formu açılır', async () => {
    renderWithProviders(<RoutesTab />)
    await screen.findByText('HENÜZ ROTA YOK')
    fireEvent.click(screen.getByText('+ ROTA'))
    expect(await screen.findByText('YENİ ROTA')).toBeInTheDocument()
  })
})
