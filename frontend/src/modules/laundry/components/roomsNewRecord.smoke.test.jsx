import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../api.js', () => ({
  laundryApi: {
    getRoomOccupant: vi.fn(() => Promise.resolve({})),
    createItem: vi.fn(() => Promise.resolve({ id: 1 })),
    addPremiumGarments: vi.fn(() => Promise.resolve({})),
  },
}))

import { InlineNewRecord } from './roomsNewRecord.jsx'

describe('InlineNewRecord smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('standart blok: başlık + hızlı parça + kaydet butonu', () => {
    renderWithProviders(<InlineNewRecord roomId={1} block="M1" room_no="101" occupants={[]} onSaved={() => {}} />)
    expect(screen.getByText('YENİ KAYIT — M1 · 101')).toBeInTheDocument()
    expect(screen.getByText('HIZLI PARÇA EKLE')).toBeInTheDocument()
    expect(screen.getByText('✓ KAYDET')).toBeInTheDocument()
  })

  it('Y blok premium akışı + PREMIUM rozeti gösterir', () => {
    renderWithProviders(<InlineNewRecord roomId={2} block="A" room_no="5" occupants={[]} onSaved={() => {}} />)
    expect(screen.getByText('★ PREMIUM')).toBeInTheDocument()
    expect(screen.getByText('PREMIUM PARÇA DETAYI')).toBeInTheDocument()
  })

  it('teslim eden çipi tıklanınca isim alanına yazılır', () => {
    renderWithProviders(<InlineNewRecord roomId={3} block="M1" room_no="7" occupants={[{ id: 9, bed_no: 1, full_name: 'Ali Veli' }]} onSaved={() => {}} />)
    fireEvent.click(screen.getByText(/Ali Veli/))
    expect(screen.getByDisplayValue('Ali Veli')).toBeInTheDocument()
  })
})
