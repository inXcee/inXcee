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

  it('kapalı oda KAPALI, kilitli oda notuyla KİLİTLİ, gececi rozetiyle gösterilir', () => {
    render(<RoomTile rno="110" task={{ skipped: 1 }} roomInfo={{ use_state: 'closed' }} isM={true} selected={false} onSelect={() => {}} />)
    expect(screen.getByTitle('Oda 110 — KAPALI')).toBeInTheDocument()
    render(<RoomTile rno="111" task={{ skipped: 1 }} roomInfo={{ use_state: 'locked', state_note: 'anahtar yok', occupant_shift: 'night' }}
      isM={true} selected={false} onSelect={() => {}} />)
    expect(screen.getByTitle(/^Oda 111 — KİLİTLİ \(anahtar yok\) · Gececi/)).toBeInTheDocument()
    expect(screen.getByText('☾')).toBeInTheDocument()
  })

  it('tamamlanmış kapalı oda yine TEMİZ görünür (yapılan iş gizlenmez)', () => {
    render(<RoomTile rno="112" task={{ completed_at: '2026-01-01' }} roomInfo={{ use_state: 'closed' }} isM={true} selected={false} onSelect={() => {}} />)
    expect(screen.getByTitle('Oda 112 — TEMİZ')).toBeInTheDocument()
  })

  it('kanıt fotoğrafı olan odada kamera göstergesi gösterir', () => {
    render(<RoomTile rno="103" task={{ completed_at: '2026-01-01', photo_url: '/uploads/room.jpg' }} roomInfo={null} isM={true} selected={false} onSelect={() => {}} />)
    expect(screen.getByTitle('Temizlik kanıt fotoğrafı var')).toBeInTheDocument()
  })
})
