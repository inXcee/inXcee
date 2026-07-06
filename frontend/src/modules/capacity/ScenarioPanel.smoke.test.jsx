import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ScenarioPanel from './ScenarioPanel.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {
      blocks: [
        { block: 'A', total_beds: 20, occupied: 5, empty: 15 },
        { block: 'M1', total_beds: 360, occupied: 300, empty: 60 },
      ],
      totals: { total_beds: 380, occupied: 305, empty: 75, pct: 80 },
    } })),
  },
}))

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ScenarioPanel onClose={() => {}} /></QueryClientProvider>)
}

describe('ScenarioPanel smoke', () => {
  it('boş yatak özetini gösterir, sayı girilince yerleşim planı çıkar', async () => {
    renderPanel()
    expect(await screen.findByText(/boş yatak var/)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('örn. 120'), { target: { value: '70' } })
    expect(await screen.findByText('YERLEŞİR')).toBeInTheDocument()
    expect(screen.getByText('+60')).toBeInTheDocument() // M1'e 60
    expect(screen.getByText('+10')).toBeInTheDocument() // A'ya 10
    expect(screen.getByText(/DOLDU/)).toBeInTheDocument() // M1 boş=0
  })

  it('kapasite yetmeyince YER YOK uyarısı', async () => {
    renderPanel()
    fireEvent.change(await screen.findByPlaceholderText('örn. 120'), { target: { value: '100' } })
    expect(await screen.findByText(/kişiye yer YOK/)).toBeInTheDocument()
  })
})
