import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LocationPicker from './LocationPicker.jsx'

describe('LocationPicker smoke', () => {
  it('blok tipi butonlarını gösterir ve oda seçimi konum metni üretir', () => {
    const onChange = vi.fn()
    render(<LocationPicker value="" onChange={onChange} />)
    expect(screen.getByText('M BLOK')).toBeInTheDocument()
    expect(screen.getByText('S BLOK')).toBeInTheDocument()
    // M1 blok → kat 1 → ilk oda seçilince "M1 Kat 1 Oda ..." üretilir
    fireEvent.click(screen.getByText('M1'))
    fireEvent.click(screen.getByText('KAT 1'))
    const room = screen.getByText('101')
    fireEvent.click(room)
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^M1 Kat 1 Oda 101$/))
  })
})
