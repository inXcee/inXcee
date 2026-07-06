import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BlockFloorView from './BlockFloorView.jsx'

describe('housekeeping/BlockFloorView smoke', () => {
  it('görev varsa koridor + oda kutucuklarını render eder', () => {
    const tasks = [
      { id: 1, block: 'M1', floor: 1, task_type: 'room', qr_location: 'M1-1-101', completed_at: null },
    ]
    const blockRooms = [{ id: 1, room_no: '101', floor: 1 }]
    render(<BlockFloorView block="M1" floor={1} tasks={tasks} dndRooms={[]} blockRooms={blockRooms} selectedRoomNo={null} onSelect={() => {}} />)
    expect(screen.getByText('KORİDOR')).toBeInTheDocument()
    expect(screen.getByText('101')).toBeInTheDocument()
  })

  it('görev yoksa boş durum gösterir', () => {
    render(<BlockFloorView block="M1" floor={1} tasks={[]} dndRooms={[]} blockRooms={[]} selectedRoomNo={null} onSelect={() => {}} />)
    expect(screen.getByText(/Görev yok/)).toBeInTheDocument()
  })
})
