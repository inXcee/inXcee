import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import OrtakAlanCard from './OrtakAlanCard.jsx'

describe('housekeeping/OrtakAlanCard smoke', () => {
  it('bekleyen görevde Tamam butonu onComplete tetikler', () => {
    const onComplete = vi.fn()
    renderWithProviders(<OrtakAlanCard task={{ id: 7, completed_at: null, skipped: 0 }} block="M1" floor={1} onComplete={onComplete} onUncomplete={() => {}} onSkip={() => {}} />)
    expect(screen.getByText(/ORTAK ALAN/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('✓ Tamam'))
    expect(onComplete).toHaveBeenCalledWith(7, null, null)
  })

  it('görev yoksa "Görev yok" gösterir', () => {
    renderWithProviders(<OrtakAlanCard task={null} block="M1" floor={1} onComplete={() => {}} onUncomplete={() => {}} onSkip={() => {}} />)
    expect(screen.getByText('Görev yok')).toBeInTheDocument()
  })

  it('tamamlanan görevde foto kanıtı thumbnail render olur + geçmiş butonu var', () => {
    renderWithProviders(
      <OrtakAlanCard
        task={{ id: 8, completed_at: '2026-06-11 09:00:00', skipped: 0, photo_url: '/uploads/test.jpg', assignee_name: 'Temizlikçi' }}
        block="M1" floor={1}
        onComplete={() => {}} onUncomplete={() => {}} onSkip={() => {}} />
    )
    expect(screen.getByAltText('temizlik kanıtı')).toBeInTheDocument()
    expect(screen.getByTitle('14 günlük temizlik geçmişi')).toBeInTheDocument()
  })
})
