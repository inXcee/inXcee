# Kiosk Yeniden Tasarım v2 — Design Spec

**Tarih:** 2026-04-19  
**Kapsam:** AVS Laundry Kiosk — Ütü ekranı, Teslim formu yeniden tasarım, Premium otomatik, Renk/desen paleti

---

## 1. Ana Ekran Değişiklikleri

### Mevcut → Yeni
- **Makineye Yükle** butonu **kaldırılır** (5 butona düşer)
- **Torba Topla** → **Ütü** olarak değiştirilir
- Layout: 2 büyük üst buton (Torba Bırak + Ütü) + 3 küçük alt buton (Teslim Et + Durum + Kıyafet Gir)

```
┌─────────────┬─────────────┐
│  🧺 Torba   │    🫧 Ütü   │  ← büyük (2-kolon)
│    Bırak    │             │
├──────┬──────┬──────┬──────┤
│  🚚  │  📋  │  👔  │      │  ← küçük (3-kolon)
│Teslim│Durum │Kıyafet      │
└──────┴──────┴──────┘
```

---

## 2. Ütü Ekranı (IroningView)

Eski `CollectView` (Torba Topla) tamamen kaldırılır. Yerine `IroningView` gelir.

### Akış
1. **Adım 1 — Torba Seç**: `ironing` statusundaki torbalar listelenir. Her torba: torba kodu, blok-oda, kıyafet sayısı, sakin adı.
2. **Adım 2 — Kıyafet Doğrula**: Seçilen torbanın `garments_json` parse edilir, her kıyafet satır olarak listelenir (emoji, ad, renk, desen, adet). Personel her satırı tik ile işaretler.
3. **Adım 3 — Tamamla**: Tüm kıyafetler tiklenince "Ütü Tamamla — Hazıra Al" butonu aktifleşir. Onaylanınca torba `ready` statusuna geçer.

### Backend
- `PATCH /laundry-kiosk/bags/:id/ironing-complete` endpoint'i — status'u `ironing → ready` yapar.
- `garments_json` parse edilerek kıyafet listesi frontend'e döner (veya frontend parse eder).

---

## 3. Teslim Formu Yeniden Tasarımı (DeliverView)

Mevcut Staff/Sakin ayrımı **kaldırılır**. Tek akış.

### Form Alanları (sırayla)
1. **Blok Seçici** (zorunlu)
   - M Blokları: `M1` `M2` `M3` — hızlı butonlar
   - S Blokları: `S1` `S2` `S3` — hızlı butonlar  
   - Tek: `C`
   - `Diğer…` → seçilince text input açılır (blok adı manuel giriş)
2. **Oda No** (zorunlu) — text input
3. **Ad Soyad** (zorunlu) — text input
4. **Torba** — blok+oda kombinasyonuna göre `ready` statuslu torbalar filtrelenir, otomatik seçili gelir
5. **File Adedi** (zorunlu) — +/− stepper, min 1
6. **İmza** (zorunlu) — canvas imza alanı
7. **Teslim Et** butonu — tüm alanlar dolunca aktif

### Premium Otomatik
- M1/M2/M3, S1/S2/S3 seçilince → `service_type = 'regular'`
- C, Diğer seçilince → `service_type = 'premium'`
- UI'da küçük badge ile gösterilir, değiştirilemez

### Backend Değişiklikleri
- `laundry_items` tablosuna `delivered_name TEXT`, `file_count INTEGER` kolonları eklenir (migration)
- `POST /laundry-kiosk/deliver` endpoint güncellenir: `block`, `room`, `delivered_name`, `file_count`, `signature` alanları kabul eder

---

## 4. Kıyafet Girişi — Renk & Desen Paleti

`GarmentPicker` bileşeni güncellenir.

### Renk Paleti (13 renk)
Yuvarlak swatch grid (6 kolon):

| Renk | Hex | Chip bg |
|------|-----|---------|
| Beyaz | `#f8fafc` | `#f1f5f9` text siyah |
| Siyah | `#0f172a` | `#1e293b` text beyaz |
| Gri | `#94a3b8` | `#334155` |
| Lacivert | `#1d4ed8` | `#1e3a5f` |
| Mavi | `#3b82f6` | `#1e3a5f` |
| Kırmızı | `#dc2626` | `#7f1d1d` |
| Yeşil | `#16a34a` | `#14532d` |
| Sarı | `#ca8a04` | `#422006` |
| Turuncu | `#ea580c` | `#431407` |
| Mor | `#7c3aed` | `#3b0764` |
| Pembe | `#db2777` | `#500724` |
| Kahve | `#92400e` | `#451a03` |
| Füme | `#4b5563` | `#1f2937` |

### Desen Seçici (6 desen)
CSS ile gerçek görsel önizleme:

| Desen | Key | CSS |
|-------|-----|-----|
| Düz | `solid` | düz arka plan |
| Çizgili | `striped-h` | yatay çizgiler |
| Dikey Çizgi | `striped-v` | dikey çizgiler |
| Kareli | `checked` | grid pattern |
| Ekose | `plaid` | çok renkli grid |
| Renkli/Baskı | `colorful` | conic-gradient |

### Kıyafet Kartı
Kıyafet listesinde her satırda:
- Sol: 48×48 desen önizleme kutusu (CSS ile)
- Ortada: emoji + ad + renk chip (renkli daire + isim) + desen chip (mini önizleme + isim)
- Sağ: +/− adet stepper

### Veri Yapısı (garments_json güncelleme)
```json
[
  {
    "type_id": 1,
    "type_name": "Gömlek",
    "emoji": "👔",
    "count": 2,
    "color": "red",
    "color_label": "Kırmızı",
    "pattern": "striped-h",
    "pattern_label": "Çizgili"
  }
]
```

---

## 5. Etkilenen Dosyalar

### Backend
- `backend/src/shared/db/index.js` — v9 migration: `delivered_name`, `file_count` kolonları
- `backend/src/modules/self-service/routes.js` — yeni `ironing-complete` endpoint + deliver endpoint güncelleme

### Frontend
- `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx` — IroningView ekle, MachineView kaldır, DeliverView yeniden yaz, ana ekran düzeni güncelle
- `frontend/src/modules/laundry-kiosk/GarmentPicker.jsx` — renk paleti + desen seçici + kıyafet kartı güncelleme
- `frontend/src/modules/laundry-kiosk/IroningView.jsx` — yeni dosya (veya LaundryKioskPage içinde)

---

## 6. Kapsam Dışı

- Ütü ekranında imza alınmaz (sadece tik doğrulama yeterli)
- Torba Bırak ve Kıyafet Gir ekranları bu kapsamda değiştirilmez
- Durum ekranı bu kapsamda değiştirilmez
