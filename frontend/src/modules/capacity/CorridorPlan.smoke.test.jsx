import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CorridorPlan from './CorridorPlan.jsx'

describe('CorridorPlan smoke', () => {
  it('koridor düzenini + blok/kat bilgisini render eder', () => {
    const rooms = [{ id: 1, room_no: '101', floor: 1, occupied: 2, block: 'M1' }]
    render(<CorridorPlan block="M1" floor={1} rooms={rooms} selectedRoom={null} onSelect={() => {}} />)
    expect(screen.getByText('KORİDOR')).toBeInTheDocument()
    expect(screen.getByText('SOL', { exact: false })).toBeInTheDocument()
  })
})
