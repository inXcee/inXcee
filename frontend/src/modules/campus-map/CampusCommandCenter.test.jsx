import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CampusCommandCenter from './CampusCommandCenter.jsx'

const stats = {
  M1: {
    block: 'M1', total_beds: 60, occupied: 58, occupancy_pct: 97,
    open_faults: 2, quarantine: 1, maintenance: 0,
    cleaning_total: 20, cleaning_done: 16,
  },
}

describe('CampusCommandCenter', () => {
  it('operasyon özeti ve tüm hızlı işlemleri gösterir', () => {
    render(<CampusCommandCenter stats={stats} onNavigate={vi.fn()} onModeChange={vi.fn()} onSelectBlock={vi.fn()} />)
    expect(screen.getByText('YÖNETİM MERKEZİ')).toBeInTheDocument()
    expect(screen.getByText('Check-in')).toBeInTheDocument()
    expect(screen.getByText('Teknik servis')).toBeInTheDocument()
    expect(screen.getByText('Raporlar')).toBeInTheDocument()
    expect(screen.getByText('M1')).toBeInTheDocument()
  })

  it('metrik, blok ve modül tıklamalarını üst bileşene iletir', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    const onModeChange = vi.fn()
    const onSelectBlock = vi.fn()
    render(<CampusCommandCenter stats={stats} onNavigate={onNavigate} onModeChange={onModeChange} onSelectBlock={onSelectBlock} />)

    await user.click(screen.getByText('AÇIK ARIZA'))
    expect(onModeChange).toHaveBeenCalledWith('faults')
    await user.click(screen.getByText('Teknik servis'))
    expect(onNavigate).toHaveBeenCalledWith('/maintenance')
    await user.click(screen.getByText('M1'))
    expect(onSelectBlock).toHaveBeenCalledWith('M1')
  })

  it('başlıktan daraltılıp yeniden açılabilir', async () => {
    const user = userEvent.setup()
    render(<CampusCommandCenter stats={stats} onNavigate={vi.fn()} onModeChange={vi.fn()} onSelectBlock={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /YÖNETİM MERKEZİ/ }))
    await waitFor(() => expect(screen.queryByText('HIZLI İŞLEMLER')).not.toBeInTheDocument())
  })

  it('eşleşmemiş arızada backend veri kalitesi uyarısını gösterir', () => {
    render(
      <CampusCommandCenter
        stats={stats}
        operations={{
          blocks: stats,
          campus: { health_score: 79, status: 'data_issue' },
          data_quality: { unmapped_fault_count: 1 },
        }}
        onNavigate={vi.fn()}
        onModeChange={vi.fn()}
        onSelectBlock={vi.fn()}
      />,
    )
    expect(screen.getByText(/1 eşleşmemiş arıza konumu/)).toBeInTheDocument()
    expect(screen.getByText(/VERI SORUNU · 79\/100/)).toBeInTheDocument()
  })
})
