import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../api.js', () => ({
  laundryApi: {
    getItemHistory: vi.fn(() => Promise.resolve([])),
    deleteItem: vi.fn(() => Promise.resolve({})),
  },
}))

import ItemCard from './ItemCard.jsx'

const sampleItem = {
  id: 1,
  status: 'dirty',
  block: 'M1',
  room_no: '101',
  occupant_name: 'Test Personel',
  item_count: 3,
  clothing_items: null,
  is_premium: 0,
  needs_ironing: 0,
  damage_count: 0,
  urgent: 0,
  all_present: 1,
  hours_in_status: 2,
}

describe('ItemCard smoke (çamaşır torbası akışı)', () => {
  it('çökmeden render olur ve durum akışını gösterir', () => {
    renderWithProviders(
      <ItemCard item={sampleItem} machines={[]} onDeliver={() => {}} onDamage={() => {}} onSelect={() => {}} />
    )
    // Durum akışı render oldu (Sepet = dirty etiketi)
    expect(screen.getByText('Sepet')).toBeInTheDocument()
    // Parça sayısı render oldu (akış UI'si çalışıyor)
    expect(screen.getByText(/parça/)).toBeInTheDocument()
  })
})
