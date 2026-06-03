import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MapPin from './MapPin.jsx'

const b = { block: 'M1', type: 'M', floors: 2 }
const p = { x: 100, y: 100 }
const s = { occupancy_pct: 50, total_beds: 10, occupied: 5, open_faults: 0,
  quarantine: 0, day_count: 2, night_count: 1, cleaning_total: 0, cleaning_pct: 0 }

function renderInSvg(ui) {
  return render(<svg>{ui}</svg>)
}

describe('campus-map/MapPin smoke', () => {
  it('blok etiketini render eder', () => {
    renderInSvg(<MapPin b={b} p={p} s={s} idx={0} mode="occupancy" pinScale={1}
      showLabels={false} animateIn={false} editMode={false}
      isHover={false} isSel={false} isMulti={false} isHighlighted={false} pulse={null}
      onHoverEnter={() => {}} onHoverLeave={() => {}} onContextMenu={() => {}}
      onClick={() => {}} onPinMouseDown={() => {}} />)
    expect(screen.getByText('M1')).toBeInTheDocument()
  })

  it('tıklayınca onClick(block) tetikler', () => {
    const onClick = vi.fn()
    renderInSvg(<MapPin b={b} p={p} s={s} idx={0} mode="occupancy" pinScale={1}
      showLabels={false} animateIn={false} editMode={false}
      isHover={false} isSel={false} isMulti={false} isHighlighted={false} pulse={null}
      onHoverEnter={() => {}} onHoverLeave={() => {}} onContextMenu={() => {}}
      onClick={onClick} onPinMouseDown={() => {}} />)
    fireEvent.click(screen.getByText('M1'))
    expect(onClick).toHaveBeenCalled()
    expect(onClick.mock.calls[0][1]).toBe('M1')
  })

  it('pin gizli ve edit modu kapalıysa render etmez', () => {
    const { container } = renderInSvg(<MapPin b={b} p={{ ...p, hidden: true }} s={s} idx={0}
      mode="occupancy" pinScale={1} showLabels={false} animateIn={false} editMode={false}
      isHover={false} isSel={false} isMulti={false} isHighlighted={false} pulse={null}
      onHoverEnter={() => {}} onHoverLeave={() => {}} onContextMenu={() => {}}
      onClick={() => {}} onPinMouseDown={() => {}} />)
    expect(container.querySelector('text')).toBeNull()
  })
})
