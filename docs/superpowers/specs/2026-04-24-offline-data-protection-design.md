# Offline Veri Koruma — Tasarım Dokümanı

**Tarih:** 2026-04-24  
**Kapsam:** Mobile offline queue (IndexedDB + blob) + Desktop form draft auto-save  
**Yaklaşım:** IndexedDB tabanlı — service worker yok

---

## Sorun

1. **Mobile queue bug:** Mevcut `offlineQueue.js` (localStorage) `clearQueue()` çağrısını drain'den önce yapıyor — drain sırasında hata olursa item'lar kaybolur.
2. **Mobile kapsam eksik:** Sadece `complete_task` kuyruğa alınıyor. `skip_task`, `fault_report` (fotoğraflı), `quick_fault` korumasız.
3. **localStorage sınırı:** 5-10 MB — fotoğraf barındıramaz.
4. **Desktop formları:** Uzun formlar doldurulurken internet giderse veya sayfa yenilenirse veri kaybolur.

---

## Mimari

### IndexedDB Veritabanı: `yys-db`

Üç object store:

| store | amaç | key |
|-------|------|-----|
| `offline_queue` | mobile eylem kuyruğu | auto-increment `id` |
| `offline_blobs` | foto/blob depolama | auto-increment `id` |
| `form_drafts` | desktop taslakları | form `key` string |

```
offline_queue record:
  { id, type, payload, blobIds: [], ts, retries }

offline_blobs record:
  { id, blob }

form_drafts record:
  { key, data, ts }
```

### Utility: `frontend/src/shared/utils/offlineDB.js`

Dışa aktarılan fonksiyonlar:

```js
// Queue
enqueue(type, payload, blobs?)  // eylem + blobları yazar
dequeue(id)                     // tek item sil (başarıdan sonra)
getQueue()                      // tüm pending items
updateRetries(id, retries)      // retry sayısını güncelle

// Drafts
saveDraft(key, data)
loadDraft(key)
clearDraft(key)
```

Tüm fonksiyonlar IndexedDB açılamazsa graceful fallback: queue için localStorage (fotoğrafsız), draft için sessiz fail.

### Hook: `frontend/src/shared/hooks/useDraft.js`

Desktop formlar için tek satır entegrasyon:

```js
const { draftBanner, onFieldChange } = useDraft('draft:checkin', form, setForm)
```

- Her değişiklikte 800ms debounce ile `saveDraft` çağrısı
- Mount'ta `loadDraft` — varsa formu doldur
- Başarılı submit sonrası `clearDraft`
- `draftBanner`: "Kaydedilmemiş taslak bulundu — Devam Et / Temizle"

---

## Mobile Offline Queue

### Kuyruğa alınan eylem tipleri

| type | bileşen | payload | blob? |
|------|---------|---------|-------|
| `complete_task` | HousekeeperHome, TaskDetail | `{ taskId, checklist }` | hayır |
| `skip_task` | TaskDetail | `{ taskId, reason }` | hayır |
| `fault_report` | FaultReport | `{ location, description, priority }` | evet |
| `quick_fault` | QuickFault | `{ location, description, priority }` | hayır |

### Bileşen pattern'i

```js
onError: (_, vars, ctx) => {
  if (!navigator.onLine) {
    enqueue('complete_task', { taskId })
    rollback(ctx)
    toast('Çevrimdışı kaydedildi — bağlantı gelince gönderilecek', 'info')
  }
}
```

### FaultReport — foto akışı

1. Submit tetiklendiğinde: `File → blob` dönüşümü
2. `enqueue('fault_report', textPayload, [blob])`
3. Drain sırasında: blob `offline_blobs`'dan çekil → `FormData` oluştur → `POST`

### Drain mekanizması (MobileLayout)

`isOnline` true olduğunda:

```
getQueue()
  → forEach item (sıralı, paralel değil):
      try:
        replay(item)     // blobları da çekip FormData yap
        → başarı: dequeue(item.id) + query invalidate
      catch:
        retries < 3 → updateRetries(id, retries + 1), sırada bırak
        retries >= 3 → toast('Gönderilemedi, silinecek') + dequeue(id)
```

Token süresi dolmuşsa drain öncesi refresh dene; başarısızsa logout.

---

## Desktop Form Draft Auto-Save

### Kapsam

| form | draft key | not |
|------|-----------|-----|
| CheckinPage | `draft:checkin` | — |
| ZimmetForm | `draft:zimmet:{personnelId}` | canvas imzası hariç |
| MaintenancePage | `draft:maintenance` | yeni talep alanları |
| DisciplinePage | `draft:discipline` | — |
| AnnouncementsPage | `draft:announcement` | — |
| InventoryPage | `draft:inventory` | yeni item alanları |

Canvas imzası kapsam dışı — personel imzasını online olunca yeniden atar.

### Davranış

- Her field değişiminde 800ms debounce → `saveDraft(key, formState)`
- Sayfa açılışında `loadDraft(key)` — taslak varsa form doldurulur + banner gösterilir
- Başarılı submit → `clearDraft(key)`
- Kullanıcı formu manuel "Sıfırla" ile temizlerse → `clearDraft(key)`

---

## Hata Yönetimi

| senaryo | davranış |
|---------|---------|
| Drain'de sunucu 500 | retries++ — sonraki online event'te tekrar dener |
| 3 deneme başarısız | toast hatası + kuyruktan sil |
| IndexedDB açılamıyor | graceful fallback: localStorage (fotoğrafsız) |
| Token süresi dolmuş | drain öncesi refresh → başarısızsa logout |
| Draft storage açılamıyor | sessiz fail, form boş açılır |

---

## Fazlar

### Faz 1 — `offlineDB.js` temel utility + bug fix
`offlineDB.js` yaz (IndexedDB wrapper), mevcut `offlineQueue.js`'i kaldır, `MobileLayout` drain'i per-item'a çevir, `HousekeeperHome` bug fix.

### Faz 2 — Mobile eylem genişletme
`TaskDetail` (complete + skip), `FaultReport` (foto blob), `QuickFault` — 4 eylem tipi ekle.

### Faz 3 — `useDraft` hook + desktop formlar
`useDraft.js` hook yaz, 6 desktop forma entegre et.

### Faz 4 — Test
`offlineDB.js` unit testleri (fake-indexeddb), bileşen mock testleri.

---

## Dosyalar

**Yeni:**
- `frontend/src/shared/utils/offlineDB.js`
- `frontend/src/shared/hooks/useDraft.js`
- `frontend/src/shared/utils/offlineDB.test.js`

**Değişecek:**
- `frontend/src/modules/mobile/shared/MobileLayout.jsx` — drain yeniden yaz
- `frontend/src/modules/mobile/housekeeper/HousekeeperHome.jsx` — enqueue güncelle
- `frontend/src/modules/mobile/housekeeper/TaskDetail.jsx` — complete + skip enqueue
- `frontend/src/modules/mobile/housekeeper/FaultReport.jsx` — foto blob enqueue
- `frontend/src/modules/mobile/technician/QuickFault.jsx` — enqueue ekle
- `frontend/src/modules/checkin/CheckinPage.jsx` — useDraft
- `frontend/src/modules/checkin/ZimmetForm.jsx` — useDraft (imzasız)
- `frontend/src/modules/maintenance/MaintenancePage.jsx` — useDraft
- `frontend/src/modules/discipline/DisciplinePage.jsx` — useDraft
- `frontend/src/modules/admin/AnnouncementsPage.jsx` — useDraft
- `frontend/src/modules/inventory/InventoryPage.jsx` — useDraft

**Silinecek:**
- `frontend/src/shared/utils/offlineQueue.js`
