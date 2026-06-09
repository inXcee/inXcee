import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import KitchenDisplayPage, { currentMealPeriod } from './KitchenDisplayPage.jsx'

const snapshot = {
  date: '2026-06-09',
  meals: {
    breakfast: { expected: 40, served: 38, remaining: 2, menu: null },
    lunch: { expected: 55, served: 12, remaining: 43, menu: 'Mercimek çorbası, Tavuk sote' },
    dinner: { expected: 50, served: 0, remaining: 50, menu: null },
    snack: { expected: 0, served: 0, remaining: 0, menu: null },
  },
  diet: [{ flag: 'vejetaryen', count: 3 }],
  tomorrow: { breakfast: 42, lunch: 51, dinner: 48, snack: 0 },
  generated_at: new Date().toISOString(),
}

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: snapshot })) },
}))

describe('KitchenDisplayPage smoke', () => {
  it('öğün kartları + menü + diyet + yarın öngörüsü render olur', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><KitchenDisplayPage /></QueryClientProvider>)
    expect(await screen.findByText(/MUTFAK/)).toBeInTheDocument()
    expect(screen.getAllByText(/ÖĞLE/).length).toBeGreaterThanOrEqual(2) // kart + yarın şeridi
    expect(screen.getByText('55')).toBeInTheDocument()       // beklenen
    expect(screen.getByText('Mercimek çorbası')).toBeInTheDocument()
    expect(screen.getByText(/vejetaryen/)).toBeInTheDocument()
    expect(screen.getByText('YARIN BEKLENEN')).toBeInTheDocument()
  })
})

describe('currentMealPeriod', () => {
  it('saat dilimine göre aktif öğünü döndürür', () => {
    expect(currentMealPeriod(7)).toBe('breakfast')
    expect(currentMealPeriod(12)).toBe('lunch')
    expect(currentMealPeriod(19)).toBe('dinner')
    expect(currentMealPeriod(3)).toBe(null)
  })
})
