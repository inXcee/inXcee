import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SettingsLayout from './SettingsLayout.jsx'
import SettingsHomePage from './SettingsHomePage.jsx'
import { useAuthStore } from '../../shared/store/authStore.js'

// Ayarlar 37 kalemlik düz bir listeydi: arama yok, açıklama yok, gruplar hep
// açık. Buradaki testler aramanın, sık kullanılanın ve rol süzgecinin
// çalıştığını tutar — özellikle aramanın yetkisiz sayfaya arka kapı olmadığını.

const kur = (role = 'campus_manager', yol = '/settings') => {
  useAuthStore.setState({ user: { id: 1, role, full_name: 'Test' } })
  return render(
    <MemoryRouter initialEntries={[yol]}>
      <Routes>
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<SettingsHomePage />} />
          <Route path="backup" element={<div>Yedekleme sayfası</div>} />
          <Route path="cards" element={<div>Kartlar sayfası</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

// Kenar çubuğu ile genel bakış aynı kalemleri gösterir (biri gezinme, diğeri
// açıklamalı giriş); sorgular hangisine baktığını belirtmeli.
const kenar = () => within(document.querySelector('aside'))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('arama', () => {
  it('yazınca listeyi süzer ve sonuç sayısını yazar', async () => {
    kur()
    await userEvent.type(screen.getByLabelText('Ayarlarda ara'), 'yedek')
    expect(await screen.findByText(/1 SONUÇ/)).toBeInTheDocument()
  })

  // Şapkasız yazmak Türk kullanıcıda kural; arama buna takılmamalı.
  it('Türkçe karaktersiz yazılanı bulur', async () => {
    kur()
    await userEvent.type(screen.getByLabelText('Ayarlarda ara'), 'saglik')
    await screen.findByText(/SONUÇ/)
    expect(kenar().getByText('Sistem Sağlığı')).toBeInTheDocument()
  })

  it('eş anlamlı kelimeden bulur', async () => {
    kur()
    await userEvent.type(screen.getByLabelText('Ayarlarda ara'), 'smtp')
    await screen.findByText(/SONUÇ/)
    expect(kenar().getByText('Genel & E-Posta')).toBeInTheDocument()
  })

  it('sonuç yoksa açıkça söyler', async () => {
    kur()
    await userEvent.type(screen.getByLabelText('Ayarlarda ara'), 'zzzyok')
    expect(await screen.findByText(/için sonuç yok/)).toBeInTheDocument()
  })

  // Arama, rolün göremeyeceği sayfaya arka kapı olmamalı.
  it('amir için yönetici sayfası aramada çıkmaz', async () => {
    kur('shift_supervisor')
    await userEvent.type(screen.getByLabelText('Ayarlarda ara'), 'yedek')
    expect(await screen.findByText(/sonuç yok/)).toBeInTheDocument()
  })

  it('Enter ilk sonuca götürür', async () => {
    kur()
    await userEvent.type(screen.getByLabelText('Ayarlarda ara'), 'yedek{Enter}')
    expect(await screen.findByText('Yedekleme sayfası')).toBeInTheDocument()
  })
})

describe('sık kullanılan', () => {
  it('yıldızlanan kalem üstteki şeride çıkar', async () => {
    kur()
    await userEvent.click(kenar().getByLabelText('Yedekleme sık kullanılanlara ekle'))
    expect(await kenar().findByText('★ SIK KULLANILAN')).toBeInTheDocument()
    // Hem şeritte hem kendi grubunda görünür — ikisi de yıldızlı olmalı.
    expect(kenar().getAllByLabelText('Yedekleme sık kullanılanlardan çıkar')).toHaveLength(2)
  })

  it('tercih tarayıcıda kalır', async () => {
    kur()
    await userEvent.click(kenar().getByLabelText('Kartlar sık kullanılanlara ekle'))
    expect(JSON.parse(localStorage.getItem('settings.favorites.v1'))).toEqual(['cards'])
  })
})

describe('gruplar', () => {
  it('grup başlığı katlanır ve kalem sayısını gösterir', async () => {
    kur()
    const baslik = kenar().getByTitle('Hesaplar, otomasyon, yedek ve sağlık')
    await userEvent.click(baslik)
    expect(baslik).toHaveAttribute('aria-expanded', 'false')
    expect(within(baslik).getByText('8')).toBeInTheDocument()
  })

  // Kapalı grupta aktif sayfa varsa kullanıcı nerede olduğunu kaybetmemeli.
  it('aktif sayfayı içeren grup kapalıyken de açık kalır', async () => {
    localStorage.setItem('settings.collapsedGroups.v1', JSON.stringify(['sistem']))
    kur('campus_manager', '/settings/backup')
    expect(await kenar().findByText('Yedekleme')).toBeInTheDocument()
  })

  it('amire boş grup gösterilmez', () => {
    kur('shift_supervisor')
    // SİSTEM grubunda amire açık kalem yok; KAYIT & BELGE'de var.
    expect(kenar().queryByText('Yedekleme')).not.toBeInTheDocument()
    expect(kenar().getByText('Belgeler')).toBeInTheDocument()
  })
})

describe('genel bakış sayfası', () => {
  it('kalem sayısını ve açıklamaları gösterir', async () => {
    kur()
    expect(await screen.findByRole('heading', { name: 'AYARLAR' })).toBeInTheDocument()
    expect(screen.getByText(/38 ayar sayfası/)).toBeInTheDocument()
    expect(screen.getByText('Yedek alma ve geri yükleme')).toBeInTheDocument()
  })

  it('amire daha az kalem gösterir', async () => {
    kur('shift_supervisor')
    expect(await screen.findByText(/ayar sayfası/)).toBeInTheDocument()
    expect(screen.queryByText('Yedek alma ve geri yükleme')).not.toBeInTheDocument()
  })

  // Boş ekran "ayar yok" değil, "senin rolüne açık ayar yok" demektir.
  it('rolüne açık sayfa yoksa bunu söyler', async () => {
    kur('housekeeper')
    expect(await screen.findByText('Rolünüze açık bir ayar sayfası yok.')).toBeInTheDocument()
  })
})
