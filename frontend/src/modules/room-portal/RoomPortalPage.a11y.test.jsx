import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RoomPortalPage from './RoomPortalPage.jsx'
import api from '../../shared/api/client.js'
import { setLocale } from '../../shared/i18n/index.js'

vi.mock('../../shared/api/client.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

// Faz 8 — erişilebilirlik doğrulaması.
//
// Bu portalı, girişi olmayan sakinler telefonla kullanıyor: ekran okuyucuyla,
// düşük ışıkta, çoğu zaman kendi ana dilinde. Buradaki testler "erişilebilir
// olsun" temennisini DOĞRULANABİLİR kurallara çeviriyor:
//
//   • Her etkileşimli öğenin erişilebilir adı olacak (adsız düğme, ekran
//     okuyucuda "button" diye okunur — sakin ne yaptığını bilemez).
//   • Hata ve durum mesajları duyurulacak (role=alert / role=status), yoksa
//     ekranı görmeyen kişi gönderiminin başarısız olduğunu hiç fark etmez.
//   • Dil değişince belge dili ve yönü gerçekten değişecek — Arapça metni
//     lang="tr" ve soldan-sağa düzende sunmak, çeviriyi olmamış sayar.

const portalVerisi = {
  portal_status: 'active',
  location: { type: 'room', block: 'M1', floor: 1, area_code: null, display_name: 'M1 Oda 101' },
  actions: {
    fault: { enabled: true, pin_required: false },
    laundry: { enabled: true, pin_required: false },
    cleaning: { enabled: false, pin_required: false },
    survey: { enabled: true, pin_required: false },
  },
}

const ciz = () => render(
  <MemoryRouter initialEntries={['/r/token-123']}>
    <Routes><Route path="/r/:token" element={<RoomPortalPage />} /></Routes>
  </MemoryRouter>,
)

// Erişilebilir ad: görünen metin, aria-label ya da sarmalayan <label>.
const erisilebilirAd = (el) => (
  el.getAttribute('aria-label')
  || el.getAttribute('title')
  || el.textContent?.trim()
  || el.closest('label')?.textContent?.trim()
  || ''
)

describe('oda portalı erişilebilirliği', () => {
  beforeEach(() => {
    sessionStorage.clear(); localStorage.clear()
    api.get.mockReset(); api.post.mockReset()
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true)
    setLocale('tr')
  })
  afterEach(() => { setLocale('tr'); vi.restoreAllMocks() })

  it('her düğmenin erişilebilir adı vardır', async () => {
    api.get.mockResolvedValue({ data: portalVerisi })
    const { container } = ciz()
    await screen.findByText('M1 Oda 101')

    const adsiz = [...container.querySelectorAll('button')].filter(b => !erisilebilirAd(b))
    expect(adsiz.map(b => b.outerHTML.slice(0, 120))).toEqual([])
  })

  it('arıza formundaki her alan etiketlidir', async () => {
    api.get.mockResolvedValue({ data: portalVerisi })
    const { container } = ciz()
    await userEvent.click(await screen.findByRole('button', { name: /Arıza bildir/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Kimliksiz|Anonim/i }))

    const alanlar = [...container.querySelectorAll('input, textarea, select')]
    expect(alanlar.length).toBeGreaterThan(0)
    const etiketsiz = alanlar.filter(a => !erisilebilirAd(a))
    expect(etiketsiz.map(a => a.outerHTML.slice(0, 120))).toEqual([])
  })

  // Ekranı görmeyen kişi, gönderiminin başarısız olduğunu ancak duyurulursa
  // fark eder; sessiz kalan hata mesajı ona hiç ulaşmaz.
  it('hata mesajı ekran okuyucuya duyurulur', async () => {
    api.get.mockResolvedValue({ data: portalVerisi })
    api.post.mockRejectedValue({ response: { status: 400, data: { error: 'Açıklama çok kısa' } } })
    ciz()
    await userEvent.click(await screen.findByRole('button', { name: /Arıza bildir/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Kimliksiz|Anonim/i }))

    const aciklama = document.querySelector('textarea')
    await userEvent.type(aciklama, 'Priz çalışmıyor')
    await userEvent.click(screen.getByRole('button', { name: /Gönder/i }))

    const uyari = await screen.findByRole('alert')
    expect(uyari).toHaveTextContent('Açıklama çok kısa')
  })

  it('bağlantı durumu duyuru bölgesinde tutulur', async () => {
    api.get.mockResolvedValue({ data: portalVerisi })
    ciz()
    await screen.findByText('M1 Oda 101')
    const durumlar = screen.getAllByRole('status')
    expect(durumlar.length).toBeGreaterThan(0)
  })

  // Portalın üç dili var ve sakin girişsiz geliyor; seçiciye ulaşamazsa
  // çeviriler paketin içinde kalır.
  it('girişsiz sakin başlıktan dil değiştirebilir', async () => {
    api.get.mockResolvedValue({ data: portalVerisi })
    ciz()
    await screen.findByText('M1 Oda 101')

    const banner = document.querySelector('.rp-header')
    const dilDugmeleri = within(banner).getAllByRole('button')
    expect(dilDugmeleri.length).toBeGreaterThanOrEqual(2)
  })

  // Arapça metni lang="tr" ve soldan-sağa düzende sunmak çeviriyi olmamış sayar.
  it('Arapçaya geçince belge dili ve yönü değişir', async () => {
    api.get.mockResolvedValue({ data: portalVerisi })
    ciz()
    await screen.findByText('M1 Oda 101')

    setLocale('ar')
    expect(document.documentElement.getAttribute('lang')).toBe('ar')
    expect(document.documentElement.getAttribute('dir')).toBe('rtl')

    setLocale('en')
    expect(document.documentElement.getAttribute('lang')).toBe('en')
    expect(document.documentElement.getAttribute('dir')).toBe('ltr')
  })

  it('konum başlığı tek h1 olarak sunulur', async () => {
    api.get.mockResolvedValue({ data: portalVerisi })
    ciz()
    await screen.findByText('M1 Oda 101')
    // Birden fazla h1, ekran okuyucu gezinmesinde sayfanın konusunu belirsizleştirir.
    expect(document.querySelectorAll('h1')).toHaveLength(1)
  })
})
