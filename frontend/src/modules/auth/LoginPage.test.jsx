import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import LoginPage from './LoginPage.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn() },
}))
vi.mock('../../shared/store/authStore.js', () => ({
  useAuthStore: (sel) => sel({ login: vi.fn() }),
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
