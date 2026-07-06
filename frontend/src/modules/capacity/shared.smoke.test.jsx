import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RoomCell, GhostCell, FacilityCell, roomCls } from './shared.jsx'

describe('capacity/shared sunum primitive\'leri', () => {
  it('roomCls doluluk/duruma göre sınıf döndürür', () => {
    expect(roomCls({ status: 'maintenance' })).toBe('r-maint')
    expect(roomCls({ occupied: 0 }, 6)).toBe('r-empty')
    expect(roomCls({ occupied: 6 }, 6)).toBe('r-full')
    expect(roomCls({ occupied: 3 }, 6)).toBe('r-partial')
  })

  it('RoomCell oda no ve doluluk gösterir', () => {
    render(<RoomCell room={{ id: 1, room_no: '101', occupied: 2, block: 'M1' }} onClick={() => {}} defaultCap={6} />)
    expect(screen.getByText('101')).toBeInTheDocument()
    expect(screen.getByText('2/6')).toBeInTheDocument()
  })

  it('GhostCell boş oda no\'sunu gösterir', () => {
    render(<GhostCell roomNo={42} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('FacilityCell tipini gösterir', () => {
    render(<FacilityCell type="WC" />)
    expect(screen.getByText('WC')).toBeInTheDocument()
  })
})
