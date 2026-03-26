# Çamaşırhane Modülü — Tasarım Dokümanı

**Tarih:** 2026-03-26
**Durum:** Onaylı — Uygulamaya hazır
**Yazar:** Brainstorming oturumu

---

## 1. Özet

Mevcut standalone HTML çamaşır takip uygulaması (`laundro-ultimate.html`) kaldırılıyor. Yerine yatakhane yönetim sistemine entegre, full-stack bir `laundry` modülü ekleniyor.

---

## 2. Mimari

### Konumlanma
Mevcut `backend/src/modules/<modül>/` ve `frontend/src/modules/<modül>/` paternine tam uyumlu olarak ekleniyor.

### Backend
```
backend/src/modules/laundry/
  routes.js        — Express router, JWT + rol kontrolü
  service.js       — İş mantığı, state machine geçişleri
  queries.js       — SQL sorguları (parametreli, injection-safe)
  sla.js           — SLA ihlal motoru, cron tabanlı kontrol
  whatsapp.js      — WhatsApp bildirim gönderimi (Twilio/Meta API)
  laundry.test.js  — Vitest integration testleri
```

### Frontend
```
frontend/src/modules/laundry/
  LaundryPage.jsx          — Ana sayfa (liste + filtreler)
  LaundryDashboard.jsx     — KPI + makine + kanban view
  MachinePanel.jsx         — Makine yönetimi
  LaundryReport.jsx        — Raporlama + dışa aktarım
  LaundrySettings.jsx      — SLA eşikleri + makine config
  components/
    ItemCard.jsx           — Çamaşır kayıt kartı
    NewItemModal.jsx       — Yeni kayıt formu
    DeliveryModal.jsx      — Teslim akışı (isim + opsiyonel imza)
    MachineCard.jsx        — Makine durumu kartı
    SlaAlert.jsx           — SLA ihlal uyarı bileşeni
    QueuePanel.jsx         — Sıra görünümü
```

---

## 3. Veritabanı Şeması

### `laundry_items`
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | INTEGER PK | |
| room_id | INTEGER FK → rooms(id) | Oda referansı |
| status | TEXT | dirty \| washing \| ready \| delivered \| lost |
| machine_id | INTEGER FK → laundry_machines(id) | NULL ise atanmamış |
| urgent | INTEGER | 0/1 — acil bayrağı |
| item_count | INTEGER | Parça adedi |
| item_details | TEXT | JSON — kıyafet detayları |
| shelf_location | TEXT | Raf konumu (örn: "2. Kat", NULL ise atanmamış) |
| photo_url | TEXT | Fotoğraf yolu (opsiyonel) |
| notes | TEXT | Açıklama |
| created_by | INTEGER FK → users(id) | |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### `laundry_machines`
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | INTEGER PK | |
| name | TEXT | Örn: "Makine 1", "Kurutucu 1" |
| type | TEXT | washer \| dryer |
| status | TEXT | idle \| running \| done \| maintenance |
| timer_end | TEXT | ISO timestamp — NULL ise boş |
| capacity_kg | REAL | Kapasite |
| maintenance_notes | TEXT | Bakım notları |

### `laundry_queue`
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | INTEGER PK | |
| item_id | INTEGER FK → laundry_items(id) | |
| machine_id | INTEGER FK → laundry_machines(id) | |
| priority | TEXT | normal \| urgent |
| position | INTEGER | Sıradaki konum (1 = başı) |
| created_at | TEXT | |

**Kural:** `urgent` olan kayıtlar otomatik olarak `position = 1`'e yerleşir, diğerleri FIFO ile eklenir.

### `laundry_deliveries`
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | INTEGER PK | |
| item_id | INTEGER FK → laundry_items(id) | |
| delivered_to | TEXT | Teslim alanın adı (zorunlu) |
| signature_data | TEXT | base64 canvas (opsiyonel) |
| delivered_by | INTEGER FK → users(id) | |
| delivered_at | TEXT | |

### `laundry_damages`
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | INTEGER PK | |
| item_id | INTEGER FK → laundry_items(id) | |
| photo_url | TEXT | Hasar fotoğrafı |
| description | TEXT | Açıklama |
| reported_by | INTEGER FK → users(id) | |
| created_at | TEXT | |

### `laundry_sla_config`
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | INTEGER PK | |
| stage | TEXT | dirty \| washing \| ready |
| warning_hours | REAL | Sarı uyarı eşiği |
| critical_hours | REAL | Kırmızı kritik eşiği |
| updated_by | INTEGER FK → users(id) | |
| updated_at | TEXT | |

**Varsayılan değerler:**
- dirty: warning=24h, critical=48h
- washing: warning=makine_süresi+30dk, critical=makine_süresi+60dk
- ready: warning=24h, critical=48h

### `laundry_history`
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | INTEGER PK | |
| item_id | INTEGER FK → laundry_items(id) | |
| from_status | TEXT | Önceki durum |
| to_status | TEXT | Yeni durum |
| action_by | INTEGER FK → users(id) | |
| notes | TEXT | |
| created_at | TEXT | |

---

## 4. Durum Makinesi (State Machine)

```
dirty ──────────────► washing ──────────────► ready ──────────────► delivered → (history)
  │                      │                      │
  └──────────────────────┴──────────────────────┴──► lost
```

**Geçiş Kuralları:**
- `dirty → washing`: machine_id atanmalı, sıradan çıkar
- `washing → ready`: `shelf_location` güncellenir, makine `done` olur
- `ready → delivered`: delivered_to zorunlu, signature_data opsiyonel
- Herhangi durum → `lost`: her zaman mümkün

**Geriye alma:** Her geçiş `laundry_history`'e kaydedilir. Manuel geri alma desteklenmez — yeni kayıt açılır.

---

## 5. API Endpoint'leri

```
GET    /api/laundry/items              — Liste (filtreler: status, urgent, sla)
POST   /api/laundry/items              — Yeni kayıt
PATCH  /api/laundry/items/:id/advance  — Durum ilerlet
PATCH  /api/laundry/items/:id/deliver  — Teslim et (delivered_to zorunlu)
PATCH  /api/laundry/items/:id/lost     — Kayıp işaretle
DELETE /api/laundry/items/:id          — Sil (sadece dirty durumunda)

GET    /api/laundry/machines           — Makine listesi
POST   /api/laundry/machines           — Yeni makine
PATCH  /api/laundry/machines/:id       — Makine güncelle (durum, timer)

GET    /api/laundry/queue              — Sıra listesi
POST   /api/laundry/queue              — Sıraya ekle
DELETE /api/laundry/queue/:id          — Sıradan çıkar

GET    /api/laundry/reports/stats      — İstatistikler (tarih aralığı)
GET    /api/laundry/reports/export     — CSV dışa aktarım

GET    /api/laundry/sla-config         — SLA ayarları
PUT    /api/laundry/sla-config         — SLA ayarlarını güncelle
GET    /api/laundry/sla/violations     — Aktif SLA ihlalleri
```

---

## 6. Yetki Matrisi

| Endpoint grubu | laundry | shift_supervisor | campus_manager | technical | housekeeper |
|---------------|---------|-----------------|---------------|-----------|-------------|
| Items CRUD | ✅ | 👁 görüntüle | 👁 görüntüle | ❌ | ❌ |
| Durum geçişi | ✅ | ❌ | ❌ | ❌ | ❌ |
| Teslim | ✅ | ❌ | ❌ | ❌ | ❌ |
| Makine yönetim | ✅ | ❌ | ❌ | ❌ | ❌ |
| Raporlar | ✅ | ✅ | ✅ | ❌ | ❌ |
| SLA config | ✅ | ❌ | ✅ | ❌ | ❌ |
| SLA ihlalleri | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## 7. SSE Bildirimleri

Mevcut `GET /api/notifications/stream` SSE endpoint'i şu olayları yayınlar:

| Olay | Tetikleyici | Alıcılar |
|------|-------------|----------|
| `laundry:machine_done` | Makine süresi doldu | laundry + shift_supervisor |
| `laundry:sla_warning` | SLA sarı eşiği aşıldı | laundry + shift_supervisor + campus_manager |
| `laundry:sla_critical` | SLA kırmızı eşiği aşıldı | tüm roller |
| `laundry:item_ready` | Kayıt "ready" durumuna geçti | laundry |

---

## 8. WhatsApp Entegrasyonu

**Tetikleyici:** `status = ready` olduğunda, `laundry_items.room_id` üzerinden odanın sakininin telefon numarası residents tablosundan sorgulanır.

**Mesaj:** `"Oda {oda_no} — {adet} parça çamaşırınız rafta hazır. 🧺"`

**Sağlayıcı:** Twilio veya Meta Cloud API (config ile seçilebilir)

**Başarısız gönderim:** Log tutulur, uygulama akışı engellenmez (fire-and-forget).

---

## 9. SLA Motoru

`sla.js` her 15 dakikada bir cron job ile çalışır (`backend/src/shared/cron/`):

1. `laundry_items` tablosunu `status != 'delivered'` filtreyle sorgular
2. Her kayıt için `updated_at` farkını hesaplar
3. `laundry_sla_config` eşikleriyle karşılaştırır
4. Eşik aşıldıysa SSE olayı tetikler

---

## 10. UI Tasarım Sistemi

Mevcut yatakhane tema tokenleri kullanılır (`--bg: #080c14`, `--accent: #6366f1` vb.).

**Ek premium özellikler:**
- Sol sidebar navigasyon (desktop)
- Ambient radial glow — köşelerde accent renk
- Makine kartlarında LED dot + progress bar
- KPI kartlarında sağ üst glow damlası
- Kart sol kenar aksanı (2.5px renkli border)
- Avatar chip'leri (baş harfi + isim)
- SLA ihlali blink animasyonu

**Responsive breakpoint:** `768px` altında sidebar gizlenir, mobil layout aktif olur.

---

## 11. Uygulama Fazları

### Faz 1 — Çekirdek CRUD
- DB migration: 6 tablo
- Backend: items CRUD + state machine
- Frontend: LaundryPage, ItemCard, NewItemModal, DeliveryModal
- Test: service.js unit testleri

### Faz 2 — Makine Yönetimi + SLA
- Backend: machines API + sla.js cron + SSE olayları
- Frontend: MachineCard, MachinePanel, SlaAlert
- Test: SLA engine testleri

### Faz 3 — Raporlama + WhatsApp
- Backend: reports API + whatsapp.js
- Frontend: LaundryReport (istatistik + CSV export)
- Test: whatsapp mock testleri

### Faz 4 — Fotoğraf + Sıra Sistemi
- Backend: queue API + dosya upload (multer)
- Frontend: QueuePanel, fotoğraf çekme UI, hasar kaydı
- Test: queue priority testleri

### Faz 5 — Ayarlar Paneli
- Backend: sla-config PUT endpoint'i
- Frontend: LaundrySettings (SLA eşikleri, makine tanımları, WA test)
- Test: config güncelleme testleri

---

## 12. Test Stratejisi

- Her modül dosyası `laundry.test.js` içinde `DB_PATH = ':memory:'` ile test edilir
- State machine geçişleri: tüm geçerli/geçersiz kombinasyonlar test edilir
- SLA engine: zaman mock'u ile eşik testleri
- API endpoint'leri: rol bazlı yetki testleri (401/403 kontrolleri)
- WhatsApp: mock ile fire-and-forget davranışı test edilir

---

## 13. Dışarıda Bırakılanlar

- QR/barkod etiketi (blok+oda numarası yeterli)
- Manuel takvimli rezervasyon (FIFO+acil öncelik yeterli)
- E-posta bildirimi (WhatsApp tercih edildi)
- Yeni `laundry_supervisor` rolü (mevcut `laundry` rolü tam yetkili)
