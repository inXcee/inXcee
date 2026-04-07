# Global Ctrl+K Komut Paleti — Tasarım Dokümanı

**Tarih:** 2026-04-07  
**Kapsam:** Tüm authenticated sayfalarda Ctrl+K ile açılan komut paleti — navigasyon, hızlı eylemler, kişi/oda araması.

---

## Hedef

Kullanıcıların fare kullanmadan herhangi bir sayfadan hızlıca: (1) başka bir sayfaya gitmesini, (2) modül modallarını açmasını, (3) isim veya oda numarasıyla kişi araması yapıp temel bilgileri görmesini sağlamak.

---

## Mimari

**Yeni dosyalar:**

| Dosya | Sorumluluk |
|-------|-----------|
| `frontend/src/shared/hooks/useCommandPalette.js` | Ctrl+K listener, `open` state, query state |
| `frontend/src/shared/components/CommandPalette.jsx` | Tüm UI: input, sonuç listesi, detay paneli |

**Değişen dosyalar:**

| Dosya | Değişiklik |
|-------|-----------|
| `frontend/src/shared/components/Layout.jsx` | `<CommandPalette />` mount edilir |
| `backend/src/modules/checkin/routes.js` | `GET /checkin/search?q=` endpoint eklenir |

**Neden Layout.jsx:** Layout, tüm authenticated route'ları saran tek shared component. Buraya mount edilince login sayfası ve kiosk hariç her yerde aktif olur.

---

## Veri Akışı

```
Ctrl+K
  → useCommandPalette: open=true
  → kullanıcı yazar (query)

query === '' (boş):
  → COMMANDS listesini göster (navigasyon + eylemler, statik, frontend-only)

query !== '' (2+ karakter):
  → frontend: COMMANDS listesi içinde fuzzy match
  → backend: GET /checkin/search?q={query} (debounce 200ms)
  → her iki sonucu gruplar halinde göster

Sonuca tıklama:
  → type='nav'    → navigate(path) + palette kapat
  → type='action' → window.dispatchEvent(new CustomEvent('yys:open-modal', {detail: {action}})) + kapat
  → type='person' → sağ panelde detay aç (palette açık kalır)

Esc → palette kapat
```

---

## Statik Komut Listesi

`useCommandPalette.js` içinde tanımlı, backend call gerektirmez:

```js
export const COMMANDS = [
  // Navigasyon
  { id: 'nav-dashboard',   type: 'nav',    label: 'Dashboard',            icon: '▣', path: '/' },
  { id: 'nav-checkin',     type: 'nav',    label: 'Check-in',             icon: '↗', path: '/checkin' },
  { id: 'nav-capacity',    type: 'nav',    label: 'Kapasiteler',          icon: '⊞', path: '/capacity' },
  { id: 'nav-checkout',    type: 'nav',    label: 'Check-out',            icon: '↙', path: '/checkout' },
  { id: 'nav-housekeeping',type: 'nav',    label: 'Housekeeping',         icon: '◈', path: '/housekeeping' },
  { id: 'nav-maintenance', type: 'nav',    label: 'Teknik Servis',        icon: '⚙', path: '/maintenance' },
  { id: 'nav-discipline',  type: 'nav',    label: 'Disiplin',             icon: '⚠', path: '/discipline' },
  { id: 'nav-shifts',      type: 'nav',    label: 'Vardiyalar',           icon: '⬗', path: '/shifts' },
  { id: 'nav-laundry',     type: 'nav',    label: 'Çamaşırhane',          icon: '♨', path: '/laundry' },
  { id: 'nav-inventory',   type: 'nav',    label: 'Envanter',             icon: '▨', path: '/inventory' },
  { id: 'nav-reports',     type: 'nav',    label: 'PDF Raporlar',         icon: '↓', path: '/reports' },
  { id: 'nav-room-history',type: 'nav',    label: 'Oda Geçmişi',          icon: '⬖', path: '/room-history' },
  { id: 'nav-whatsapp',    type: 'nav',    label: 'WhatsApp',             icon: '☎', path: '/whatsapp' },

  // Hızlı Eylemler
  { id: 'act-new-laundry',  type: 'action', label: 'Yeni Çamaşır Kaydı',  icon: '＋', action: 'open-new-laundry' },
  { id: 'act-new-checkin',  type: 'action', label: 'Yeni Check-in',        icon: '＋', action: 'open-checkin' },
  { id: 'act-new-checkout', type: 'action', label: 'Yeni Check-out',       icon: '＋', action: 'open-checkout' },
  { id: 'act-new-maint',    type: 'action', label: 'Yeni Teknik Talep',    icon: '＋', action: 'open-maintenance' },
  { id: 'act-new-house',    type: 'action', label: 'Yeni Temizlik Talebi', icon: '＋', action: 'open-housekeeping' },
]
```

**Rol filtresi:** Yok. Herkes tüm komutları görür.

---

## Eylem Tetikleme Protokolü

CommandPalette modül iç detaylarını bilmez. Eylem komutları şu custom event'i dispatch eder:

```js
window.dispatchEvent(new CustomEvent('yys:open-modal', { detail: { action: 'open-new-laundry' } }))
```

Her modül kendi sayfasında bu event'i dinler:

```js
useEffect(() => {
  const handler = (e) => {
    if (e.detail.action === 'open-new-laundry') setShowNewItemModal(true)
  }
  window.addEventListener('yys:open-modal', handler)
  return () => window.removeEventListener('yys:open-modal', handler)
}, [])
```

Bu sayede CommandPalette, modül state'leriyle sıfır bağımlılık içerir. Kullanıcı action komutu verdiğinde palette kapanır ve event dispatch edilir; eğer kullanıcı o modülün sayfasında değilse event fire olur ama kimse dinlemez (silent fail — kabul edilebilir).

> **Not:** İlk MVP'de silent fail kabul edilir. İleride action komutu önce sayfaya navigate edip sonra event dispatch edecek şekilde geliştirilebilir.

---

## Backend — Kişi Arama Endpoint'i

`backend/src/modules/checkin/routes.js`'e eklenir:

```
GET /api/checkin/search?q={query}
```

Mevcut `searchPersonnel(name)` sorgusu kullanılır (queries.js:10). `full_name LIKE ?` ile arama yapar, `block`, `room_no`, `bed_no` döndürür. Yeni SQL yazılmaz.

**Response shape:**
```json
[
  {
    "id": 42,
    "full_name": "Ahmet Yılmaz",
    "block": "A",
    "room_no": "101",
    "bed_no": 2,
    "job_title": "Operatör",
    "check_out_date": null
  }
]
```

Sadece aktif sakinler (`check_out_date IS NULL`) gösterilir — bu zaten mevcut sorgu davranışı. Mevcut sorgu `full_name LIKE ?` ile arar; oda numarasıyla arama için `OR r.room_no LIKE ?` JOIN'i eklenir.

---

## UI Detayları

**Palette container:**
- `position: fixed`, `top: 20%`, `left: 50%`, `transform: translateX(-50%)`
- `width: min(560px, 90vw)`, backdrop blur overlay
- `z-index: 9000` (notification bell'in altında: 9999)

**Sonuç listesi:**
- Gruplar halinde: `── SAYFALAR ──`, `── EYLEMLER ──`, `── KİŞİLER ──`
- Max 8 görünür satır, scroll
- Aktif satır: `background: var(--accent)10`, sol border `2px solid var(--accent)`
- `↑↓` klavye navigasyonu, `Enter` ile uygula

**Detay paneli (kişi seçilince):**
- Palette içinde sonuç listesinin altında açılır (ayrı panel değil)
- Gösterilecekler: ad soyad, blok · oda · yatak, unvan, giriş durumu

**Boş query varsayılan görünümü:**
- İlk 5 navigasyon komutu + tüm eylem komutları gösterilir
- "Ara veya komut gir..." placeholder

---

## Kapsam Dışı (Bu MVP'de Yok)

- Action komutu verilince otomatik sayfaya navigate etme
- Rol bazlı komut filtreleme
- Komut geçmişi / son kullanılanlar
- Keyboard shortcut özelleştirme

---

## Test

Backend için: `GET /checkin/search?q=ah` → aktif sakin listesi döner.  
Frontend için: manuel — `Ctrl+K` açılıyor mu, `Esc` kapanıyor mu, `↑↓` çalışıyor mu, kişiye tıklayınca detay görünüyor mu.
