import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url) => {
      if (url === '/settings/email/templates') {
        return Promise.resolve({ data: {
          categories: [
            { id: 'rapor', label: 'Firma / Yönetime Rapor' },
            { id: 'personel', label: 'Personel Bilgilendirme' },
          ],
          templates: [
            { id: 'builtin:aylik-durum', category: 'rapor', name: 'Aylık Durum Raporu', subject: '{{ay}} Raporu', body: 'Sayın {{yetkili}}', builtin: true },
            { id: 'custom:7', category: 'rapor', name: 'Haftalık Not', subject: 'Not', body: 'Eski metin', builtin: false },
            { id: 'builtin:genel-duyuru', category: 'personel', name: 'Genel Duyuru', subject: 'Duyuru', body: 'Merhaba', builtin: true },
          ],
        } })
      }
      if (url === '/settings/email/contacts') return Promise.resolve({ data: [{ email: 'mudur@yys.local', label: 'mudur (yönetim)' }] })
      if (url === '/settings/email/attachments') return Promise.resolve({ data: [{ id: 1, name: 'Sipariş Formu', category: 'formlar', original_name: 'siparis.pdf', size: 2048 }] })
      return Promise.resolve({ data: [] })
    }),
    post: vi.fn(() => Promise.resolve({ data: { ok: true } })),
    put: vi.fn(() => Promise.resolve({ data: { ok: true } })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import MailComposePage from './MailComposePage.jsx'
import api from '../../shared/api/client.js'

describe('MailComposePage smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('şablonları listeler ve seçilince konu/gövde dolar, yer tutucu alanı çıkar', async () => {
    renderWithProviders(<MailComposePage />)
    // rapor kategorisi default — şablon görünür
    const tpl = await screen.findByText('Aylık Durum Raporu')
    fireEvent.click(tpl)
    // {{ay}} ve {{yetkili}} yer tutucu alanları render olur
    expect(await screen.findByText('BOŞLUKLARI DOLDUR')).toBeInTheDocument()
    expect(screen.getByText('ay')).toBeInTheDocument()
    expect(screen.getByText('yetkili')).toBeInTheDocument()
  })

  it('ek dosya arşivini gösterir', async () => {
    renderWithProviders(<MailComposePage />)
    expect(await screen.findByText('Sipariş Formu')).toBeInTheDocument()
    expect(screen.getByText(/Arşive Dosya Yükle/)).toBeInTheDocument()
  })

  it('özel şablon yerinde güncellenir, hazır şablonda güncelle düğmesi yok', async () => {
    renderWithProviders(<MailComposePage />)
    fireEvent.click(await screen.findByText('Aylık Durum Raporu'))
    expect(screen.queryByText(/Şablonu Güncelle/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Haftalık Not'))
    const btn = screen.getByRole('button', { name: /Şablonu Güncelle/ })
    expect(btn).toBeDisabled() // değişiklik yokken
    fireEvent.change(screen.getByDisplayValue('Eski metin'), { target: { value: 'Yeni metin' } })
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/settings/email/templates/7',
      { category: 'rapor', name: 'Haftalık Not', subject: 'Not', body: 'Yeni metin' }))
  })
})
