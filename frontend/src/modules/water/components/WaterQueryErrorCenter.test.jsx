import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WaterQueryErrorCenter from './WaterQueryErrorCenter.jsx'

function QueryProbe({ queryFn }) {
  useQuery({ queryKey: ['water-summary', '2026-07'], queryFn, retry: false })
  return null
}

describe('WaterQueryErrorCenter', () => {
  it('hata kaynagini gosterir ve yalnizca basarisiz sorguyu yeniden dener', async () => {
    let shouldFail = true
    const queryFn = vi.fn(async () => {
      if (shouldFail) {
        throw Object.assign(new Error('request failed'), {
          response: { status: 500, data: { error: 'Sunucu hatası' } },
        })
      }
      return { totals: {} }
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WaterQueryErrorCenter />
        <QueryProbe queryFn={queryFn} />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Genel stok özeti')
    expect(screen.getByRole('alert')).toHaveTextContent('Sunucu hatası')

    shouldFail = false
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
