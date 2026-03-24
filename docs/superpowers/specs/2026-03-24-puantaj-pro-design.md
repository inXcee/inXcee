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

**Gelir vergisi dilimleri (2024 — her yıl güncellenmeli):**
> ⚠️ Bu rakamlar 2024 yılına aittir. Production'a almadan önce güncel yılın GİB tebliğiyle doğrula.

```
0 – 110.000 TL        → %15
110.001 – 230.000 TL  → %20
230.001 – 870.000 TL  → %27
870.001 – 3.000.000 TL → %35
3.000.001+ TL         → %40
```

Vergi dilimleri `service.js` içinde `TAX_BRACKETS` sabit dizisi olarak tutulur:
```js
// TODO: Her yıl GİB tebliğine göre güncelle
const TAX_BRACKETS = [
  { limit: 110_000, rate: 0.15 },
  { limit: 230_000, rate: 0.20 },
  { limit: 870_000, rate: 0.27 },
  { limit: 3_000_000, rate: 0.35 },
  { limit: Infinity, rate: 0.40 },
];
```

**SGK ve işsizlik:**
| Kalem | İşçi | İşveren |
|---|---|---|
| SGK | %14 | %20.5 |
| İşsizlik sigortası | %1 | %2 |

**Damga vergisi:** Brüt × %0.759 (2024 — Damga Vergisi Kanunu Ek-1 Tablo)

**Kümülatif vergi hesabı:**

`calcTax(ytdGross)` pure function — kümülatif brüt üzerinden toplam vergiyi hesaplar:
```js
function calcTax(ytdGross) {
  let tax = 0, prev = 0;
  for (const { limit, rate } of TAX_BRACKETS) {
    if (ytdGross <= prev) break;
    const slice = Math.min(ytdGross, limit) - prev;
    tax += slice * rate;
    prev = limit;
  }
  return Math.round(tax * 100) / 100;
}
```

YTD brüt sorgusu (SQL, `service.js` içinde helper olarak):
```sql
SELECT COALESCE(
  SUM(
    (s.salary / 30.0) * COUNT(DISTINCT CASE WHEN ss.status IN ('worked','on_leave') THEN ss.work_date END)
    + COALESCE((SELECT SUM(hours * (s2.salary / 30.0 / 8) * 1.5)
                FROM overtime_records o
                JOIN staff s2 ON s2.id = o.staff_id
                WHERE o.staff_id = ? AND o.work_date >= ? AND o.work_date < ?), 0)
  ), 0
)
FROM staff s
LEFT JOIN shift_schedule ss ON ss.staff_id = s.id
  AND ss.work_date >= :jan_01   -- YYYY-01-01
  AND ss.work_date < :month_01  -- YYYY-MM-01 (bu ayın başı dahil değil)
WHERE s.id = ?
```

Pratik: `service.js`'te `getYtdGross(staffId, year, month)` adlı sync helper yazılır. Ocak ayı için `month=1` gelirse `ytdGross=0`, kümülatif vergi=0 döner (doğru).

**Mesai ücreti:** `(maaş / 30 / 8) × 1.5 × saat`

**İzinli günlerde ücret (ücretli izin türleri):**
- `annual` (yıllık izin) → tam günlük ücret ödenir (`leave_pay` içinde sayılır)
- `emergency` (acil/mazeret) → tam günlük ücret ödenir
- `sick`, `maternity`, `paternity`, `marriage`, `bereavement` → işveren tarafından ödenmez (`leave_pay = 0` bu türler için). İşçi SGK/sigorta kapsamından alır.
- **`leave_pay` = (annual_days + emergency_days) × daily_rate**

**İş günleri hesabı (`work_days_in_month`):**
Ay içindeki Pazar günü olmayan takvim günü sayısı. Uygulama kodu:
```js
function workDaysInMonth(year, month) {
  const days = new Date(year, month, 0).getDate(); // ay sonu günü
  let count = 0;
  for (let d = 1; d <= days; d++) {
    if (new Date(year, month - 1, d).getDay() !== 0) count++;
  }
  return count;
}
```

### 2.2 Enhanced `GET /shifts/puantaj` (mevcut endpoint genişletilir)

**Input validasyonu:** `month` query param zorunlu, format `YYYY-MM`. Eksik veya hatalı formatta `400 Bad Request: { error: "month parametresi YYYY-MM formatında gereklidir" }`.

Mevcut alanlar korunur. Eklenen alanlar:

```js
{
  // İzin türü dökümü (leave_requests tablosundan, status='approved')
  // 'other' = sick + maternity + paternity + marriage + bereavement
  annual_leave_days: 2,
  sick_leave_days: 1,
  emergency_leave_days: 0,
  other_leave_days: 0,    // maternity + paternity + marriage + bereavement toplamı

  // Ücret bileşenleri
  daily_rate: 450,        // maaş / 30
  base_pay: 9000,         // worked_days × daily_rate
  overtime_pay: 1012,     // Σ(hours × daily_rate / 8 × 1.5)
  leave_pay: 900,         // (annual_days + emergency_days) × daily_rate
  gross: 10912,           // base_pay + overtime_pay + leave_pay

  // Kesintiler
  ssi_worker: 1527,         // brüt × %14
  unemployment_worker: 109, // brüt × %1
  income_tax: 1388,         // calcTax(ytdGross + gross) - calcTax(ytdGross)
  stamp_tax: 82,            // brüt × %0.759
  total_deductions: 3106,
  net: 7806,

  // İşveren maliyeti
  ssi_employer: 2237,         // brüt × %20.5
  unemployment_employer: 218, // brüt × %2
  employer_total_cost: 13367, // gross + ssi_employer + unemployment_employer

  // Devam
  attend_rate: 95,          // (worked_days / work_days_in_month) × 100
  work_days_in_month: 26,   // o ay Pazar olmayan takvim günleri (workDaysInMonth fonksiyonu)
  ytd_gross: 45000,         // Ocak'tan BU AY dahil kümülatif brüt (getYtdGross + gross)
  ytd_tax: 6750,            // calcTax(ytd_gross)
}
```

**İzin günleri kaynağı:** `leave_requests` tablosundan `staff_id = ?` AND `status = 'approved'` AND `start_date <= ay_sonu` AND `end_date >= ay_basi` koşuluyla çekilir. Ay içine düşen kesişim günleri hesaplanır.

**React Query key:** `['puantaj', month, deptId]`

### 2.3 Yeni `GET /shifts/puantaj/:staffId/days?month=YYYY-MM`

**Kayıt sırası önemli:** Bu route `/puantaj/export/csv`'den **SONRA** `routes.js`'e eklenmeli — aksi halde `export` kelimesi `staffId` parametresi olarak eşleşir.

**Input validasyonu:** `month` zorunlu (`YYYY-MM`), `staffId` sayısal olmalı. Hatalıysa `400`.

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

**Veri kaynağı:**
```sql
SELECT ss.work_date, ss.status,
       sd.name AS shift_name, sd.start_hour, sd.end_hour,
       lr.leave_type
FROM shift_schedule ss
LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
LEFT JOIN leave_requests lr ON lr.staff_id = ss.staff_id
  AND lr.status = 'approved'
  AND ss.work_date BETWEEN lr.start_date AND lr.end_date
WHERE ss.staff_id = ? AND ss.work_date BETWEEN ? AND ?
```

Pazar günleri `{ date, day_of_week: 0, status: 'sunday' }` ile doldurulur (uygulama kodu içinde, DB'den değil). `shift_schedule`'da kaydı olmayan günler `no_record`. Mesai kaydı varsa `overtime_hours` eklenir (`overtime_records` LEFT JOIN).

### 2.4 Yeni `GET /shifts/puantaj/export/csv?month=YYYY-MM&dept_id=X`

**Kayıt sırası:** Bu route `routes.js`'te `/puantaj/:staffId/days`'ten **ÖNCE** tanımlanmalı.

**Input validasyonu:** `month` zorunlu. Eksikse `400`.

CSV formatı (UTF-8 BOM `\uFEFF`, Excel uyumlu):
```
TC No,Ad Soyad,Departman,İş Günü,Çalıştı,İzin(Yıllık),İzin(Acil),İzin(Hastalık),İzin(Diğer),Devamsız,Mesai(s),Brüt,SGK İşçi,İşsizlik İşçi,Gelir Vergisi,Damga Vergisi,Net,İşveren SGK,İşveren İşsizlik,Toplam Maliyet
```

TC No yoksa `—` yaz (null staff.tc_no için).

Response header: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="puantaj-YYYY-MM.csv"`

### 2.5 Etkilenen dosyalar (B1)

| Dosya | Değişiklik |
|---|---|
| `backend/src/modules/shifts/queries.js` | `getPuantaj` genişlet (izin join ekle), `getStaffDayBreakdown` yeni, `getPuantajCsv` yeni |
| `backend/src/modules/shifts/service.js` | `puantajService` güncelle, `calcTax` + `workDaysInMonth` + `getYtdGross` pure functions, `staffDayBreakdownService` yeni, `puantajCsvService` yeni |
| `backend/src/modules/shifts/routes.js` | 2 yeni endpoint ekle — CSV önce, `:staffId/days` sonra |
| `backend/src/modules/shifts/shifts.test.js` | `calcTax` unit testleri (dilim sınırları, kümülatif), `workDaysInMonth` testleri, yeni endpoint testleri (normal case + eksik month → 400 + geçersiz staffId → 400 + boş data → boş array) |

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

Header: 1–31 gün numaraları, Pazar günleri `var(--accent)` rengi.
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
Veriler: `filtered` array'den `useMemo` ile dept gruplandırması (ek API call yok).

### 3.5 Bordro Detay BottomSheet

`BottomSheet` bileşeni: ShiftsPage.jsx'te önceki sprintte (staff-detail-panel) implemente edildi — `createPortal(content, document.body)` tabanlı, `position: fixed; bottom: 0; z-index: 1055`. Bu bileşen **yeniden kullanılır**, değiştirilmez.

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
- Veri kaynağı: ana puantaj listesindeki `ytd_gross` ve `ytd_tax` alanları (ek API çağrısı yok)
- Kümülatif brüt (Ocak–bu ay)
- Hangi GV dilimine girdiği (görsel dilim bar)
- Kalan yıllık izin günü (leave_balance tablosundan — ayrı `/shifts/staff/:id/detail` çağrısı içinde zaten mevcut)
- YTD vergi toplamı

### 3.6 Bordro Fişi (Print)

BottomSheet'te "🖨 Yazdır" butonu. `window.print()` tetikler.

`@media print` CSS: sidebar, nav, header, backdrop gizlenir. Sadece `.bordro-slip` görünür.

**Şirket başlığı:** Bileşen içinde `const COMPANY_NAME = 'YYS Kampüs'` sabiti olarak tanımlanır. TODO yorumu: "Şirket adını burada güncelle."

Fiş içeriği:
```
[COMPANY_NAME]          ÜCRET BORDROSU       Dönem: MART 2024
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

- TC No maskelenir: `123*****890` — ilk 3 ve son 3 hane görünür
- Toplu print: tüm departman personeli için tek `window.print()`, CSS `page-break-after: always`

### 3.7 Etkilenen dosyalar (B2)

| Dosya | Değişiklik |
|---|---|
| `frontend/src/modules/shifts/ShiftsPage.jsx` | `PuantajTab` komple yeniden yaz |
| `frontend/src/index.css` | `@media print` kuralları + `.bordro-slip` stilleri |

---

## 4. Kısıtlar & Kararlar

- Tailwind kullanılmaz — tüm stiller CSS variables
- `BottomSheet` bileşeni mevcut (ShiftsPage.jsx'teki) — yeniden kullanılır
- Vergi dilimleri hardcode (2024) — yorum satırıyla "her yıl güncelle" notu
- AGI (Asgari Geçim İndirimi) **dahil edilmez** — medeni durum/çocuk sayısı verisi yok
- Günlük oran: `maaş / 30` (iş kanununa göre standart)
- Kümülatif vergi: `shift_schedule` + `overtime_records` üzerinden Ocak–önceki ay brüt sorgusu. Önceki aylarda shift verisi yoksa kümülatif vergi = 0 (undercount, kabul edilebilir)
- İşveren maliyet kolonu varsayılan gizli (maaş gizliliği politikası)
- Ücretli izin: `annual` + `emergency` → tam ödeme. Diğer türler (`sick`, `maternity`, vb.) → `leave_pay = 0`
- `work_days_in_month`: ay içindeki Pazar olmayan takvim günleri (`workDaysInMonth` fonksiyonu)
- Route kayıt sırası: CSV route, `:staffId` parametreli route'dan önce gelir

---

## 5. Uygulama Sırası

1. **B1 önce**: Backend hesap motoru + testler ✅
2. **B2 sonra**: Frontend B1 üzerine inşa edilir

Her alt proje kendi commit serisi ile biter.
