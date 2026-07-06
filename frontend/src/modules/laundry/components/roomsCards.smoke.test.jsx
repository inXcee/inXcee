import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoomCard, OccupantRow, PremiumGarmentsCard } from './roomsCards.jsx'

describe('roomsCards smoke', () => {
  it('RoomCard oda no + aktif rozetini gösterir, tık callback çalışır', () => {
    const onClick = vi.fn()
    const { container } = render(<RoomCard room={{ block: 'M1', room_no: '101', active_count: 3, urgent_active: 1, total_count: 10, last_7d_count: 4 }} onClick={onClick} pinned={false} onPin={() => {}} />)
    expect(screen.getByText('⚡ 3')).toBeInTheDocument()  // urgent rozeti render oldu
    fireEvent.click(container.querySelector('.panel'))
    expect(onClick).toHaveBeenCalled()
  })

  it('RoomCard pin butonu onPin tetikler, tık yayılmaz', () => {
    const onClick = vi.fn()
    const onPin = vi.fn()
    render(<RoomCard room={{ block: 'S2', room_no: '5', total_count: 0 }} onClick={onClick} pinned onPin={onPin} />)
    fireEvent.click(screen.getByTitle('Favoriden çıkar'))
    expect(onPin).toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('OccupantRow sakin adı + geçmiş butonu', () => {
    const onOpenHistory = vi.fn()
    render(<OccupantRow occupant={{ bed_no: 1, full_name: 'Ali Veli', company: 'ACME' }} stats={{ total: 5, lost: 1 }} block="M1" room_no="101" onOpenHistory={onOpenHistory} />)
    expect(screen.getByText(/Ali Veli/)).toBeInTheDocument()
    expect(screen.getByText('5 torba')).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Ali Veli/))
    expect(onOpenHistory).toHaveBeenCalled()
  })

  it('PremiumGarmentsCard torba + parça sayısı, durum etiketi', () => {
    render(<PremiumGarmentsCard items={[{ item_id: 1, bag_no: 'B-1', status: 'washing', garments: [{ id: 1, garment_code: 'G1', garment_type: 'Gömlek', status: 'ironing' }] }]} />)
    expect(screen.getByText(/PREMIUM PARÇALAR/)).toBeInTheDocument()
    expect(screen.getByText('Gömlek')).toBeInTheDocument()
    expect(screen.getByText('Ütüde')).toBeInTheDocument()
  })
})
