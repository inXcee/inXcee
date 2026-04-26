# Ütü Kuyruğu UI — Design Spec

**Date:** 2026-04-26  
**Sub-project:** Çamaşırhane tamamlama (tek özellik)  
**Status:** Approved

---

## Kapsam

LaundryHub'a ütü kuyruğunu gösteren yeni bir panel/sekme ekle. Backend değişikliği yok — mevcut endpoint'ler yeterli.

---

## Mevcut Durum

- `GET /api/laundry/items?status=ironing` çalışıyor (`listItemsQuery` destekliyor)
- `PATCH /api/laundry/items/:id/advance` → `ironing → ready` geçişi yapıyor (`advanceItemService` + `needs_ironing` logic)
- LaundryHub kanban'ında ütü sütunu var ama sadece drag-drop ile yönetiliyor
- Ayrı bir "kuyruk" görünümü yok — kaç parça beklediği, hangileri acil, toplu bakış yok

---

## Tasarım

### Bileşen: `IroningQueuePanel.jsx`

`frontend/src/modules/laundry/components/IroningQueuePanel.jsx` olarak yeni dosya.

**Veri:**
```
GET /api/laundry/items?status=ironing
```
Yanıt: `laundry_items` array — `id, room_id, item_count, notes, urgent, updated_at, intake_name, hours_in_status`

**Sıralama:** `urgent=1` olan kayıtlar önce, sonra `hours_in_status` DESC (en uzun bekleyen üstte)

**Panel içeriği:**

1. **Özet satırı** — `X parça bekliyor · Y acil` (kırmızı sayac)
2. **Kart listesi** — her kart:
   - Oda no + giriş adı (intake_name varsa)
   - Parça sayısı + kaç saat beklediği
   - `urgent=1` ise kırmızı sol kenarlık + "ACİL" badge
   - **"✓ Hazır"** butonu → `PATCH /api/laundry/items/:id/advance`
3. **Boş durum** — "Ütüde bekleyen parça yok 🎉"

**Query config:** `staleTime: 30_000`, `gcTime: 300_000`, `refetchInterval: 60_000`

**"Hazır" butonu logic:**
- `useMutation` ile `PATCH /laundry/items/:id/advance` çağır
- `onSuccess`: `queryClient.invalidateQueries({ queryKey: ['ironing-queue'] })`
- Optimistic update: kartı listeden anında kaldır

---

### LaundryHub Entegrasyonu

LaundryHub'daki mevcut alt sekme navigasyonu (`recordsTab` state, satır ~1082) genişletilir.

Mevcut sekmeler (satır ~1087-1092'ye bakarak):
- Tüm Kayıtlar (AllRecordsTab)
- + diğerleri

Yeni sekme eklenir:
```
[Tüm Kayıtlar] [Ütü Kuyruğu 🔴N]
```

`N` = ironing count. Sayac 0 ise sadece "Ütü Kuyruğu" gösterilir, kırmızı badge olmaz.

`recordsTab === 'ironing'` iken `<IroningQueuePanel />` render edilir.

---

## Dosya Değişim Listesi

| Dosya | Değişim |
|-------|---------|
| `frontend/src/modules/laundry/components/IroningQueuePanel.jsx` | Yeni dosya |
| `frontend/src/modules/laundry/LaundryHub.jsx` | Sekme ekleme + IroningQueuePanel import |

Backend değişikliği yok.

---

## Test Stratejisi

- Seed/test ortamında `status=ironing` olan laundry_item oluştur
- Panel açılıyor mu, kart doğru render oluyor mu
- "Hazır" butonuna basınca kart kayboluyor mu (optimistic)
- Backend testleri: 387 geçmeli (backend değişikliği olmadığından)
- Frontend build temiz

---

## Kapsam Dışı

- Yıkama profili — kapsam dışı bırakıldı
- Self-service portal — kapsam dışı bırakıldı
- Makine bakım takvimi — başka sub-project
