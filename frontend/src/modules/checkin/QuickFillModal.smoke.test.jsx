import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QuickFillModal from './QuickFillModal.jsx'

const room = { block: 'M1', room_no: '101', current_count: 2, active_beds: 6 }

describe('QuickFillModal smoke', () => {
  it('oda bilgisini gösterir ve onayda onConfirm çağırır', () => {
    const onConfirm = vi.fn()
    render(<QuickFillModal room={room} count={1} setCount={() => {}} onConfirm={onConfirm} onClose={() => {}} loading={false} />)
    expect(screen.getByText('M1 BLOK — ODA 101')).toBeInTheDocument()
    fireEvent.click(screen.getByText('✓ 1 Kişi Ekle'))
    expect(onConfirm).toHaveBeenCalled()
  })
})
