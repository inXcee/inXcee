# L2 + A5 Tasarım Dokümanı
# Son İşlemler/Ctrl+Z (L2) + Deterjan Stok Takibi (A5)

**Tarih:** 2026-04-08

---

## L2: Son İşlemler + Geri Alma (Ctrl+Z)

### Özet

Frontend session bazlı undo stack + backend ters işlem API'si. Her başarılı mutation sonrası toast gösterilir ("Geri Al" butonu ile), Ctrl+Z tuşu veya floating panel üzerinden son 10 işlem geri alınabilir.

### Kapsam

Geri alınabilir işlemler:
- `advance` — durum geçişleri (dirty→washing, washing→ready, ready→delivered hariç)
- `deliver` — teslimat (→ ready'ye döner, imza logu kalır)
- `create` — yeni kayıt oluşturma (sadece aynı gün, soft delete)
- `damage` — hasar kaydı (hasar kaydı silinir)
- `lost` — kayıp işaretleme (→ dirty'e döner)
- `found` — bulunan işaretleme (geri alınır)
- `batch_assign` — toplu makine ataması (tüm item'lar önceki statüsüne döner)

### Veri Akışı

**Frontend — undoStack:**

```js
// Zustand store veya React context'te global array
undoStack: [
  {
    id: uuid(),
    action: 'advance',
    label: 'Oda 204 → Yıkamaya atandı',
    reversePayload: { itemId: 42, prevStatus: 'dirty', prevMachineId: null },
    timestamp: Date.now(),
  },
  // ... max 10 eleman, LIFO
]
```

Her mutation başarıyla tamamlandığında `undoStack`'e push edilir. 10'u aşınca en eski düşer. Sayfa yenilenince sıfırlanır.

**Backend — Undo API:**

```
POST /api/laundry/undo
Authorization: Bearer <token>
Body: { action, reversePayload }
```

| action | reversePayload | Yapılan işlem |
|--------|---------------|---------------|
| `advance` | `{ itemId, prevStatus, prevMachineId }` | status + machine_id geri alınır |
| `deliver` | `{ itemId }` | status → ready |
| `create` | `{ itemId }` | kayıt silinir (sadece created_at bugün ise) |
| `damage` | `{ damageId }` | damage kaydı silinir |
| `lost` | `{ itemId }` | status → dirty |
| `found` | `{ itemId }` | status → lost |
| `batch_assign` | `{ itemIds, prevStatuses }` | her item kendi önceki statüsüne döner |

Yetki: `laundry`, `campus_manager` — sadece kendi işlemlerini değil tüm işlemleri geri alabilir (aynı session'da).

### Frontend UI

**Toast (anlık):**
- Her mutation sonrası sağ alt köşede 5 sn görünen snackbar
- Format: `"[label] · ↩ Geri Al"`
- "Geri Al" tıklanınca undo API çağrılır, ilgili query invalidate edilir
- Toast kapanınca (5 sn sonra) stack'ten düşmez — panel'den hâlâ erişilebilir

**Floating Panel (Ctrl+Z):**
- `Ctrl+Z` tuşu veya sabit floating buton (sağ alt, toast'ın üstü) ile toggle
- Son 10 işlemi listeler, her satırda:
  - İşlem ikonu + label + zaman ("3 dk önce")
  - "↩ Geri Al" butonu
- Panel açıkken `Escape` ile kapanır
- Undo sonrası ilgili satır listeden kalkar

### Kısıtlar

- Session bazlı: sayfa yenilenince undo geçmişi kaybolur
- `deliver` geri alınabilir ama imza logu `laundry_history`'de kalır
- Zincir undo yok: her işlem bağımsız geri alınır
- `create` undo → sadece aynı gün **ve** status hâlâ `dirty` ise gerçek DELETE; aksi hâlde undo reddedilir (400)

---

## A5: Deterjan Stok Takibi

### Özet

Yönetici tanımlı ürün listesi, makine bazlı otomatik tüketim, manuel düzeltme, 2 seviyeli eşik uyarısı. Settings'te yönetim sekmesi, LaundryHub'da stok widget'ı.

### Veritabanı

```sql
-- Ürün tanımları
CREATE TABLE laundry_supplies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  current_stock REAL NOT NULL DEFAULT 0,
  warning_threshold REAL NOT NULL DEFAULT 0,   -- sarı: uyarı
  critical_threshold REAL NOT NULL DEFAULT 0,  -- kırmızı: kritik
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Makine-ürün bağlantısı (her yıkamada ne kadar tüketilir)
CREATE TABLE laundry_machine_supplies (
  machine_id INTEGER NOT NULL REFERENCES laundry_machines(id) ON DELETE CASCADE,
  supply_id  INTEGER NOT NULL REFERENCES laundry_supplies(id) ON DELETE CASCADE,
  per_wash_amount REAL NOT NULL DEFAULT 0.1,
  PRIMARY KEY (machine_id, supply_id)
);

-- Stok hareket logu
CREATE TABLE laundry_supply_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supply_id  INTEGER NOT NULL REFERENCES laundry_supplies(id),
  delta      REAL NOT NULL,          -- pozitif: giriş, negatif: tüketim
  reason     TEXT NOT NULL,          -- 'wash_auto' | 'manual_add' | 'manual_correction'
  item_id    INTEGER,                -- wash_auto'da hangi iş
  machine_id INTEGER,                -- wash_auto'da hangi makine
  note       TEXT,                   -- manuel işlemlerde açıklama
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Otomatik Tüketim

`advanceItemService` içinde item `washing` statüsüne geçerken:

```js
// Makinenin bağlı olduğu ürünleri bul
const machineSupplies = getMachineSuppliesQuery(machine_id)

// Her ürün için stok düş + log yaz
for (const ms of machineSupplies) {
  decrementSupplyQuery(ms.supply_id, ms.per_wash_amount, item_id, machine_id, userId)
}
```

Stok 0'ın altına düşmez (min 0 clamp). Uyarı/kritik eşik geçildiğinde SSE eventi tetiklenir.

### Manuel Stok İşlemleri

- **Giriş (manual_add):** "X kg deterjan geldi" — pozitif delta
- **Düzeltme (manual_correction):** Sayım sonrası mevcut stoku doğrudan set et — delta = yeni - eski

### Frontend UI

**Settings — "Stok" Sekmesi (`LaundrySettings.jsx`):**
- Ürün listesi: ad, birim, mevcut stok, uyarı eşiği, kritik eşik
- Ürün ekle / düzenle / pasif yap (sil değil)
- Her ürün için "Makine Bağlantıları" — hangi makinelerde, ne kadar tüketim
- Manuel stok girişi formu (giriş veya düzeltme)
- Son 20 hareket logu

**LaundryHub — Stok Widget'ı:**
- `MachineStrip`'in hemen altında ince bir satır
- Her kritik/uyarı ürün için renkli badge: `🔴 Deterjan: 0.5 kg` / `🟡 Yumuşatıcı: 2 kg`
- Sorun yoksa widget görünmez (gizli kalır)
- Tıklayınca Settings/Stok sekmesine yönlendirir

### Yetkiler

| İşlem | campus_manager | laundry | shift_supervisor |
|-------|:---:|:---:|:---:|
| Stok görüntüleme | ✓ | ✓ | ✓ |
| Ürün ekle/düzenle | ✓ | — | — |
| Manuel stok girişi | ✓ | — | — |
| Makine bağlantısı | ✓ | — | — |

### SSE Bildirimleri

Stok uyarı/kritik eşiğini geçince `supply_alert` eventi yayınlanır:
```json
{ "type": "supply_alert", "supply_id": 1, "name": "Deterjan", "level": "critical", "current_stock": 0.5 }
```

---

## Uygulama Sırası

1. **L2** — Backend undo endpoint + frontend undoStack + Toast + Ctrl+Z panel
2. **A5** — DB migration + backend queries/service/routes + Settings sekmesi + LaundryHub widget

Her biri ayrı commit/faz olarak uygulanır.
