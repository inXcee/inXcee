import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ContextMenu from './ContextMenu.jsx'

describe('campus-map/ContextMenu smoke', () => {
  it('manager için tüm eylemleri gösterir ve onAction tetikler', () => {
    const onAction = vi.fn()
    render(<ContextMenu block="M1" x={10} y={10} isManager={true} onClose={() => {}} onAction={onAction} />)
    expect(screen.getByText('BLOK M1')).toBeInTheDocument()
    expect(screen.getByText('Karantinaya al')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Detay paneli ac'))
    expect(onAction).toHaveBeenCalledWith('detail')
  })

  it('manager değilse yönetici eylemleri gizli', () => {
    render(<ContextMenu block="M1" x={10} y={10} isManager={false} onClose={() => {}} onAction={() => {}} />)
    expect(screen.queryByText('Karantinaya al')).not.toBeInTheDocument()
    expect(screen.getByText('Linki kopyala')).toBeInTheDocument()
  })
})
