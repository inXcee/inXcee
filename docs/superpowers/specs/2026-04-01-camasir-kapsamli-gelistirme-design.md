# Çamaşırhane Modülü — Kapsamlı Geliştirme Spec

**Tarih:** 2026-04-01
**Durum:** Onaylandı
**Kapsam:** Operasyonel iyileştirmeler, ütü aşaması, parça doğrulama, arşiv, WhatsApp SLA

---

## Genel Bakış

Mevcut çamaşırhane modülü (~%85 tamamlanmış) şu alanlarda genişletilecek:

1. **Faz 1** — Batch işlemler, makine bakım UI, oda bazlı kanban gruplama
2. **Faz 2** — Çamaşır girme detaylandırma, ütü aşaması
3. **Faz 3** — Parça tik kontrol sistemi
4. **Faz 4** — Arşiv sekmesi, tarih filtresi, CSV güncelleme
5. **Faz 5** — WhatsApp SLA bildirimi

---

## Mevcut State Machine

```
dirty → washing → ready → delivered
         ↕ revert
lost ← (dirty/washing/ready)
lost → ready (found)
```

## Güncellenmiş State Machine

```
dirty → washing → ready → [ironing] → ready → delivered
                    ↑ tik            ↑ tik       ↑ tik (opsiyonel)
lost ← (dirty/washing/ready/ironing)
lost → ready (found)
```

`ironing` statüsü yalnızca `needs_ironing = true` olan parçalar için devreye girer.

---

## Faz 1 — Operasyonel İyileştirmeler

### 1.1 Batch İşlemler

**UI:**
- Kirli statüsündeki kartlarda hover'da checkbox görünür
- 2+ kart seçilince alt floating bar belirir: `X kart seçildi — [Makineye Ata] [Kayıp İşaretle] [İptal]`
- "Makineye Ata" → BatchAssignModal açılır: makine seçimi, opsiyonel timer, onay
- "Kayıp İşaretle" → onay dialog'u + opsiyonel toplu not alanı

**Yeni API Endpoint'leri:**
```
POST /laundry/items/batch-assign
  Body: { item_ids: number[], machine_id: number, timer_minutes?: number }
  Response: { success: number[], failed: number[] }

POST /laundry/items/batch-lost
  Body: { item_ids: number[], notes?: string }
  Response: { success: number[], failed: number[] }
```

**İş Kuralları:**
- Batch assign: yalnızca `dirty` statüsündeki parçalar
- Batch lost: `dirty`, `washing`, `ready` statüsündeki parçalar
- Makine `maintenance` veya `running` ise assign'a izin verilmez
- Her item için ayrı `laundry_history` kaydı oluşturulur

### 1.2 Makine Bakım UI

**`MachineManagerPanel` Değişiklikleri:**
- Her makine kartına "Bakıma Al" butonu eklenir
- Tıklayınca: `maintenance_notes` textarea açılır → "Onayla" → `status = 'maintenance'`
- `maintenance` statüsündeki makine: kırmızı/gri rozet, "Bakımda" badge, timer ve assign butonu devre dışı
- "Aktif Et" butonu → `status = 'idle'`

**API:** Mevcut `PATCH /laundry/machines/:id` endpoint'i yeterli.

### 1.3 Oda Bazlı Kanban Gruplama

**UI:**
- Kanban üst bar'ına "Oda'ya Göre Grupla" toggle eklenir
- Aktifken: her statü sütunu içinde oda alt grup başlıkları görünür
  ```
  [Kirli]
  ├── S2-101 (3 kart)
  │   ├── kart
  │   └── kart
  └── S2-102 (1 kart)
      └── kart
  ```
- Grup başlığına tıklayınca collapse/expand
- Toggle durumu `localStorage`'da saklanır
- Sürükle-bırak gruplama içinde çalışmaya devam eder

---

## Faz 2 — Çamaşır Girme & Ütü Aşaması

### 2.1 Intake Detaylandırma

**`NewItemModal` Değişiklikleri:**

Her kıyafet satırına şu alanlar eklenir:
- `tip` (mevcut: gömlek, pantolon vb.)
- `adet` (mevcut)
- `renk` (yeni: text input, opsiyonel)
- `özellik notu` (yeni: kısa metin, opsiyonel — "düğme eksik", "yaka lekesi")

**Ön Hasar Kaydı:**
- Modal alt kısmına "Tespit edilen ön hasar" bölümü
- Fotoğraf çekme + metin açıklama
- Kaydedilince `laundry_damages` tablosuna `at_intake = 1` flag'ı ile eklenir

**İki İmza Desteği:**
- Mevcut: personel imzası
- Yeni (opsiyonel, ayardan açılabilir): oda sakini onay imzası
- `LaundrySettings`'e "Çift İmza Zorunlu" toggle eklenir
- `laundry_items` tablosuna `occupant_signature TEXT` kolonu eklenir

**DB değişiklikleri (`laundry_items`):**
```sql
-- clothing_items JSON içindeki her eleman genişler:
-- { type, count, color?, note? }
-- Mevcut format geriye uyumlu (color/note opsiyonel)

ALTER TABLE laundry_items ADD COLUMN occupant_signature TEXT;
ALTER TABLE laundry_items ADD COLUMN needs_ironing INTEGER DEFAULT 0;
```

### 2.2 Ütü Aşaması

**State Machine Eklentisi:**
- `needs_ironing = 1` ise `ready` statüsünden sonra `ironing` statüsü gelir
- `needs_ironing = 0` ise mevcut akış değişmez
- `ironing → ready` geçişi: "Ütülendi" butonu

**Kanban:**
- 4. sütun eklenir: **Ütü** (yalnızca `needs_ironing = 1` ve statüsü `ironing` olan kartlar)
- Sütun görünürlüğü otomatik — ütü gereken parça yoksa sütun gösterilmez

**DB:**
```sql
-- laundry_items status CHECK constraint güncellemesi:
-- 'dirty','washing','ready','ironing','delivered','lost'
```

**API:** Mevcut `PATCH /laundry/items/:id/advance` endpoint'i `ironing` statüsünü handle eder.

---

## Faz 3 — Parça Tik Kontrol

### 3.1 Verification Sistemi

**Tetiklenme Noktaları:**
1. `washing → ready` (yıkama bitip rafa kaldırılırken) — **zorunlu**
2. `ironing → ready` (ütüden çıkıp rafa kaldırılırken) — **zorunlu**
3. `ready → delivered` (teslimde) — **opsiyonel**, ayardan açılır

**`ItemVerificationModal` Bileşeni:**

```
┌─────────────────────────────────────────┐
│ Parça Kontrol — Ahmet Yılmaz (S2-101)  │
├─────────────────────────────────────────┤
│ Aşama: Yıkama → Raf                    │
│                                         │
│ [✓] Beyaz gömlek × 2    (not: —)       │
│ [✓] Lacivert pantolon × 1              │
│ [ ] Gri kazak × 1                      │
│                                         │
│ ⚠ Eksik parça notu: [____________]     │
│                                         │
│ [Eksikle Devam Et]    [Tümünü Onayla]  │
└─────────────────────────────────────────┘
```

- Her satır tıklanabilir → checked/unchecked
- Tümü işaretlenince "Tümünü Onayla" aktifleşir
- "Eksikle Devam Et" her zaman aktif — not girişi zorunlu olur

**Yeni Tablo:**
```sql
CREATE TABLE laundry_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES laundry_items(id),
  stage TEXT NOT NULL CHECK(stage IN ('washing_to_ready','ironing_to_ready','delivery')),
  verified_by TEXT NOT NULL,
  verified_at DATETIME DEFAULT (datetime('now')),
  items_json TEXT NOT NULL,  -- [{ name, count, color, checked }]
  missing_notes TEXT,
  all_present INTEGER DEFAULT 1,
  UNIQUE(item_id, stage)
);
```

**Kart Rozeti:**
- `all_present = 1` → yeşil "✓ Doğrulandı" rozeti
- `all_present = 0` → turuncu "⚠ X Eksik" rozeti, hover'da `missing_notes` tooltip

**Yeni API Endpoint:**
```
POST /laundry/items/:id/verify
  Body: { stage, items: [{name, count, checked}], missing_notes?, all_present }
  Auth: laundryFull
```

---

## Faz 4 — Arşiv & Tarih Filtresi

### 4.1 Kanban Tarih Filtresi

**Üst Bar Eklentisi:**
- Tarih aralığı picker: `başlangıç` / `bitiş`
- Hızlı butonlar: "Bugün" | "Bu Hafta" | "Bu Ay"
- Filtre aktifken `delivered` ve `lost` kartlar kanban'da soluk (opacity: 0.7) gösterilir
- Filtre yok → mevcut davranış (yalnızca aktif statüler)

### 4.2 Arşiv Sekmesi

**LaundryHub Tab Yapısı:**
```
[Kanban] [Arşiv] [Raporlar]
```

**Arşiv Tablo Görünümü:**
- Kolonlar: Oda, Kişi, Parça adedi, Kıyafetler (özet), Giriş, Teslim, Toplam süre, Durum, Doğrulama
- Arama: oda no, kişi adı
- Filtreler: durum (delivered/lost), tarih aralığı, oda
- Sayfalama: 50 kayıt/sayfa

**Detay Panel (Sağ Kayar):**
- Kart tıklandığında açılır
- Tam `laundry_history` timeline'ı
- Kıyafet listesi (renk, not ile)
- Giriş imzası + teslim imzası
- Doğrulama kayıtları (tik detayları)
- Eksik parça notları

**Yeni API:**
```
GET /laundry/items/archive
  Query: { from?, to?, status?, room?, search?, page?, limit? }
```

### 4.3 CSV Export Güncelleme

`GET /laundry/reports/export` yeni query parametreleri:
- `from`, `to` — tarih aralığı
- `status` — virgülle ayrılmış durum listesi
- `include_verifications` — doğrulama kolonlarını ekle

Yeni CSV kolonları: `needs_ironing`, `all_present`, `missing_notes`, `ironing_completed_at`

---

## Faz 5 — WhatsApp SLA Bildirimi

### 5.1 SLA WhatsApp Entegrasyonu

**Tetikleyici:** Mevcut `sla.js` cron'una ek mantık eklenir.

**Kurallar:**
- `critical` seviyeye geçen her parça için kampüs müdürüne WhatsApp
- Aynı `item_id + stage` için **günde maksimum 1** bildirim
- `whatsapp_notify = 0` ise hiç gönderilmez

**Mesaj Formatı:**
```
🚨 SLA Kritik: [Blok]-[Oda]
Durum: [dirty/washing/ready]
Bekleme: [X] saat
Parça: [kıyafet özeti]
Sorumlu: [intake_name]
```

**Yeni Tablo:**
```sql
CREATE TABLE laundry_sla_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES laundry_items(id),
  stage TEXT NOT NULL,
  sent_at DATETIME DEFAULT (datetime('now')),
  phone TEXT NOT NULL,
  UNIQUE(item_id, stage, date(sent_at))
);
```

### 5.2 Ayarlar Güncellemesi

`LaundrySettings`'e "SLA Bildirimleri" bölümü:
- "WhatsApp SLA Bildirimi" toggle
- "Alıcı Telefon Numarası" input (TR formatı: 905xx...)
- Kaydet → `laundry_sla_config` güncellenir

**DB:**
```sql
-- whatsapp_notify: per-stage (her aşama bağımsız açılabilir)
ALTER TABLE laundry_sla_config ADD COLUMN whatsapp_notify INTEGER DEFAULT 0;

-- notify_phone: global (tüm aşamalar için aynı alıcı)
-- Ayrı tablo — per-stage tabloya eklenmesi pratik değil
CREATE TABLE IF NOT EXISTS laundry_global_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- 'sla_notify_phone' key'i ile saklanır
```

---

## Veritabanı Değişiklikleri Özeti

### Yeni Tablolar
- `laundry_verifications` (Faz 3)
- `laundry_sla_notifications` (Faz 5)
- `laundry_global_settings` (Faz 5) — key/value global ayarlar (`sla_notify_phone`)

### Mevcut Tablo Değişiklikleri
```sql
-- laundry_items
ALTER TABLE laundry_items ADD COLUMN occupant_signature TEXT;         -- Faz 2
ALTER TABLE laundry_items ADD COLUMN needs_ironing INTEGER DEFAULT 0; -- Faz 2
-- status CHECK'e 'ironing' eklenir                                     -- Faz 2

-- laundry_damages
ALTER TABLE laundry_damages ADD COLUMN at_intake INTEGER DEFAULT 0;   -- Faz 2

-- laundry_sla_config
ALTER TABLE laundry_sla_config ADD COLUMN whatsapp_notify INTEGER DEFAULT 0; -- Faz 5
```

---

## Yetki Matrisi (Değişiklik Yok)

| İşlem | laundry | shift_supervisor | campus_manager |
|-------|---------|-----------------|----------------|
| Batch assign/lost | ✓ | — | ✓ |
| Makine bakım | — | — | ✓ |
| Parça doğrulama | ✓ | — | ✓ |
| Arşiv görüntüleme | ✓ | ✓ | ✓ |
| SLA ayarları | — | — | ✓ |

---

## Test Kapsamı

Her faz için `laundry.test.js`'e eklenir:

- **Faz 1:** batch-assign (başarılı, maintenance makinede hata), batch-lost (mixed statü), makine bakım toggle
- **Faz 2:** intake with color+note, needs_ironing flag, ironing state transition, çift imza
- **Faz 3:** verification kaydı, duplicate prevention (UNIQUE constraint), eksik parça notu
- **Faz 4:** archive query filtresi, pagination, CSV yeni parametreler
- **Faz 5:** SLA notification dedup (günde 1), whatsapp_notify=0 ise gönderilmeme

---

## Dosya Değişiklik Haritası

### Backend
- `queries.js` — batch sorguları, archive query, verification CRUD, SLA notification
- `service.js` — batch iş mantığı, ironing state, verification zorunluluk kontrolü
- `routes.js` — yeni endpoint'ler
- `whatsapp.js` — SLA mesaj fonksiyonu
- `sla.js` — WhatsApp SLA entegrasyonu
- `backend/src/shared/db/schema.js` — yeni tablolar + ALTER'lar

### Frontend
- `LaundryHub.jsx` — tab yapısı, tarih filtresi, oda gruplama toggle, batch seçim bar
- `LaundrySettings.jsx` — SLA bildirim bölümü, çift imza toggle
- `ItemCard.jsx` — doğrulama rozeti, ütü badge
- `NewItemModal.jsx` — renk/not alanları, ön hasar, ikinci imza
- `MachineManagerPanel.jsx` — bakım toggle UI
- `components/BatchAssignModal.jsx` — yeni
- `components/ItemVerificationModal.jsx` — yeni
- `components/ArchivePanel.jsx` — yeni (detay panel)
- `components/ArchiveTable.jsx` — yeni
