import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

const roster = [
  { id: 1, full_name: 'Ali Veli', department_name: 'Temizlik',
    access_id: 11, access_code: 'AVS-A:abcdef0123', access_nfc: null, access_photo: null,
    meal_id: null, meal_code: null, meal_nfc: null, meal_photo: null },
]

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: roster })) },
}))

import CardsPage from './CardsPage.jsx'

describe('cards/CardsPage smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('kart detayında foto çek butonu ve elle UID girişi görünür', async () => {
    renderWithProviders(<CardsPage />)
    fireEvent.click(await screen.findByText('Ali Veli'))
    // access kartı detayı açılır
    expect(await screen.findByText(/Foto çek/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/NFC UID elle gir/)).toBeInTheDocument()
  })

  it('Web NFC desteklenmeyen ortamda (jsdom) NFC OKU butonu gizli', async () => {
    renderWithProviders(<CardsPage />)
    fireEvent.click(await screen.findByText('Ali Veli'))
    await screen.findByText(/Foto çek/)
    expect(screen.queryByText(/NFC OKU/)).not.toBeInTheDocument()
  })
})
