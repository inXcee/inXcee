# Design: Kanban DnD Düzeltme + İmza Geçmişi

**Tarih:** 2026-03-30

---

## 1. Kanban Drag-and-Drop

### Sorun
`DraggableKanbanCard` sarmalayıcı div üzerinde `useDraggable` listeners var. `DragOverlay` kullanılmıyor. Sonuç: sürüklerken kart, mouse'un yanlış noktasından tutuluyormuş gibi görünüyor. Ayrıca kart içindeki butonlar (Makine Ata, Rafa Koy, Kayıp) ile drag listeners çakışıyor.

### Çözüm: DragOverlay Pattern

- `DraggableKanbanCard` → sürüklenirken `opacity: 0` (yerinde kalır, "hayalet")
- `DragOverlay` → imleç pozisyonunda gerçek kart klonu float eder, grab offset doğru hesaplanır
- `KanbanCard` içindeki butonlara `onPointerDown: e.stopPropagation()` → drag ile buton çakışması biter
- Sensor: `PointerSensor` ile `activationConstraint: { distance: 8 }` — yanlışlıkla sürükleme önlenir

### Bileşen Değişiklikleri

**`LaundryHub.jsx`:**
- `DragOverlay` import edilir (`@dnd-kit/core`)
- `handleDragStart` → `activeItem` state'i set eder
- `handleDragEnd/Cancel` → `activeItem` temizler
- `DndContext` içine `<DragOverlay>` eklenir, içinde `<KanbanCard>` render edilir
- `DraggableKanbanCard` → `isDragging` iken `opacity: 0`, transform kaldırılır

---

## 2. İmza Geçmişi (Teslim İmzası)

### Sorun
`ExpandedSection` sadece `laundry_history` tablosunu çeker. `laundry_deliveries` tablosundaki `signature_data`, `delivered_to`, `delivered_by_name` hiç görüntülenmiyor.

### Çözüm

**Backend — `queries.js`:**
`getItemHistoryQuery` mevcut sorguya delivery join eklenmez (ayrı tablo yapısı). Bunun yerine `/items/:id/history` endpoint'i history + delivery'i birleştirerek döner:

```js
// queries.js — yeni export
export function getItemFullHistoryQuery(itemId) {
  // laundry_history satırları + delivery satırı (to_status='delivered') birleşik döner
  // delivery varsa: delivered_to, signature_data, delivered_by_name eklenir
}
```

**Backend — `routes.js`:**
`GET /items/:id/history` → `getItemFullHistoryQuery` kullanır (mevcut endpoint, response genişler).

**Frontend — `ExpandedSection`:**
- "Teslim edildi" satırında `delivered_to` ve imza önizlemesi gösterilir
- İmza: `<img src={signature_data}>` — küçük thumbnail (60×20px)
- Tıklayınca modal'da tam boy imza görünür (`512×160px`)

---

## 3. Kapsam Dışı

- Zimmet imzaları (ayrı modül, bu PR'a dahil değil)
- Kanban column sırası veya yeni status ekleme
- Intake imzası geçmişte gösterme (intake_signature zaten item üzerinde var)

---

## Etkilenen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `frontend/src/modules/laundry/LaundryHub.jsx` | DragOverlay, activeItem, opacity fix |
| `backend/src/modules/laundry/queries.js` | getItemFullHistoryQuery |
| `backend/src/modules/laundry/service.js` | passthrough güncelle |
| `backend/src/modules/laundry/routes.js` | endpoint güncelle |
