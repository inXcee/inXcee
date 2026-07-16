import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { todayStr } from '../logic/waterUi.js'
import WaterDailyDigestPanel, { dailyDigestRefetchInterval } from './WaterDailyDigestPanel.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <WaterDailyDigestPanel />
    </QueryClientProvider>,
  )
}

describe('WaterDailyDigestPanel', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { role: 'campus_manager', username: 'mudur' } })
    api.get.mockResolvedValue({
      data: {
        schedule: { time: '06:15', timezone: 'Europe/Istanbul' },
        smtp: { configured: true, missing: [] },
        recipients: ['mudur@example.com', 'vardiya@example.com'],
        rows: [{
          id: 53,
          date: todayStr(),
          status: 'failed',
          source: 'cron',
          recipients: ['mudur@example.com', 'vardiya@example.com'],
          summary: {
            parts: ['1 eksi stok', '2 sipariş önerisi'],
            summary: { pending: 0, negative: 1, low: 0 },
            order_count: 2,
          },
          attempts: 5,
          max_attempts: 5,
          error: 'SMTP bağlantı zaman aşımı',
          updated_at: '2026-07-15 06:17:00',
        }],
      },
    })
    api.post.mockResolvedValue({ data: { email: { status: 'queued' } } })
  })

  afterEach(() => {
    useAuthStore.setState({ user: null })
    vi.clearAllMocks()
  })

  it('teslim hatasını, SMTP/alıcı durumunu ve elle yeniden denemeyi gösterir', async () => {
    renderPanel()

    expect(screen.getByText('Günlük Özet Teslimi')).toBeInTheDocument()
    expect(await screen.findByText('Gönderilemedi')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '▼ Teslim geçmişi' }))

    expect(screen.getByText('Gönderime hazır')).toBeInTheDocument()
    expect(screen.getByText(/2 alıcı/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('SMTP bağlantı zaman aşımı')

    fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/water/daily-digest/run', { force: true }))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
  })

  it('yenileme sıklığını panel ve aktif teslim durumuna göre azaltır', () => {
    const today = todayStr()
    expect(dailyDigestRefetchInterval({ data: { rows: [] }, open: false, today })).toBe(300000)
    expect(dailyDigestRefetchInterval({ data: { rows: [] }, open: true, today })).toBe(60000)
    expect(dailyDigestRefetchInterval({
      data: { rows: [{ date: today, status: 'queued' }] },
      open: false,
      today,
    })).toBe(5000)
    expect(dailyDigestRefetchInterval({ data: { rows: [] }, open: true, today, testMode: true })).toBe(false)
  })
})
