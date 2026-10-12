import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import LoginPage from './LoginPage.jsx'
import api from '../../shared/api/client.js'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn() },
}))
vi.mock('../../shared/store/authStore.js', () => ({
  useAuthStore: (sel) => sel({ login: vi.fn() }),
}))

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}))

const renderPage = () => render(<MemoryRouter><LoginPage /></MemoryRouter>)

describe('LoginPage — temel davranış', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ current: {} }) }))
    // jsdom HTMLMediaElement stub — load/play yoktur
    window.HTMLMediaElement.prototype.load = vi.fn()
    window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  })

  it('4 giriş modunu gösterir', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: /Personel/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Yönetici/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Güvenlik/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Kiosk/ })).toBeInTheDocument()
  })

  it('kullanıcı adı ve şifre alanlarını render eder', () => {
    renderPage()
    // Exact match: "Şifre" etiketine göre — "Şifreyi göster" butonuyla karışmasın
    expect(screen.getByLabelText(/Kullanıcı Adı/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Şifre', { exact: false, selector: 'input' })).toBeInTheDocument()
  })

  it('Kiosk moduna geçince PIN/QR kısayollarını gösterir', () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: /Kiosk/ }))
    expect(screen.getByText(/AVS Personel/)).toBeInTheDocument()
  })
})

describe('LoginPage — passkey teklifi', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ current: {} }) }))
    window.HTMLMediaElement.prototype.load = vi.fn()
    window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
    localStorage.clear()
    api.post.mockReset()
  })

  it('2FA doğrulamasından sonra da passkey kurulumu teklif edilir', async () => {
    const user = { id: 1, username: 'mudur', role: 'campus_manager' }
    api.post.mockImplementation((url) => {
      if (url === '/auth/login') return Promise.resolve({ data: { require_2fa: true, challenge_token: 'ch' } })
      if (url === '/auth/2fa/verify-login') return Promise.resolve({ data: { user } })
      return Promise.resolve({ data: {} })
    })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Kullanıcı Adı/i), { target: { value: 'mudur' } })
    fireEvent.change(screen.getByLabelText('Şifre', { exact: false, selector: 'input' }), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /Giriş Yap/ }))

    await screen.findByLabelText('Hane 1')
    '123456'.split('').forEach((c, i) => fireEvent.change(screen.getByLabelText(`Hane ${i + 1}`), { target: { value: c } }))
    fireEvent.click(screen.getByRole('button', { name: /Doğrula/ }))

    expect(await screen.findByText(/Daha hızlı giriş/)).toBeInTheDocument()
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/2fa/verify-login', { challenge_token: 'ch', code: '123456' }, expect.anything()))
  })
})
