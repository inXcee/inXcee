import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { fmt, INIT_CARD, PREDEFINED_REASONS, KPI, AutoReason } from './shared.jsx'

describe('discipline/shared primitive\'leri', () => {
  it('INIT_CARD + PREDEFINED_REASONS dışa aktarılır', () => {
    expect(INIT_CARD).toEqual({ card_type: 'yellow', reason: '' })
    expect(PREDEFINED_REASONS).toContain('Alkol kullanımı')
  })

  it('fmt geçersiz değerde tire döner', () => {
    expect(fmt(null)).toBe('—')
    expect(fmt('2026-01-15')).toMatch(/2026/)
  })

  it('KPI etiket + değer render eder', () => {
    render(<KPI label="TOPLAM" value={42} sub="alt" />)
    expect(screen.getByText('TOPLAM')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('alt')).toBeInTheDocument()
  })

  it('AutoReason öneriye tıklayınca onChange tetikler', () => {
    const onChange = vi.fn()
    render(<AutoReason value="alkol" onChange={onChange} suggestions={[]} />)
    const input = screen.getByPlaceholderText(/İhlal sebebi/)
    fireEvent.focus(input)
    fireEvent.click(screen.getByText('Alkol kullanımı'))
    expect(onChange).toHaveBeenCalledWith('Alkol kullanımı')
  })
})
