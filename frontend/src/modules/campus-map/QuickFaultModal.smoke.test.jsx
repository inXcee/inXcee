import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../shared/api/client.js', () => ({
  default: { post: vi.fn(() => Promise.resolve({})) },
}))

import QuickFaultModal from './QuickFaultModal.jsx'

describe('campus-map/QuickFaultModal smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('form alanlarını + blok başlığını render eder', () => {
    render(<QuickFaultModal block="S2" onClose={() => {}} onSuccess={() => {}} />)
    expect(screen.getByText('HIZLI ARIZA')).toBeInTheDocument()
    expect(screen.getByText('BLOK S2')).toBeInTheDocument()
    expect(screen.getByText('⚠ ARIZA BILDIR')).toBeInTheDocument()
  })

  it('overlay\'e tıklayınca onClose tetikler', () => {
    const onClose = vi.fn()
    render(<QuickFaultModal block="S2" onClose={onClose} onSuccess={() => {}} />)
    fireEvent.click(screen.getByText('IPTAL'))
    expect(onClose).toHaveBeenCalled()
  })
})
