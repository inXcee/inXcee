import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import AgentKeysPage from './AgentKeysPage.jsx'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../shared/components/ConfirmDialog.jsx', () => ({ confirmDialog: vi.fn(() => Promise.resolve(true)) }))

const base = {
  id: 1, name: 'hermes', key_prefix: 'yysa_abcdef', access: 'write', created_at: '2026-11-11 18:58:00',
  expires_at: null, last_used_at: null, use_count: 0, revoked_at: null, user_id: 9,
  username: 'hermes', full_name: 'Hermes (ajan)', role: 'campus_manager', user_active: 1,
}

function mockKeys(keys) {
  api.get.mockImplementation(url => Promise.resolve({ data: url === '/agent/keys' ? keys : [] }))
}

describe('Ajan anahtarları — kasa izni', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.patch.mockResolvedValue({ data: { id: 1, kasa_access: 'read' } })
  })

  it('sahip olmayan müdür (listede kasa sütunu yok) kasa kontrolünü görmez', async () => {
    mockKeys([base])
    renderWithProviders(<AgentKeysPage />)
    await screen.findByText(/Hermes \(ajan\)/)
    expect(screen.queryByLabelText('hermes kasa izni')).toBeNull()
  })

  it('sahip okuma izni verir — onay sormadan', async () => {
    mockKeys([{ ...base, kasa_access: null, kasa_granted_at: null }])
    renderWithProviders(<AgentKeysPage />)
    const select = await screen.findByLabelText('hermes kasa izni')
    expect(select.value).toBe('')
    fireEvent.change(select, { target: { value: 'read' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/agent/keys/1/kasa', { access: 'read' }))
    expect(confirmDialog).not.toHaveBeenCalled()
  })

  it('yazma izni onay ister; vazgeçilirse istek gitmez', async () => {
    confirmDialog.mockResolvedValueOnce(false)
    mockKeys([{ ...base, kasa_access: 'read', kasa_granted_at: '2026-11-12 16:24:00' }])
    renderWithProviders(<AgentKeysPage />)
    fireEvent.change(await screen.findByLabelText('hermes kasa izni'), { target: { value: 'write' } })
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled())
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('kapatma isteği access:null gönderir', async () => {
    mockKeys([{ ...base, kasa_access: 'read', kasa_granted_at: '2026-11-12 16:24:00' }])
    renderWithProviders(<AgentKeysPage />)
    fireEvent.change(await screen.findByLabelText('hermes kasa izni'), { target: { value: '' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/agent/keys/1/kasa', { access: null }))
  })
})
