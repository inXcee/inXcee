import { createRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WaterCollapsiblePanel from './WaterCollapsiblePanel.jsx'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <WaterCollapsiblePanel
      id="test-water-panel"
      open={open}
      onToggle={() => setOpen(value => !value)}
      title="Test paneli"
      subtitle="Kontrollü açılır alan"
      openLabel="Detay"
      closeLabel="Kapat"
      beforeToggle={<span>Durum</span>}
      afterToggle={<button type="button">Ek işlem</button>}
    >
      <div>Panel içeriği</div>
    </WaterCollapsiblePanel>
  )
}

describe('WaterCollapsiblePanel', () => {
  it('kontrollü açılma durumunu ve erişilebilir bağlantıyı yönetir', () => {
    render(<Harness />)

    const toggle = screen.getByRole('button', { name: '▼ Detay' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'test-water-panel-body')
    expect(screen.queryByText('Panel içeriği')).not.toBeInTheDocument()

    fireEvent.click(toggle)

    const close = screen.getByRole('button', { name: '▲ Kapat' })
    expect(close).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Panel içeriği')).toBeInTheDocument()
    expect(document.getElementById('test-water-panel-body')).toBeInTheDocument()
  })

  it('kök elemana ref iletir ve başlık aksiyonlarını korur', () => {
    const ref = createRef()
    render(
      <WaterCollapsiblePanel
        ref={ref}
        id="ref-water-panel"
        open={false}
        onToggle={() => {}}
        title="Başlık"
        beforeToggle={<span>Önce</span>}
        afterToggle={<span>Sonra</span>}
      />,
    )

    expect(ref.current).toHaveAttribute('id', 'ref-water-panel')
    expect(screen.getByText('Önce')).toBeInTheDocument()
    expect(screen.getByText('Sonra')).toBeInTheDocument()
  })
})
