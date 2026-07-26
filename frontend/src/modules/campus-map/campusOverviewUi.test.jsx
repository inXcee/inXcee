import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CampusOverviewTable from './CampusOverviewTable.jsx'
import AttentionQueue from './AttentionQueue.jsx'
import { MODES, topMetricFor, roomColor, orderPanelSections, PANEL_SECTIONS } from './shared.jsx'

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

describe('topMetricFor — her mod bir metrik üretmeli', () => {
  const totals = {
    total_beds: 100, occupied: 80, empty: 5, quarantine: 2, maintenance: 1, fault: 4,
    clean_total: 40, clean_done: 30, day: 60, night: 20,
    block_count: 19, company_count: 3, top_company: { company: 'ACME', count: 25 },
  }

  it('MODES içindeki hiçbir mod boş başlık bırakmaz (premium regresyonu)', () => {
    for (const m of MODES) {
      const metric = topMetricFor(m.id, totals)
      expect(metric.label, `${m.id} modu boş label döndürdü`).toBeTruthy()
      expect(String(metric.value), `${m.id} modu boş value döndürdü`).not.toBe('')
    }
  })

  it('şirket modu en büyük şirketi gösterir', () => {
    expect(topMetricFor('company', totals)).toMatchObject({
      label: 'EN BUYUK SIRKET', value: 'ACME', sub: '25 kisi · 3 sirket',
    })
  })

  it('veri yoksa güvenli çıktı', () => {
    expect(topMetricFor('occupancy', {}).value).toBe('—')
    expect(topMetricFor('company', {}).value).toBe('—')
    expect(topMetricFor('bilinmeyen', totals).label).toBe('')
  })
})

describe('roomColor — oda kutusu seçili modu takip eder', () => {
  const room = { active_beds: 4, occupied: 1, status: 'active', open_fault_count: 3 }

  it('doluluk modunda doluluğa, arıza modunda arıza sayısına göre renklenir', () => {
    const occ = roomColor('occupancy', room)   // %25 dolu → yeşil
    const flt = roomColor('faults', room)      // 3 arıza → turuncu
    expect(occ).toBe('#16a34a')
    expect(flt).toBe('#f59e0b')
    expect(occ).not.toBe(flt) // aynı oda, farklı modda farklı renk
  })

  it('arızasız oda arıza modunda nötr kalır', () => {
    expect(roomColor('faults', { ...room, open_fault_count: 0 })).toBe('#6b7280')
  })

  it('karantina/bakım durumu her modda öncelikli', () => {
    for (const mode of ['occupancy', 'faults', 'cleaning', 'quarantine']) {
      expect(roomColor(mode, { ...room, status: 'quarantine' })).toBe('#dc2626')
      expect(roomColor(mode, { ...room, status: 'maintenance' })).toBe('#f59e0b')
    }
  })

  it('oda bazlı verisi olmayan modlarda doluluğa düşer (uydurma renk yok)', () => {
    expect(roomColor('cleaning', room)).toBe(roomColor('occupancy', room))
    expect(roomColor('company', room)).toBe(roomColor('occupancy', room))
  })

  it('yataksız/boş oda gri', () => {
    expect(roomColor('occupancy', { active_beds: 0, occupied: 0, status: 'active' })).toBe('#6b7280')
    expect(roomColor('occupancy', {})).toBe('#6b7280')
  })
})

describe('orderPanelSections — panel bölümleri modu takip eder', () => {
  it('seçili modun bölümü başa gelir', () => {
    expect(orderPanelSections('cleaning')[0]).toBe('cleaning')
    expect(orderPanelSections('shifts')[0]).toBe('shifts')
    expect(orderPanelSections('company')[0]).toBe('company')
    expect(orderPanelSections('occupancy')[0]).toBe('occupancy')
  })

  it('kendi bölümü olmayan modda doluluk başa gelir', () => {
    expect(orderPanelSections('faults')[0]).toBe('occupancy')
    expect(orderPanelSections('quarantine')[0]).toBe('occupancy')
    expect(orderPanelSections('bilinmeyen')[0]).toBe('occupancy')
  })

  it('hiçbir bölüm kaybolmaz, tekrar etmez', () => {
    for (const mode of [...PANEL_SECTIONS, 'faults', 'quarantine']) {
      const order = orderPanelSections(mode)
      expect(order).toHaveLength(PANEL_SECTIONS.length)
      expect(new Set(order).size).toBe(PANEL_SECTIONS.length)
      expect([...order].sort()).toEqual([...PANEL_SECTIONS].sort())
    }
  })
})

describe('CampusOverviewTable — rapor indirme (Faz D1)', () => {
  it('veri varken Excel ve PDF butonlari cikar', () => {
    render(<CampusOverviewTable stats={stats} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Excel/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /PDF/ })).toBeInTheDocument()
  })

  it('veri yokken indirme butonlari cikmaz', () => {
    render(<CampusOverviewTable stats={{}} onSelect={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Excel/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /PDF/ })).not.toBeInTheDocument()
  })
})
