import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import api from '../api/client.js'
import KioskSessionGate from './KioskSessionGate.jsx'

vi.mock('../api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

const readySession = {
  mode: 'shared', idle_minutes: 2, absolute_expires_at: '2099-01-01T00:00:00.000Z',
  locked: false, must_change_pin: false,
}

describe('KioskSessionGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { session: { ...readySession, must_change_pin: true } } })
    api.post.mockResolvedValue({ data: { session: readySession } })
  })

  it('ilk girişte 4 haneli PIN doğrulamasını zorunlu tutar ve kalıcı PIN endpointini çağırır', async () => {
    const onSessionChange = vi.fn()
    render(<KioskSessionGate token="token-1" session={readySession} mustChange onSessionChange={onSessionChange} />)
    expect(screen.getByText(/kalıcı PIN’i belirleyin/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('4 haneli yeni PIN'), { target: { value: '7319' } })
    fireEvent.change(screen.getByLabelText('PIN’i tekrar girin'), { target: { value: '7319' } })
    fireEvent.click(screen.getByRole('button', { name: 'PIN’i kaydet ve devam et' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/auth/kiosk-first-pin-change',
      { new_pin: '7319' },
      { headers: { Authorization: 'Bearer token-1' } },
    ))
    expect(onSessionChange).toHaveBeenCalledWith(readySession)
  })

  it('sunucudan gelen kilit olayında PIN kilidini gösterir ve aynı oturumu açar', async () => {
    api.get.mockResolvedValue({ data: { session: readySession } })
    render(<KioskSessionGate token="token-2" session={readySession} />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    act(() => window.dispatchEvent(new CustomEvent('kiosk-session-state', { detail: { code: 'SESSION_LOCKED' } })))
    expect(await screen.findByText(/Devam etmek için PIN’inizi girin/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('4 haneli yeni PIN'), { target: { value: '7319' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kilidi aç' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/auth/kiosk-unlock',
      { pin: '7319' },
      { headers: { Authorization: 'Bearer token-2' } },
    ))
  })
})
