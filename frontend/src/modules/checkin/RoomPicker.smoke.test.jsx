import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}))

import RoomPicker from './RoomPicker.jsx'

describe('RoomPicker smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('blok seçici + koridor + lejant render eder', () => {
    renderWithProviders(<RoomPicker onSelect={() => {}} selectedRoom={null} suggestedRoom={null} />)
    expect(screen.getByText('KORİDOR')).toBeInTheDocument()
    expect(screen.getByText('ÖNERİLEN')).toBeInTheDocument()
  })
})
