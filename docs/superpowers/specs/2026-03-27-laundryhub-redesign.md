# LaundryHub Yeniden Tasarım Spec

**Tarih:** 2026-03-27
**Durum:** Onaylandı — Uygulama planı bekleniyor

---

## Özet

`LaundryPage` ve `LaundryDashboard` iki ayrı sayfa olarak çakışan kod içeriyor (KPI strip, MachineStrip, SLA alert). Bu iki bileşen tek bir `LaundryHub` bileşeninde birleştirilecek. Aynı zamanda:
- Tüm `prompt()` / `confirm()` diyalogları → özel modallar
- Makine timer backend'de set edilecek (dirty→washing geçişinde)
- `MachineStrip` hataları düzeltilecek (`machine_type` → `type`, 30s → 1s tick)
- Makine yönetim UI eklenecek (`MachineManagerPanel`)
- SSE bildirimleri dashboard'a bağlanacak

---

## Mimari

### Dosya Değişiklikleri

**Yeni dosyalar:**
```
frontend/src/modules/laundry/LaundryHub.jsx
frontend/src/modules/laundry/components/ShelfModal.jsx
frontend/src/modules/laundry/components/AssignModal.jsx
frontend/src/modules/laundry/components/LostModal.jsx
frontend/src/modules/laundry/components/MachineManagerPanel.jsx
```

**Güncellenen dosyalar:**
```
frontend/src/modules/laundry/components/ItemCard.jsx     — modal entegrasyonu
frontend/src/modules/laundry/components/MachineStrip.jsx — hata düzeltmeleri
backend/src/modules/laundry/service.js                  — timer_end dirty→washing
backend/src/modules/laundry/routes.js                   — timer_minutes parametresi
```

**Kaldırılan dosyalar (içerikleri LaundryHub'a taşınır):**
```
frontend/src/modules/laundry/LaundryPage.jsx
frontend/src/modules/laundry/LaundryDashboard.jsx
```

**Dokunulmayan dosyalar:**
```
frontend/src/modules/laundry/LaundryReport.jsx
frontend/src/modules/laundry/LaundrySettings.jsx
frontend/src/modules/laundry/api.js
frontend/src/modules/laundry/components/SlaAlert.jsx
frontend/src/modules/laundry/components/QueuePanel.jsx
frontend/src/modules/laundry/components/DeliveryModal.jsx
frontend/src/modules/laundry/components/DamageModal.jsx
frontend/src/modules/laundry/components/NewItemModal.jsx
backend/src/modules/laundry/queries.js
backend/src/modules/laundry/sla.js
backend/src/modules/laundry/whatsapp.js
```

---

## LaundryHub Bileşen Yapısı

```
LaundryHub
  ├── Header
  │     ├── Başlık (ÇAMAŞIRHANE) + tarih
  │     ├── SLA özet (X ihlal)
  │     └── "+ Yeni Kayıt" butonu
  ├── SlaAlert (mevcut bileşen, violations varsa görünür)
  ├── KPI Strip (5 kart)
  │     ├── Sepette   — count + oran bar
  │     ├── Yıkaniyor — count + oran bar
  │     ├── Hazır     — count + oran bar
  │     ├── SLA İhlal — count (kırmızı, 0 ise gizli)
  │     └── Bugün Teslim — count
  ├── MachineStrip (düzeltilmiş)
  │     └── "Makineleri Yönet" butonu → MachineManagerPanel
  ├── Toolbar
  │     ├── Search input
  │     ├── Filter chips: [Tümü][Sepet][Yıkama][Hazır][Acil][SLA][Kayıp]
  │     └── View toggle: [≡ Liste] [⊞ Kanban]
  └── Content Area
        ├── KanbanView (view=kanban)
        │     ├── KirliSepet kolonu
        │     ├── Yıkaniyor kolonu
        │     └── RaftaHazır kolonu
        └── ListView (view=liste)
              ├── ItemCard listesi (mevcut bileşen)
              └── Batch seçim + Toplu Teslim butonu
```

**Varsayılan view:** `kanban`

---

## Yeni Modallar

### `AssignModal` (dirty → washing)

- Makine listesi: idle makineler seçilebilir, dolu makineler disabled + "dolu" etiketi
- Timer süre seçimi: [30dk] [45dk] [60dk] + özel input
- Makine seçilmeden "Makineye At" butonu disabled
- Submit: `laundryApi.advanceItem(id, { machine_id, timer_minutes })`

### `ShelfModal` (washing → ready)

- Tek text input: raf konumu
- Placeholder: "örn: 2. Kat A-3"
- Boş bırakılabilir (backend null kabul ediyor)
- Submit: `laundryApi.advanceItem(id, { shelf_location })`

### `LostModal` (herhangi durum → lost)

- Opsiyonel textarea: açıklama
- Submit: `laundryApi.lostItem(id, { notes })`

### Silme Onayı

`confirm()` yerine: ItemCard expand alanında "Sil" butonuna basınca buton "Emin misin?" metnine dönüşür, ikinci tıkta silme gerçekleşir. Modal açılmaz.

---

## `MachineManagerPanel`

Slide-in panel (MachineStrip'teki "Makineleri Yönet" butonuyla açılır):

- Mevcut makinelerin listesi: ad, tip (W/D), kapasite, durum
- Her makine için: [Bakım Modu toggle] [Sil ✕]
  - Sil: aktif yıkaması (status=running veya active_items>0) varsa disabled
- "+ Makine Ekle": inline form → ad, tip (washer/dryer), kapasite (kg)
- API: `laundryApi.createMachine`, `laundryApi.updateMachine`, `laundryApi.deleteMachine`

---

## `MachineStrip` Düzeltmeleri

| Hata | Düzeltme |
|------|----------|
| `m.machine_type` — DB field adı yanlış | `m.type` kullan |
| `setInterval(30000)` — timer 30s'de bir güncelleniyor | `setInterval(1000)` — 1s tick |
| `totalMinutes = 45` sabit — yanlış hesap | `timer_end` ve `created_at` / `updated_at` farkından hesapla; fallback 60 |

---

## Backend Değişiklikleri

### `service.js` — `advanceItemService`

`dirty → washing` geçişinde `timer_minutes` payload'dan alınır, `timer_end` backend'de hesaplanıp `updateMachineQuery`'e geçirilir:

```js
if (nextStatus === 'washing') {
  if (!machine_id) throw new Error('Makine seçilmeli')
  extra.machine_id = machine_id
  const timerEnd = payload.timer_minutes > 0
    ? new Date(Date.now() + payload.timer_minutes * 60000).toISOString()
    : null
  q.updateMachineQuery(machine_id, { status: 'running', timer_end: timerEnd })
  q.removeItemFromQueueQuery(id)
}
```

### `routes.js` — `advance` endpoint

`timer_minutes` parametresini destructure edip service'e pass et:

```js
const { machine_id, shelf_location, timer_minutes } = req.body
svc.advanceItemService(+req.params.id, { machine_id, shelf_location, timer_minutes }, req.user.id)
```

### `laundry.test.js`

Yeni test: `dirty → washing` geçişinde `timer_minutes=45` verilince makinenin `timer_end`'inin set edildiğini doğrula.

---

## SSE Entegrasyonu

Proje'de mevcut `useNotifications` hook'u (`shared/hooks/useNotifications.js`) SSE bağlantısını yönetiyor. `LaundryHub` bu hook'u kullanır — yeni bir hook yaratılmaz.

`module=laundry` olayları geldiğinde TanStack Query cache'i invalidate edilir:

| SSE Olayı | Aksiyon |
|-----------|---------|
| `laundry:item_ready` | `['laundry-items']` invalidate |
| `laundry:sla_warning` | `['laundry-sla']` invalidate + `useToastStore.addToast()` (warning) |
| `laundry:sla_critical` | `['laundry-sla']` invalidate + `useToastStore.addToast()` (error) |
| `laundry:machine_done` | `['laundry-machines']` invalidate + `useToastStore.addToast()` (info) |

Toast sistemi mevcut: `useToastStore` (Zustand) + `ToastContainer` bileşeni zaten projede var.

---

## Routing Değişikliği

`App.jsx`'te şu an iki ayrı rota var:
- `/laundry/dashboard` → `LaundryDashboard`
- `/laundry/list` → `LaundryPage`

Her ikisi `LaundryHub`'a yönlendirilir, path'e göre default view set edilir:

```jsx
// App.jsx
const LaundryHub = lazy(() => import('./modules/laundry/LaundryHub.jsx'))

<Route path="laundry/dashboard" element={<LaundryHub defaultView="kanban" />} />
<Route path="laundry/list"      element={<LaundryHub defaultView="liste" />} />
```

`LaundryHub`, `defaultView` prop'unu alarak ilk render'da doğru view'ı açar.

---

## Kapsam Dışı

| Özellik | Neden |
|---------|-------|
| `LaundryReport` redesign | Çalışıyor, kapsam genişler |
| `LaundrySettings` redesign | Çalışıyor, kapsam genişler |
| Drag & drop kanban | Buton bazlı geçiş daha güvenilir |
| Gerçek WhatsApp entegrasyonu | Mock yeterli, ayrı görev |
| Fotoğraf çekme UI | Mevcut upload yeterli |

---

## Test Stratejisi

| Test | Kapsam |
|------|--------|
| `laundry.test.js` yeni case | `advanceItemService` timer_minutes → machine.timer_end |
| Manuel smoke | LaundryHub mount, view toggle, AssignModal, ShelfModal, LostModal, MachineManagerPanel |
