import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../api.js', () => ({
  laundryApi: {
    getItemHistory: vi.fn(() => Promise.resolve([])),
    collectItem: vi.fn(() => Promise.resolve({})),
  },
}))

import { KanbanCard, KanbanCol } from './KanbanBoard.jsx'

const ITEM = { id: 1, block: 'A', room_no: '101', status: 'dirty', item_count: 2 }

describe('Kanban components smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('KanbanCard çökmeden render olur', () => {
    renderWithProviders(<KanbanCard item={ITEM} machines={[]} onDeliver={() => {}} onDamage={() => {}} onPersonClick={() => {}} onFound={() => {}} />)
    expect(screen.getByText('2 parça')).toBeInTheDocument()
  })

  it('KanbanCol boş kolonu çökmeden render olur', () => {
    renderWithProviders(
      <DndContext>
        <KanbanCol title="TEST KOLON" color="#000" items={[]} colStatus="dirty" isOver={false} machines={[]} groupByRoom={false} />
      </DndContext>
    )
    expect(screen.getByText('TEST KOLON')).toBeInTheDocument()
    expect(screen.getByText('boş')).toBeInTheDocument()
  })
})
