import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../api.js', () => ({
  laundryApi: {
    getItems: vi.fn(() => Promise.resolve([])),
    getRooms: vi.fn(() => Promise.resolve([])),
    createItem: vi.fn(() => Promise.resolve({})),
    getLaundrySettings: vi.fn(() => Promise.resolve({})),
    updateLaundrySetting: vi.fn(() => Promise.resolve({})),
  },
}))

import QuickNotes from './QuickNotes.jsx'
import DeliveredTodaySection from './DeliveredTodaySection.jsx'
import QuickAdd from './QuickAdd.jsx'

describe('laundry hub leaf components smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('QuickNotes çökmeden render olur', () => {
    renderWithProviders(<QuickNotes />)
    expect(screen.getByText('📋 NOTLAR')).toBeInTheDocument()
  })

  it('DeliveredTodaySection çökmeden render olur', () => {
    renderWithProviders(<DeliveredTodaySection />)
    expect(screen.getByText('BUGÜN TESLİM')).toBeInTheDocument()
  })

  it('QuickAdd çökmeden render olur', () => {
    renderWithProviders(<QuickAdd onClose={() => {}} />)
    expect(screen.getByPlaceholderText('Oda / M1 205')).toBeInTheDocument()
  })
})
