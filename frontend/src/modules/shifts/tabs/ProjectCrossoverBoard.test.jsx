import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import ProjectCrossoverBoard from './ProjectCrossoverBoard.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const ARALIK = { from: '2026-08-03', to: '2026-08-09' }

function mockYanit(data) {
  api.get.mockImplementation(() => Promise.resolve({ data }))
}

async function paneliAc() {
  renderWithProviders(<ProjectCrossoverBoard {...ARALIK} />)
  fireEvent.click(screen.getByRole('button', { name: /ÇAPRAZ ÇALIŞMA/ }))
}

beforeEach(() => vi.clearAllMocks())

describe('Çapraz çalışma panosu', () => {
  // Panelin asıl işi bu: boş listeyi "çapraz çalışan yok" diye sunmamak.
  it('noktalar eşlenmemişse kurulum eksiği olduğunu söyler', async () => {
    mockYanit({ rows: [], setup: { unmapped_locations: 6, unmapped_names: ['Tas Bina', 'RET Lokal'] } })
    await paneliAc()
    expect(await screen.findByText(/henüz kurulmadı/)).toBeInTheDocument()
    expect(screen.getByText(/Tas Bina · RET Lokal/)).toBeInTheDocument()
    expect(screen.queryByText(/kendi kadrosunun dışında çalışmamış/)).not.toBeInTheDocument()
  })

  it('tüm noktalar eşliyken boş sonucu net söyler', async () => {
    mockYanit({ rows: [], setup: { unmapped_locations: 0, unmapped_names: [] } })
    await paneliAc()
    expect(await screen.findByText(/kendi kadrosunun dışında çalışmamış/)).toBeInTheDocument()
    expect(screen.queryByText(/henüz kurulmadı/)).not.toBeInTheDocument()
  })

  it('çapraz çalışanları kişi bazında toplayıp gösterir', async () => {
    mockYanit({
      rows: [
        { staff_id: 1, full_name: 'ALİ VELİ', work_date: '2026-08-03', roster_project_name: 'FPU', worked_project_name: 'Kamp Alanı', work_location_name: 'Kamp' },
        { staff_id: 1, full_name: 'ALİ VELİ', work_date: '2026-08-04', roster_project_name: 'FPU', worked_project_name: 'Kamp Alanı', work_location_name: 'Kamp' },
      ],
      setup: { unmapped_locations: 0, unmapped_names: [] },
    })
    await paneliAc()
    expect(await screen.findByText('ALİ VELİ')).toBeInTheDocument()
    expect(screen.getByText('FPU → Kamp Alanı')).toBeInTheDocument()
    // Başlık rozeti + yön kartı: iki gün tek kişide toplanmalı, iki satır olmamalı.
    expect(screen.getAllByText(/1 kişi/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('ALİ VELİ')).toHaveLength(1)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  // Sonuç varken bile eksik kurulum listeyi eksik bırakabilir; bu susturulmamalı.
  it('sonuç varken de eksik eşleme uyarısını korur', async () => {
    mockYanit({
      rows: [{ staff_id: 1, full_name: 'ALİ VELİ', work_date: '2026-08-03', roster_project_name: 'FPU', worked_project_name: 'Kamp Alanı', work_location_name: 'Kamp' }],
      setup: { unmapped_locations: 3, unmapped_names: ['Tas Bina'] },
    })
    await paneliAc()
    expect(await screen.findByText(/3 nokta hâlâ projesiz/)).toBeInTheDocument()
  })

  it('panel kapalıyken istek atmaz', () => {
    mockYanit({ rows: [], setup: { unmapped_locations: 0 } })
    renderWithProviders(<ProjectCrossoverBoard {...ARALIK} />)
    expect(api.get).not.toHaveBeenCalled()
  })
})
