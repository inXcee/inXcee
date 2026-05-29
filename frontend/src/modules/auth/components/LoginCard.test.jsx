import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LoginCard } from './LoginCard.jsx'

const base = {
  mode: 'standard',
  onModeChange: vi.fn(),
  modeOrder: [
    ['standard', '👤', 'Personel'],
    ['admin', '🛡️', 'Yönetici'],
    ['security', '🚪', 'Güvenlik'],
    ['kiosk', '📟', 'Kiosk'],
  ],
  modeTitles: {
    standard: ['Personel Girişi', 'alt'],
    admin: ['Yönetici Girişi', 'alt'],
    security: ['Güvenlik Girişi', 'alt'],
  },
  isForm: true,
  username: '',
  setUsername: vi.fn(),
  password: '',
  setPassword: vi.fn(),
  showPw: false,
  setShowPw: vi.fn(),
  capsLock: false,
  setCapsLock: vi.fn(),
  error: '',
  loading: false,
  isLocked: false,
  cooldownLeft: 0,
  onSubmit: vi.fn(),
  twoFA: null,
  code: '',
  setCode: vi.fn(),
  shake: false,
  onVerify2fa: vi.fn(),
  onCancel2fa: vi.fn(),
  onForgot: vi.fn(),
  kiosks: [],
  onKioskNav: vi.fn(),
  demoUsers: [],
  onPickDemo: vi.fn(),
  isDev: false,
}

describe('LoginCard', () => {
  it('mod sekmelerini ve form alanlarını render eder', () => {
    render(<LoginCard {...base} />)
    expect(screen.getByLabelText(/Kullanıcı Adı/i, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Yönetici/ })).toBeInTheDocument()
  })

  it('dil seçicide TR/EN/AR gösterir', () => {
    render(<LoginCard {...base} />)
    expect(screen.getByRole('button', { name: 'TR' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AR' })).toBeInTheDocument()
  })

  it('submit çağrılır', () => {
    render(<LoginCard {...base} />)
    fireEvent.submit(
      screen.getByLabelText(/Kullanıcı Adı/i, { selector: 'input' }).closest('form')
    )
    expect(base.onSubmit).toHaveBeenCalled()
  })
})
