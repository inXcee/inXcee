import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepBar, AutoInput, STEPS, INIT_FORM_DATA } from './shared.jsx'

describe('checkin/shared primitive\'leri', () => {
  it('STEPS + INIT_FORM_DATA dışa aktarılır', () => {
    expect(STEPS.map(s => s.key)).toEqual(['search', 'register', 'room', 'zimmet'])
    expect(INIT_FORM_DATA.full_name).toBe('')
  })

  it('StepBar aktif adım etiketini gösterir', () => {
    render(<StepBar step={1} onStepClick={() => {}} />)
    expect(screen.getByText('KAYIT')).toBeInTheDocument()
  })

  it('AutoInput öneriye tıklayınca onChange tetikler', () => {
    const onChange = vi.fn()
    render(<AutoInput label="Firma" value="ab" onChange={onChange} suggestions={['ABC İnşaat']} placeholder="" />)
    const input = screen.getByPlaceholderText('')
    fireEvent.focus(input)
    fireEvent.mouseDown(screen.getByText('ABC İnşaat'))
    expect(onChange).toHaveBeenCalledWith('ABC İnşaat')
  })
})
