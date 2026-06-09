import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import IncidentsTab from './IncidentsTab.jsx'

const incidents = [
  { id: 1, occurred_at: '2026-06-10 08:30', location: 'M1 merdiven', incident_type: 'near_miss',
    severity: 'moderate', description: 'Islak zeminde kayma', status: 'open', staff_name: null, actions_taken: null },
  { id: 2, occurred_at: '2026-06-09 14:00', location: null, incident_type: 'injury',
    severity: 'critical', description: 'Yüksekten düşme', status: 'closed', staff_name: 'Ali Veli', actions_taken: 'Hastaneye sevk' },
]

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: incidents })),
    post: vi.fn(() => Promise.resolve({ data: { id: 3 } })),
    patch: vi.fn(() => Promise.resolve({ data: { ok: true } })),
  },
}))

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><IncidentsTab /></QueryClientProvider>)
}

describe('IncidentsTab smoke', () => {
  it('olay listesi tip/şiddet/durum ile render olur', async () => {
    renderTab()
    expect(await screen.findByText(/Ramak kala/)).toBeInTheDocument()
    expect(screen.getByText('Islak zeminde kayma')).toBeInTheDocument()
    expect(screen.getByText('İNCELEMEYE AL', { exact: false })).toBeInTheDocument() // open kayıt aksiyonu
    expect(screen.getAllByText('KAPALI').length).toBeGreaterThanOrEqual(2) // filtre çipi + closed rozeti
    expect(screen.getByText(/Hastaneye sevk/)).toBeInTheDocument()
  })

  it('OLAY BİLDİR formu açılır, kritik şiddette bildirim uyarısı görünür', async () => {
    renderTab()
    fireEvent.click(await screen.findByText('+ OLAY BİLDİR'))
    expect(screen.getByText('Olay zamanı *')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('Hafif'), { target: { value: 'critical' } })
    expect(screen.getByText(/yönetime anında bildirim/)).toBeInTheDocument()
  })
})
