import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import WaterModal from './WaterModal.jsx'

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('WaterModal', () => {
  it('alt çekmeceyi portalda açar, Escape ve perde tıklamasını kapatmaya iletir', () => {
    const onClose = vi.fn()
    document.body.style.overflow = 'auto'
    const { unmount } = render(
      <WaterModal title="Dağıtım Detayı" onClose={onClose}>
        <div>İçerik</div>
      </WaterModal>,
    )

    expect(screen.getByRole('dialog', { name: 'Dağıtım Detayı' })).toBeInTheDocument()
    expect(screen.getByText('İçerik')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('water-modal-overlay'))
    expect(onClose).toHaveBeenCalledTimes(2)

    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })
})
