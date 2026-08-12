import { describe, it, expect } from 'vitest'
import {
  SETTINGS_GROUPS, ALL_ITEMS, ROL, normalize, visibleGroups, searchSettings,
  canAccess, rolesForKey, settingsPath, loadFavorites, toggleFavorite,
  loadRecents, pushRecent, itemsByKeys,
} from './settingsNav.js'

// Menü tanımı ile rota koruması ayrı yerlerde durduğu için birbirinden kaymıştı.
// Tek kaynak olduktan sonra ayrışamazlar — buradaki testler o güvenceyi tutar.

const sahteDepo = (baslangic = {}) => {
  const veri = { ...baslangic }
  return { getItem: k => (k in veri ? veri[k] : null), setItem: (k, v) => { veri[k] = String(v) } }
}

describe('menü bütünlüğü', () => {
  it('her kalemde etiket, ikon, rol ve açıklama var', () => {
    ALL_ITEMS.forEach(i => {
      expect(i.key, `${i.key} anahtar`).toBeTruthy()
      expect(i.label, `${i.key} etiket`).toBeTruthy()
      expect(i.icon, `${i.key} ikon`).toBeTruthy()
      expect(i.desc, `${i.key} açıklama`).toBeTruthy()
      expect(i.roles.length, `${i.key} rol`).toBeGreaterThan(0)
    })
  })

  it('anahtarlar benzersiz', () => {
    const anahtarlar = ALL_ITEMS.map(i => i.key)
    expect(new Set(anahtarlar).size).toBe(anahtarlar.length)
  })

  it('her grup etiketli ve dolu', () => {
    SETTINGS_GROUPS.forEach(g => {
      expect(g.label).toBeTruthy()
      expect(g.hint).toBeTruthy()
      expect(g.items.length).toBeGreaterThan(0)
    })
  })

  it('yol üretimi anahtarı kullanır', () => {
    expect(settingsPath('backup')).toBe('/settings/backup')
  })
})

describe('rol görünürlüğü', () => {
  it('yönetici her şeyi görür', () => {
    const sayi = visibleGroups('campus_manager').reduce((t, g) => t + g.items.length, 0)
    expect(sayi).toBe(ALL_ITEMS.length)
  })

  it('amir yalnız kendi sayfalarını görür, boş grup çıkmaz', () => {
    const gruplar = visibleGroups('shift_supervisor')
    gruplar.forEach(g => {
      expect(g.items.length).toBeGreaterThan(0)
      g.items.forEach(i => expect(i.roles).toContain('shift_supervisor'))
    })
  })

  it('yetkisiz rol hiçbir şey görmez', () => {
    expect(visibleGroups('technical')).toEqual([])
    expect(visibleGroups(undefined)).toEqual([])
  })

  // Menü ile rota koruması aynı kaynaktan gelmezse "menüde yok ama URL'den
  // açılıyor" ya da "menüde var ama tıklayınca dışarı atıyor" olur.
  it('erişim kontrolü menüyle aynı kaynağı kullanır', () => {
    ALL_ITEMS.forEach(i => {
      i.roles.forEach(r => expect(canAccess(i.key, r)).toBe(true))
      expect(canAccess(i.key, 'housekeeper')).toBe(false)
    })
  })

  it('bilinmeyen anahtar kimseye açılmaz', () => {
    expect(rolesForKey('olmayan-sayfa')).toBeNull()
    expect(canAccess('olmayan-sayfa', 'campus_manager')).toBe(false)
  })

  // Arka uç yalnız yöneticiye izin veriyor; menü amire göstermemeli.
  it('yalnız-yönetici sayfaları amire kapalı', () => {
    for (const k of ['projects', 'automation', 'notification-groups', 'users', 'backup', 'kvkk-admin']) {
      expect(canAccess(k, 'shift_supervisor'), k).toBe(false)
      expect(canAccess(k, 'campus_manager'), k).toBe(true)
    }
  })

  // Arka uç amire izin veriyor; menüde gizlemek kullanılabilir sayfayı saklamaktı.
  it('arka ucun amire açtığı sayfalar amire görünür', () => {
    for (const k of ['companies', 'visitors', 'surveys', 'drills', 'documents', 'expenses', 'safety']) {
      expect(canAccess(k, 'shift_supervisor'), k).toBe(true)
    }
  })
})

describe('arama', () => {
  it('Türkçe karakteri normalize eder', () => {
    expect(normalize('Sistem Sağlığı')).toBe('sistem sagligi')
    expect(normalize('İŞ GÜVENLİĞİ')).toBe('is guvenligi')
  })

  it('şapkasız yazılan kelime bulunur', () => {
    const r = searchSettings('saglik', 'campus_manager')
    expect(r.map(i => i.key)).toContain('system')
  })

  it('açıklamadan ve eş anlamlıdan bulur', () => {
    expect(searchSettings('smtp', 'campus_manager').map(i => i.key)).toContain('email')
    expect(searchSettings('taseron', 'campus_manager').map(i => i.key)).toContain('companies')
    expect(searchSettings('yangin', 'campus_manager').map(i => i.key)).toContain('drills')
  })

  it('grup adından bulur', () => {
    expect(searchSettings('personel', 'campus_manager').length).toBeGreaterThan(3)
  })

  it('boş sorgu rolün tümünü verir', () => {
    expect(searchSettings('', 'campus_manager')).toHaveLength(ALL_ITEMS.length)
  })

  it('sonuç yoksa boş döner', () => {
    expect(searchSettings('zzzyok', 'campus_manager')).toEqual([])
  })

  // Arama, göremeyeceği sayfaya arka kapı olmamalı.
  it('rol filtresi aramada da uygulanır', () => {
    expect(searchSettings('yedek', 'shift_supervisor').map(i => i.key)).not.toContain('backup')
    expect(searchSettings('yedek', 'campus_manager').map(i => i.key)).toContain('backup')
  })
})

describe('sık kullanılan ve son ziyaret', () => {
  it('sık kullanılanı ekler ve çıkarır', () => {
    const depo = sahteDepo()
    expect(toggleFavorite('backup', depo)).toEqual(['backup'])
    expect(loadFavorites(depo)).toEqual(['backup'])
    expect(toggleFavorite('backup', depo)).toEqual([])
  })

  it('son ziyaretleri başa alır, tekrar etmez', () => {
    const depo = sahteDepo()
    pushRecent('users', depo)
    pushRecent('backup', depo)
    pushRecent('users', depo)
    expect(loadRecents(depo)).toEqual(['users', 'backup'])
  })

  it('son ziyaret listesi sınırı aşmaz', () => {
    const depo = sahteDepo()
    ALL_ITEMS.slice(0, 10).forEach(i => pushRecent(i.key, depo))
    expect(loadRecents(depo).length).toBeLessThanOrEqual(6)
  })

  // Silinmiş/yeniden adlandırılmış sayfa listede hayalet bırakmamalı.
  it('bilinmeyen anahtar listeye girmez ve okurken elenir', () => {
    const depo = sahteDepo({ 'settings.recents.v1': '["olmayan","backup"]' })
    expect(loadRecents(depo)).toEqual(['backup'])
    pushRecent('olmayan', depo)
    expect(loadRecents(depo)).toEqual(['backup'])
  })

  it('bozuk kayıt ekranı kilitlemez', () => {
    expect(loadFavorites(sahteDepo({ 'settings.favorites.v1': '{bozuk' }))).toEqual([])
    const patlayan = { getItem: () => { throw new Error('kapalı') }, setItem: () => { throw new Error('kapalı') } }
    expect(loadFavorites(patlayan)).toEqual([])
    expect(() => toggleFavorite('backup', patlayan)).not.toThrow()
  })

  // Rol düşürülmüşse eski sık kullanılan görünmeye devam etmemeli.
  it('anahtar listesi role göre süzülür', () => {
    expect(itemsByKeys(['backup', 'cards'], 'shift_supervisor').map(i => i.key)).toEqual(['cards'])
    expect(itemsByKeys(['olmayan'], 'campus_manager')).toEqual([])
  })
})
