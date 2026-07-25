import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CampusOverviewTable from './CampusOverviewTable.jsx'
import AttentionQueue from './AttentionQueue.jsx'

const stats = {
  M1: { block: 'M1', total_rooms: 30, total_beds: 60, occupied: 55, occupancy_pct: 92, empty_rooms: 2, full_rooms: 28, quarantine: 1, maintenance: 0, open_faults: 3, cleaning_total: 30, cleaning_done: 22, cleaning_pct: 73 },
  A: { block: 'A', total_rooms: 20, total_beds: 20, occupied: 9, occupancy_pct: 45, empty_rooms: 11, full_rooms: 9, quarantine: 0, maintenance: 0, open_faults: 0, cleaning_total: 0, cleaning_done: 0, cleaning_pct: 0 },
}

describe('CampusOverviewTable', () => {
  it('tüm blokları ve TOPLAM satırını gösterir', () => {
    render(<CampusOverviewTable stats={stats} onSelect={vi.fn()} />)
    expect(screen.getByText('M1')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('TOPLAM')).toBeInTheDocument()
    // Temizlik görevi olmayan blok "—" gösterir
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('satıra tıklayınca blok seçilir', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<CampusOverviewTable stats={stats} onSelect={onSelect} />)
    await user.click(screen.getByText('M1'))
    expect(onSelect).toHaveBeenCalledWith('M1')
  })

  it('sütun başlığına tıklayınca sıra değişir', async () => {
    const user = userEvent.setup()
    render(<CampusOverviewTable stats={stats} onSelect={vi.fn()} />)
    const firstBefore = screen.getAllByRole('row')[1].textContent
    expect(firstBefore).toContain('M1') // varsayılan: doluluk desc

    await user.click(screen.getByText(/BOŞ ODA/))
    const firstAfter = screen.getAllByRole('row')[1].textContent
    expect(firstAfter).toContain('A') // boş oda desc → A (11) önce
  })

  it('gizle/aç çalışır', async () => {
    const user = userEvent.setup()
    render(<CampusOverviewTable stats={stats} onSelect={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Gizle/ }))
    expect(screen.queryByText('TOPLAM')).not.toBeInTheDocument()
  })

  it('veri yoksa bilgilendirir', () => {
    render(<CampusOverviewTable stats={{}} onSelect={vi.fn()} />)
    expect(screen.getByText('Blok verisi yok.')).toBeInTheDocument()
  })
})

describe('AttentionQueue', () => {
  it('aksiyon bekleyenleri önem sırasıyla listeler', () => {
    render(<AttentionQueue stats={stats} onSelect={vi.fn()} />)
    expect(screen.getByText('⚠ DİKKAT GEREKENLER')).toBeInTheDocument()
    expect(screen.getByText('3 açık arıza')).toBeInTheDocument()
    expect(screen.getByText(/temizlik %73/)).toBeInTheDocument()
    expect(screen.getByText('1 karantina odası')).toBeInTheDocument()
  })

  it('satıra tıklayınca blok seçilir', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<AttentionQueue stats={stats} onSelect={onSelect} />)
    await user.click(screen.getByText('3 açık arıza'))
    expect(onSelect).toHaveBeenCalledWith('M1')
  })

  it('sorun yoksa temiz mesajı gösterir', () => {
    render(<AttentionQueue stats={{ X: { block: 'X', occupancy_pct: 50, empty_rooms: 4, open_faults: 0, cleaning_total: 2, cleaning_done: 2, cleaning_pct: 100, quarantine: 0, maintenance: 0 } }} onSelect={vi.fn()} />)
    expect(screen.getByText('AKSİYON BEKLEYEN YOK')).toBeInTheDocument()
  })
})
