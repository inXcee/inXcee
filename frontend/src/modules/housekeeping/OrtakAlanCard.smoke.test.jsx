import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OrtakAlanCard from './OrtakAlanCard.jsx'

describe('housekeeping/OrtakAlanCard smoke', () => {
  it('bekleyen görevde Tamam butonu onComplete tetikler', () => {
    const onComplete = vi.fn()
    render(<OrtakAlanCard task={{ id: 7, completed_at: null, skipped: 0 }} onComplete={onComplete} onUncomplete={() => {}} onSkip={() => {}} />)
    expect(screen.getByText(/ORTAK ALAN/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('✓ Tamam'))
    expect(onComplete).toHaveBeenCalledWith(7, null)
  })

  it('görev yoksa "Görev yok" gösterir', () => {
    render(<OrtakAlanCard task={null} onComplete={() => {}} onUncomplete={() => {}} onSkip={() => {}} />)
    expect(screen.getByText('Görev yok')).toBeInTheDocument()
  })
})
