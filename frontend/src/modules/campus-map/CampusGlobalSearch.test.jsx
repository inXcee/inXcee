import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CampusGlobalSearch from './CampusGlobalSearch.jsx'

describe('CampusGlobalSearch', () => {
  it('oda sonucunu seçili blok ve oda bağlamıyla üst bileşene iletir', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <CampusGlobalSearch
        query="203"
        open
        onQueryChange={vi.fn()}
        onOpenChange={vi.fn()}
        blocks={[]}
        rooms={[{ id: 11, block: 'M1', room_no: '203', occupied: 2, active_beds: 4 }]}
        personnel={[]}
        faults={[]}
        permissions={{ rooms: true }}
        role="campus_manager"
        onSelect={onSelect}
      />,
    )

    await user.click(screen.getByText('M1-203'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      type: 'room', block: 'M1', roomId: 11,
    }))
  })
})
