# Puantaj Pro — Profesyonel Muhasebe Seviyesi Tasarım Spec

**Tarih:** 2026-03-24
**Kapsam:** ShiftsPage → PuantajTab tam yeniden tasarım + yeni backend endpoint'ler
**Yaklaşım:** B — 2 alt proje (B1 backend, B2 frontend)

---

## 1. Kapsam

### Mevcut sistem sorunları
- Düz %15 gelir vergisi → yanlış (Türkiye artan oranlı dilim sistemi)
- İşsizlik sigortası yok
- İşveren maliyeti yok
- Kümülatif yıllık vergi yok
- Gün-gün döküm yok
- Export yok
- Bordro fişi yok
- İzin türü dökümü yok (yıllık/hastalık/acil ayrımı yok)

### Hedef
Muhasebe departmanının bordro hazırlarken kullanabileceği, yasal hesaplamaları doğru yapan, export edilebilir, her personel için yazdırılabilir bordro fişi üretebilen profesyonel puantaj sistemi.

---

## 2. Alt Proje B1 — Backend Hesaplama Motoru

### 2.1 Vergi ve Kesinti Hesabı

**Gelir vergisi dilimleri (2024):**
```
0 – 110.000 TL        → %15
110.001 – 230.000 TL  → %20
230.001 – 870.000 TL  → %27
870.001 – 3.000.000 TL → %35
3.000.001+ TL         → %40
```

**SGK ve işsizlik:**
| Kalem | İşçi | İşveren |
|---|---|---|
| SGK | %14 | %20.5 |
| İşsizlik sigortası | %1 | %2 |

**Damga vergisi:** Brüt × %0.759 (yasal zorunluluk)

**Kümülatif vergi:** Ocak'tan ilgili aya kadar toplam brüt üzerinden dilim uygulanır, önceki ayların vergisi çıkarılır. Backend'de Ocak–(ay-1) arası brüt sorgulanır.

**Mesai ücreti:** `(maaş / 30 / 8) × 1.5 × saat`

### 2.2 Enhanced `GET /shifts/puantaj` (mevcut endpoint genişletilir)

Mevcut alanlar korunur. Eklenen alanlar:

```js
{
  // İzin türü dökümü (leave_requests tablosundan)
  annual_leave_days: 2,
  sick_leave_days: 1,
  other_leave_days: 0,

  // Ücret bileşenleri
  daily_rate: 450,
  base_pay: 9000,
  overtime_pay: 1012,
  leave_pay: 900,
  gross: 10912,

  // Kesintiler
  ssi_worker: 1527,         // brüt × %14
  unemployment_worker: 109, // brüt × %1
  income_tax: 1388,         // artan oranlı dilim (kümülatif)
  stamp_tax: 82,            // brüt × %0.759
  total_deductions: 3106,
  net: 7806,

  // İşveren maliyeti
  ssi_employer: 2237,       // brüt × %20.5
  unemployment_employer: 218, // brüt × %2
  employer_total_cost: 13367,

  // Devam
  attend_rate: 95,          // (worked_days / work_days_in_month) × 100
  ytd_gross: 45000,         // Ocak'tan bu yana kümülatif brüt
  ytd_tax: 6750,            // Ocak'tan bu yana kümülatif vergi
}
```

### 2.3 Yeni `GET /shifts/puantaj/:staffId/days?month=YYYY-MM`

```js
// Response: array, her ay günü için bir eleman
[
  { date: '2024-03-01', day_of_week: 5, status: 'worked', shift_name: 'Sabah', start_hour: 8, end_hour: 16 },
  { date: '2024-03-02', day_of_week: 6, status: 'worked', shift_name: 'Sabah', start_hour: 8, end_hour: 16 },
  { date: '2024-03-03', day_of_week: 0, status: 'sunday' },
  { date: '2024-03-04', day_of_week: 1, status: 'absent' },
  { date: '2024-03-05', day_of_week: 2, status: 'on_leave', leave_type: 'annual' },
  { date: '2024-03-06', day_of_week: 3, status: 'no_record' }, // vardiya girilmemiş
  // ... tüm ay
]
```

Veri kaynağı: `shift_schedule LEFT JOIN shift_definitions`. Eğer o gün kayıt yoksa `no_record`. Pazar günleri `sunday`. Mesai kaydı varsa ayrı bir `overtime_hours` alanı eklenir.

### 2.4 Yeni `GET /shifts/puantaj/export/csv?month=YYYY-MM&dept_id=X`

CSV formatı (UTF-8 BOM, Excel uyumlu):
```
Ad Soyad,Departman,İş Günü,Çalıştı,İzin(Yıllık),İzin(Hastalık),İzin(Diğer),Devamsız,Mesai(s),Brüt,SGK İşçi,İşsizlik İşçi,Gelir Vergisi,Damga Vergisi,Net,İşveren SGK,İşveren İşsizlik,Toplam Maliyet
```

Response header: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="puantaj-YYYY-MM.csv"`

### 2.5 Etkilenen dosyalar (B1)

| Dosya | Değişiklik |
|---|---|
| `backend/src/modules/shifts/queries.js` | `getPuantaj` genişlet, `getStaffDayBreakdown` yeni, `getPuantajCsv` yeni |
| `backend/src/modules/shifts/service.js` | `puantajService` güncelle, `calcTax` yeni pure function, `staffDayBreakdownService` yeni, `puantajCsvService` yeni |
| `backend/src/modules/shifts/routes.js` | 2 yeni endpoint ekle |
| `backend/src/modules/shifts/shifts.test.js` | `calcTax` unit testleri, yeni endpoint testleri |

---

## 3. Alt Proje B2 — Frontend PuantajTab

### 3.1 Görünüm Modu Seçici

Üst bara 3 mod butonu eklenir:
```
[ 📋 LİSTE ]  [ 📅 TAKVİM ]  [ 🏢 ÖZET ]
```
State: `const [viewMode, setViewMode] = useState('list')` — `'list' | 'calendar' | 'summary'`

### 3.2 Mod 1 — LİSTE

Mevcut tablo genişletilir:

| AD SOYAD | DEPT | DEVAM | İŞ | İZİN | YOK | MESAİ | İZİN TÜRÜ | BRÜT | KESİNTİ | NET |
|---|---|---|---|---|---|---|---|---|---|---|

- **İZİN TÜRÜ** kolonu: küçük renkli chip'ler — 🔵 yıllık sayı, 🔴 hastalık sayı, 🟡 acil sayı (sıfırlar gizlenir)
- **KESİNTİ** kolonu: toplam kesinti tutarı, hover'da SGK+GV+DV dökümü tooltip
- İşveren maliyet kolonu toggle: varsayılan gizli, üst barda "💼 Maliyet Göster" butonu
- Satıra tıklanınca → Bordro Detay BottomSheet açılır
- **⬇ CSV İndir** butonu: export endpoint'ini çağırır, `api.get(..., { responseType: 'blob' })` ile indirir

### 3.3 Mod 2 — TAKVİM

Gün × personel matrisi:

```
         1   2   3   4  ...  31
Ahmet Y. ▓   ▓   ☀   ▓  ...  ▓
Fatma K. ▓   ✗   ☀   İ  ...  ▓
```

**Hücre durumları:**
- `worked` → küçük yeşil dolu kare (22×22px), shift adı tooltip
- `absent` → kırmızı X
- `on_leave` → mor `İ`, izin tipi tooltip (yıllık/hastalık/acil)
- `overtime` → accent `M` (mesai)
- `scheduled` → gri nokta (planlandı ama statü güncellenmedi)
- `sunday` → çok soluk sarı boş
- `no_record` → tamamen boş

Veri kaynağı: `GET /shifts/puantaj/:staffId/days` — personel seçilince lazy load.
İlk render: tüm personelin aylık listesi (enhanced puantaj endpoint'ten). Takvim için gün verisi ilk açılışta tüm personel için toplu yüklenebilir veya lazy. **Lazy tercih edilir** — önce liste görünür, takvim moduna geçince yükle.

Header: 1–31 gün numaraları, Pazar güngünleri `var(--accent)` rengi.
Sol kolon: personel adı sticky, avatar + dept badge.

### 3.4 Mod 3 — ÖZET

Her departman için kart:
```
┌─ TEMİZLİK ──────────────── 8 kişi ─┐
│  Çalışılan: 160 gün  │  Devamsız: 3 │
│  Mesai: 24s          │  İzin: 14 gün│
│  Brüt: 89.200 ₺      │  Net: 66.100 ₺│
│  İşveren Maliyeti: 105.800 ₺         │
└──────────────────────────────────────┘
```
Veriler: `filtered` array'den `useMemo` ile dept gruplandırması.

### 3.5 Bordro Detay BottomSheet

Satıra tıklanınca açılır. 3 sekme:

**HESAP PUSULASI:**
- Ücret bileşenleri tablosu (temel + izin + mesai = brüt)
- Kesintiler tablosu (SGK + işsizlik + GV + DV = toplam kesinti)
- NET ELE GEÇEN kutusu (büyük, yeşil)
- İşveren maliyeti bölümü (ayrı blok)

**GÜN DÖKÜMÜ:**
- `GET /shifts/puantaj/:staffId/days` çağrılır (lazy, sekmeye geçince)
- Mini takvim grid: 7 sütun (Pzt–Paz), satırlar haftalar
- Her gün: durum rengi + shift adı tooltip

**YIL BAZLARI:**
- Kümülatif brüt (Ocak–bu ay)
- Hangi GV dilimine girdiği (görsel dilim bar)
- Kalan yıllık izin günü (leave_balance tablosundan)
- YTD vergi toplamı

### 3.6 Bordro Fişi (Print)

BottomSheet'te "🖨 Yazdır" butonu. `window.print()` tetikler.

`@media print` CSS: sidebar, nav, header, backdrop gizlenir. Sadece `.bordro-slip` görünür.

Fiş içeriği:
```
[Şirket Başlığı]        ÜCRET BORDROSU       Dönem: MART 2024
────────────────────────────────────────────────────────────
Ad Soyad: AHMET YILMAZ          Sicil: #42
Departman: TEMİZLİK             TC: 123*****890
────────────────────────────────────────────────────────────
DEVAM: İş Günü 21 │ Çalıştı 20 │ İzin 2 │ Devamsız 0
────────────────────────────────────────────────────────────
ÜCRET BİLEŞENLERİ
  Temel Ücret (20 × 450₺)          9.000,00 ₺
  Ücretli İzin (2 × 450₺)            900,00 ₺
  Fazla Mesai (4s × 1.5)           1.012,50 ₺
  BRÜT TOPLAM                     10.912,50 ₺
────────────────────────────────────────────────────────────
KESİNTİLER
  SGK İşçi (%14)                  -1.527,75 ₺
  İşsizlik İşçi (%1)                -109,13 ₺
  Gelir Vergisi (%15 dilimi)       -1.388,15 ₺
  Damga Vergisi (%0.759)              -82,83 ₺
  TOPLAM KESİNTİ                  -3.107,86 ₺
────────────────────────────────────────────────────────────
NET ELE GEÇEN:                    7.804,64 ₺
────────────────────────────────────────────────────────────
İşveren SGK (%20.5): 2.237₺   │ İşveren İşsizlik: 218₺
TOPLAM İŞVEREN MALİYETİ:        13.367,50 ₺
────────────────────────────────────────────────────────────
İmza: _______________           Tarih: ___/___/2024
```

- TC No maskelenir: `123*****890`
- Toplu print: tüm departman personeli için tek `window.print()`, CSS `page-break-after: always`

### 3.7 Etkilenen dosyalar (B2)

| Dosya | Değişiklik |
|---|---|
| `frontend/src/modules/shifts/ShiftsPage.jsx` | `PuantajTab` komple yeniden yaz |
| `frontend/src/index.css` | `@media print` kuralları + `.bordro-slip` stilleri |

---

## 4. Kısıtlar & Kararlar

- Tailwind kullanılmaz — tüm stiller CSS variables
- `SidePanel` yerine mevcut `BottomSheet` bileşeni kullanılır
- Vergi dilimleri hardcode (2024) — yorum satırıyla "her yıl güncelle" notu
- AGI (Asgari Geçim İndirimi) **dahil edilmez** — medeni durum/çocuk sayısı verisi yok
- Günlük oran: `maaş / 30` (iş kanununa göre standart)
- Kümülatif vergi: `shift_schedule` + `overtime_records` üzerinden Ocak–önceki ay brüt sorgusu. Önceki aylarda shift verisi yoksa kümülatif vergi = 0 (undercount, kabul edilebilir)
- İşveren maliyet kolonu varsayılan gizli (maaş gizliliği politikası)

---

## 5. Uygulama Sırası

1. **B1 önce**: Backend hesap motoru + testler ✅
2. **B2 sonra**: Frontend B1 üzerine inşa edilir

Her alt proje kendi commit serisi ile biter.
