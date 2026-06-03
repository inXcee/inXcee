import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RoomTile from './RoomTile.jsx'

describe('housekeeping/RoomTile smoke', () => {
  it('oda no render eder ve tıklayınca onSelect tetikler', () => {
    const onSelect = vi.fn()
    render(<RoomTile rno="101" task={null} roomInfo={null} isM={true} selected={false} onSelect={onSelect} />)
    const tile = screen.getByText('101')
    expect(tile).toBeInTheDocument()
    fireEvent.click(tile)
    expect(onSelect).toHaveBeenCalledWith('101')
  })

  it('tamamlanmış görevde TEMİZ durumunu gösterir (title)', () => {
    render(<RoomTile rno="102" task={{ completed_at: '2026-01-01' }} roomInfo={null} isM={true} selected={false} onSelect={() => {}} />)
    expect(screen.getByTitle('Oda 102 — TEMİZ')).toBeInTheDocument()
  })
})
