# Dalga A: Çamaşırhane Hızlı Kazanımlar — Design Spec

**Tarih:** 2026-04-06  
**Kapsam:** 3 özellik — blok bazlı toplu teslimat, SLA öncesi uyarı, makine MM:SS zamanlayıcısı + bildirim  
**Etki:** Yüksek | **Efor:** Düşük-Orta

---

## Özellik 1: Blok Bazlı Toplu Teslimat

### Amaç
Kanban `ready` kolonunda ve AllRecordsTab'da hazır öğeleri blok+oda bazında grupla. Tek tıkla bir bloğun tüm öğelerini seç, mevcut `batchDeliver` akışıyla teslim et.

### Mimari
Yeni backend endpoint veya DB değişikliği yok. Tamamen frontend değişikliği.

### Değişiklikler

**`frontend/src/modules/laundry/LaundryHub.jsx` — Kanban ready kolonu**

`KanbanColumn` içinde `ready` statüsü için öğeleri `block` alanına göre grupla:

```
A Bloğu — 5 hazır  [Tümünü Seç]
  ├ A·101 Ali Yılmaz — 3 parça
  ├ A·104 Veli Kaya — 2 parça
  └ A·107 ...

B Bloğu — 3 hazır  [Tümünü Seç]
  ├ B·201 ...
```

- `batchMode` aktif değilken blok header'ları gizli, normal kart görünümü
- `batchMode` aktifken blok header'ları ve "Tümünü Seç" butonları görünür
- "Tümünü Seç" → o bloktaki tüm `ready` öğe ID'lerini `selectedIds`'e ekler
- Zaten seçiliyse "Seçimi Kaldır" olur

**Mevcut akış korunur:** `batchDeliver` → `DeliveryModal` → imza → API

### Veri Akışı
```
ready items → group by block → render block headers (batchMode'da)
                                    ↓
                           "Tümünü Seç" → selectedIds.add(all block item ids)
                                    ↓
                           mevcut batchDeliver akışı
```

---

## Özellik 2: SLA Öncesi Uyarı Banner

### Amaç
SLA ihlali olmadan 2 saat önce `"⚠️ X kayıt SLA'ya yaklaşıyor"` bildirimi gönder. Mevcut sistem yalnızca ihlal sonrası uyarıyor.

### Mimari
- DB: `laundry_sla_config`'e `pre_warning_hours INTEGER DEFAULT 2` kolonu
- Backend: `sla.js`'e `checkSlaPreWarnings()` fonksiyonu
- Cron: Mevcut 15 dk cron'a eklenir
- Frontend: `SlaAlert.jsx`'e `pre_warning` tipini ekle veya LaundryHub'da inline banner

### DB Değişikliği
```sql
ALTER TABLE laundry_sla_config ADD COLUMN pre_warning_hours INTEGER DEFAULT 2;
```

### `checkSlaPreWarnings()` Mantığı
```
items WHERE status IN ('dirty','washing','ready')
  AND sla_config.warning_hours IS NOT NULL
  AND (warning_hours - hours) <= pre_warning_hours  -- yaklaşıyor
  AND hours < warning_hours                          -- henüz ihlal yok
```

Bildirim: `type: 'pre_warning'`, `target_role: 'laundry'`  
Mesaj: `"⚠️ A·101 — dirty statüsünde SLA'ya 1.5 saat kaldı"`

### Duplikasyon Koruması
Mevcut `laundry_sla_notifications` tablosunu kullan. Stage olarak `'pre_warning_' + status` (örn. `'pre_warning_dirty'`) kullan. `shouldSendSlaNotification(db, itemId, 'pre_warning_' + status)` çağrısı aynı günde tekrar göndermez.

### Frontend
`SlaAlert.jsx` zaten var. `pre_warning` tipi için amber renk (mevcut `warning` sarı, `critical` kırmızı, `pre_warning` turuncu).

---

## Özellik 3: Makine Zamanlayıcısı MM:SS + Bildirim

### Amaç
- Saniye hassasiyetiyle geri sayım (45:00 → 00:00)
- Tamamlanma bildirimi hangi odaların çamaşırı olduğunu içersin
- Cron 15 dk → 1 dk (makine timer için)

### Frontend Değişiklikleri

**`MachineStrip.jsx`**

Mevcut `minutesLeft` hesabı yerine per-second state:

```js
const [now, setNow] = useState(new Date())
useEffect(() => {
  const id = setInterval(() => setNow(new Date()), 1000)
  return () => clearInterval(id)
}, [])
```

Gösterim: `MM:SS` formatında (`padStart(2,'0')`)

Şu an: `45 dk` → Yeni: `45:30`

### Backend Değişiklikleri

**`sla.js` — `checkMachineTimers()`**

`done` makinelere bağlı `laundry_items`'ları JOIN'le:

```sql
SELECT lm.*, GROUP_CONCAT(r.block || '·' || r.room_no, ', ') as rooms
FROM laundry_machines lm
LEFT JOIN laundry_items li ON li.machine_id = lm.id AND li.status = 'washing'
LEFT JOIN rooms r ON r.id = li.room_id
WHERE lm.status = 'running'
  AND lm.timer_end IS NOT NULL
  AND datetime('now') >= datetime(lm.timer_end)
GROUP BY lm.id
```

Mesaj: `"Makine 1 tamamlandı — A·101, B·203, A·105"` (oda yoksa: `"Makine 1 tamamlandı"`)

**`cron/index.js`**

Mevcut `*/15` cron'u ikiye böl:
- `*/1 * * * *` → yalnızca `checkMachineTimers()`
- `*/15 * * * *` → `checkSlaViolations()` + `checkSlaPreWarnings()` + `checkMachineMaintenanceAlerts()`

### total_runs Sayacı
`checkMachineTimers()` makine done'a geçerken `total_runs = total_runs + 1` da uygular.

---

## Test Kapsamı

| Test | Tip |
|------|-----|
| `checkSlaPreWarnings` — eşiği test et | backend unit |
| `checkSlaPreWarnings` — duplikasyon koruması | backend unit |
| `checkMachineTimers` — oda bilgisi mesajda | backend unit |
| `checkMachineTimers` — total_runs artar | backend unit |
| Blok gruplama mantığı | frontend (manuel) |

---

## Dosya Haritası

| Dosya | Eylem | Ne Değişir |
|-------|-------|-----------|
| `backend/src/shared/db/index.js` | Modify | `pre_warning_hours` kolonu migration |
| `backend/src/modules/laundry/sla.js` | Modify | `checkSlaPreWarnings()` + `checkMachineTimers()` güncelle |
| `backend/src/modules/laundry/laundry.test.js` | Modify | 4 yeni test |
| `backend/src/shared/cron/index.js` | Modify | 1 dk makine cron'u |
| `frontend/src/modules/laundry/LaundryHub.jsx` | Modify | Ready kolonu blok gruplama |
| `frontend/src/modules/laundry/components/MachineStrip.jsx` | Modify | Per-second now state, MM:SS format |
| `frontend/src/modules/laundry/components/SlaAlert.jsx` | Modify | `pre_warning` tipi desteği |
