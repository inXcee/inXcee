# Dashboard Modernizasyon Tasarımı

**Tarih:** 2026-05-19
**Durum:** Onay bekliyor
**Kapsam:** Yönetici dashboard (campus_manager, shift_supervisor) — `frontend/src/modules/dashboard/`

## Amaç

Mevcut endüstriyel/teknik monitör estetiğini, daha yumuşak ve çağdaş (Linear/Vercel benzeri) bir dile taşımak; aynı zamanda yöneticiye gerçek değer katacak 4 yeni widget eklemek: bugünün nabzı, yaklaşan etkinlikler, sağlık skoru, anomali uyarıları.

## Karar Özeti

| Karar | Seçim |
|-------|-------|
| Yön | Tamamen modernleştirme |
| Renk paleti | Kategori bazlı gradient şeritleri |
| Yeni içerik | Bugünün nabzı, sağlık skoru + anomali, yaklaşan etkinlikler |
| Kapsam | Sadece yönetici dashboard (`technical` + `housekeeper` görünümleri dokunulmaz) |
| Layout | 12-grid bento gösterge paneli |
| Veri stratejisi | Hibrit — basit içerik frontend-derived, karmaşık (sağlık skoru, anomali) backend |
| Uygulama yaklaşımı | Katmanlı modernleştirme (3 faz) |

## Görsel Dil

### Kategori token'ları (`index.css`'e eklenir)

```css
--cat-occupancy: linear-gradient(135deg, #3b8cf0 0%, #1abc9c 100%);
--cat-maintenance: linear-gradient(135deg, #e74c3c 0%, #e05c2a 100%);
--cat-housekeeping: linear-gradient(135deg, #27c96a 0%, #1abc9c 100%);
--cat-finance: linear-gradient(135deg, #9b59b6 0%, #3b8cf0 100%);
--cat-personnel: linear-gradient(135deg, #f0a500 0%, #e05c2a 100%);
--cat-health: linear-gradient(135deg, #1abc9c 0%, #27c96a 100%);
--cat-alert: linear-gradient(135deg, #e74c3c 0%, #f0a500 100%);
```

Mevcut temel renk değişkenleri (--accent, --green, --red...) bozulmaz, sadece kategori token'ları eklenir.

### Kart anatomisi (yeni)

- Üst 3px gradient şerit + 8px soft-glow halo (kategori rengiyle)
- Surface: `rgba(15,19,25,.7)` + `backdrop-filter: blur(12px)` (glass)
- Border: 1px var(--border) + iç hafif glow
- Hover: `translateY(-3px)` + kategori-glow vurgu
- KPI değer fontu Bebas Neue 44px (mevcut 40 → 44)
- Mono mikro-etiketler 10px sabit

### Yeni utility class'lar

| Class | İş |
|-------|-----|
| `.card-glass` | Backdrop-blur + surface alpha + soft border |
| `.cat-stripe-{kategori}` | 3px gradient şerit + glow halo |
| `.fade-up-stagger` | Stagger'lı fade-up (60ms gecikme adımı) |
| `.bento-grid` | 12-kolon grid container, gap 16px |
| `.bento-cell` | Hücre, equal-height stretch |
| `.bento-span-{1-12}` | Kolon span'i |

### Animasyon detayları

- **Stagger fade-up:** Kartlar 8px aşağıdan 200ms ease-out, her kart 60ms geç başlar.
- **Hover glow:** Kategori rengiyle 16px soft-glow.
- **Sayı transition:** Değer değiştiğinde 300ms CSS transition.
- **Live dot pulse:** Opacity pulse animasyonu.

### Tipografi ritmi

- H1 başlık: 32px (mevcut 28), letter-spacing 6px
- Panel başlığı: 16px (mevcut 15)
- KPI değeri: 44px (mevcut 40)
- Mono mikro-etiketler: 10px

## 12-Grid Bento Layout

### Container

Tek `bento-grid` container'ı tüm dashboard içeriğini sarar. Header, alert banner'lar ve management widgets üstte tam genişlikte (`grid-column: 1 / -1`) durur.

### Yerleşim (desktop ≥1400px)

```
HEADER (span 12)
MANAGEMENT WIDGETS (span 12, mevcut yatay flex korunur)
ALERT BANNER'LAR (span 12, varsa)
─────────────────────────────────────────────
KPI 4'lü (span 8, 2x2 internal)    │ SAĞLIK SKORU (span 4)
YATAK DOLULUK (span 8)             │ BUGÜNÜN NABZI (span 4)
TREND GRAFİKLERİ (span 8, 2x2)     │ YAKLAŞAN ETKİNLİKLER (span 4)
─────────────────────────────────────────────
BLOK DURUMU HEATMAP (span 12)
ANOMALİ UYARILARI (span 12, sadece anomali varsa)
AKTİF ARIZALAR (span 7)            │ 14 GÜN PROJEKSİYON (span 5)
DENETİM KAYDI (span 12, sadece campus_manager)
```

### Breakpoints

| Genişlik | Davranış |
|----------|----------|
| ≥1400px | 12 kolon, sağ panel görünür |
| 1024–1399 | 12 kolon, sıkışık (sağ panel daralır) |
| 768–1023 | 6 kolon (tablet — sağ panel altta açılır) |
| <768 | 1 kolon stack (mobil) |

### Kritik notlar

- Sağ panel widget'ları 1024px altında ana akışın sonuna stack'lenir.
- Tüm hücrelerin equal-height olması için `align-items: stretch`.
- Panel içerikleri kendi `overflow-y: auto` yönetir.
- Mevcut alert banner'lar grid'in dışında full-width kalır.

## Yeni Widget'lar

### 1. TodaysPulse — Bugünün Nabız Paneli

**Konum:** Sağ panel, span 4. **Veri:** Frontend-derived.

**İçerik:** Bugün giriş/çıkış sayısı, bugün açılan arıza, tamamlanan temizlik, aktif ziyaretçi.

**Veri kaynakları:**
- `/dashboard/trends?days=2` → son gün `checkins.in` / `checkins.out`
- `/maintenance/requests?status=open` → client filter (bugün açılanlar)
- `/housekeeping/tasks` → client filter (bugün tamamlananlar)
- `/visitors/stats.active` → mevcut

**Görsel:** Her satır kategori ikonu + sayı + etiket + mini-spark (son 7 gün). Satıra tıklama ilgili modüle navigasyon.

### 2. UpcomingEvents — Yaklaşan Etkinlikler

**Konum:** Sağ panel, span 4. **Veri:** Frontend-derived.

**İçerik (öncelikli sıralı liste, max 5):**
- Sonraki planlı tatbikat → `/drills/stats.upcoming`
- 7 gün içinde biten firma sözleşmeleri → `/companies/expiring?days=7`
- SLA deadline'ı 7 gün içinde olan açık arızalar → `/maintenance/requests?status=open` client filter

**Görsel:** Timeline list — sol tarih chip (kategori rengi), sağda başlık + alt metin. "Tümü →" linki.

### 3. HealthScoreWidget — Sistem Sağlık Skoru

**Konum:** Sağ panel, span 4. **Veri:** Yeni endpoint `/dashboard/health`.

**Skor hesaplama:**

```
score = 0.30 × doluluk_skor + 0.25 × sla_skor +
        0.20 × temizlik_skor + 0.15 × arıza_skor +
        0.10 × disiplin_skor
```

Bileşenler:
- `doluluk_skor` = `100 - |85 - actual%|` (hedef %85)
- `sla_skor` = son 30 gün SLA uyum yüzdesi
- `temizlik_skor` = son 7 gün tamamlanma yüzdesi
- `arıza_skor` = açık arıza eşik tabanlı (0 açık = 100, 10+ = 0, doğrusal)
- `disiplin_skor` = 100 - (aktif kara liste × 5), min 0

**Görsel:** Yarım daire SVG gauge + ortada büyük skor + delta (son 7 gün ort. ile karşılaştırma). Altta 5 mini-bar bileşeni.

**Renk:** ≥80 yeşil, 60-79 amber, <60 kırmızı.

### 4. AnomalyAlerts — Anomali Uyarıları

**Konum:** Grid genelinde span 12 (sadece anomali varsa renderlanır). **Veri:** Yeni endpoint `/dashboard/anomalies`.

**Tespit kuralları (v1, basit eşik tabanlı):**

| Kural | Tetik |
|-------|-------|
| R1: Blok arıza yoğunluğu | Bir blokta son 7 gün ortalamasının 2 katı + bugün ≥3 yeni arıza |
| R2: Ani doluluk düşüşü | Son 24 saatte ≥%15 düşüş |
| R3: Temizlik gecikmesi | Bugün ≥3 saat bekleyen temizlik görevi |
| R4: Uzun karantina | Karantina odası 48+ saattir aktif |

**Görsel:** Alert-style satırlar, kategori-alert gradient stripi, sağda "İncele →" butonu. 0 anomali = panel renderlanmaz.

## Backend Değişiklikleri

### Yeni endpoint: `GET /dashboard/health`

- Yetki: `campus_manager`, `shift_supervisor`
- Cache: 60 saniye
- `queries.js → getHealthScore()` fonksiyonu

Response:
```json
{
  "score": 82,
  "delta": "+3",
  "breakdown": [
    { "label": "DOLULUK", "value": 95, "weight": 0.30 },
    { "label": "SLA", "value": 78, "weight": 0.25 },
    { "label": "TEMİZLİK", "value": 85, "weight": 0.20 },
    { "label": "ARIZA", "value": 70, "weight": 0.15 },
    { "label": "DİSİPLİN", "value": 88, "weight": 0.10 }
  ],
  "color": "green"
}
```

### Yeni endpoint: `GET /dashboard/anomalies`

- Yetki: `campus_manager`, `shift_supervisor`
- Cache: 120 saniye
- `queries.js → getAnomalies()` fonksiyonu, 4 kuralı çalıştırır, tetiklenenleri döner

Response:
```json
{
  "anomalies": [
    {
      "id": "high-maint-m2",
      "severity": "warning",
      "title": "M2 bloğunda arıza yoğunluğu yüksek",
      "detail": "Son 7 gün ortalaması 1.2/gün, bugün 4 yeni kayıt",
      "action_path": "/maintenance?block=M2"
    }
  ]
}
```

## Faz Dağılımı

### Faz 1 — Görsel Dil + Bento Layout

**Dosyalar:**
- `frontend/src/index.css` — yeni utility class'lar (bento-grid, cat-stripe-*, card-glass, fade-up-stagger)
- `frontend/src/modules/dashboard/DashboardPage.jsx` — layout bento yapısına çevrilir
- `frontend/src/modules/dashboard/KPICard.jsx` — 3px glow stripe + 44px değer + kategori prop
- `frontend/src/modules/dashboard/TrendCard.jsx` — gradient stripe + glass arka plan
- `frontend/src/modules/dashboard/HeatMap.jsx` — kategori şeritleri (zaten getStyle var, gradient güncelleme)
- `BedOccupancyPanel` (DashboardPage içi) — kategori şeritleri

**Test:** Mevcut backend testleri (`dashboard.test.js`) değişmez, hepsi geçmeli. Frontend smoke: dashboard açılır, KPI'lar görünür, hover çalışır.

### Faz 2 — Frontend Widget'lar

**Yeni dosyalar:**
- `frontend/src/modules/dashboard/TodaysPulse.jsx`
- `frontend/src/modules/dashboard/UpcomingEvents.jsx`

**Düzenlenen:**
- `DashboardPage.jsx` — sağ panel cell'lerine yeni widget'lar eklenir

**Test:** Yeni endpoint yok, backend test gerekmez. Manuel: widget'lar render olur, mevcut endpoint'lerden veri çeker, boş durum güzel görünür.

### Faz 3 — Backend Widget'lar

**Yeni dosyalar:**
- `frontend/src/modules/dashboard/HealthScoreWidget.jsx`
- `frontend/src/modules/dashboard/AnomalyAlerts.jsx`

**Düzenlenen:**
- `backend/src/modules/dashboard/queries.js` — `getHealthScore`, `getAnomalies` fonksiyonları
- `backend/src/modules/dashboard/routes.js` — 2 yeni route
- `backend/src/modules/dashboard/dashboard.test.js` — yeni testler
- `DashboardPage.jsx` — widget'lar grid'e yerleştirilir

**Test:** `npx vitest run src/modules/dashboard/dashboard.test.js` geçmeli. En az 3 yeni test:
- `getHealthScore` 0-100 arası sayı döndürür ve breakdown 5 eleman içerir
- `getAnomalies` boş DB'de boş array döner
- R1 (blok arıza yoğunluğu) kuralı doğru tetiklenir/tetiklenmez

## Hata Yönetimi (Tüm Widget'lar İçin Ortak)

- **Loading:** İskelet kart, kategori stripi belli, içerik bulanık placeholder.
- **Empty:** "Veri yok" mesajı, kategori-soluk ikon, alt metin (örn. "Bugün hareket yok").
- **Error:** Sessiz fail (mevcut `.catch(() => null)` pattern'i korunur) + console.warn. Widget kendi yüksekliğinde kalır, hata mesajı küçük amber chip.

## Erişilebilirlik

- Tüm gradient şeritler dekoratif (semantik renk değil); asıl bilgi metin + ikon.
- KPI sayıları `aria-label`'lı.
- Renk-kör güvenli: stripe + icon kombinasyonu, sadece renk değil.

## Test Stratejisi

- **Faz 1:** Görsel değişiklik. Mevcut testler regresyon kontrolü, yeni test yok.
- **Faz 2:** Smoke + manuel. Veri durum varyasyonları (0, az, çok) elle kontrol.
- **Faz 3:** Backend unit testleri (`:memory:` DB ile). Skor hesaplama, anomali tetiklenmesi.

## Riskler ve Hafifletme

| Risk | Hafifletme |
|------|-----------|
| `backdrop-filter` Safari'de davranış farkı | Fallback `background-color` opaklığı |
| Bento grid mobilde patlar | 768px altında 1 kolon stack zorunlu test |
| Health score hesaplama yavaş | 60sn cache + tek query'de toplama |
| Anomali yanlış pozitif | Eşikler conservative başlar, gerekirse ileride ayarlanır |

## Faz Kabul Kriterleri

| Faz | Kabul |
|-----|-------|
| 1 | Tüm mevcut testler geçer; dashboard görsel olarak modern; mobilde stack'lenir; mevcut widget'lar çalışır |
| 2 | TodaysPulse + UpcomingEvents render olur; boş ve dolu durumlar güzel görünür; tıklama navigasyonu çalışır |
| 3 | `/dashboard/health` ve `/dashboard/anomalies` 200 döner; backend testler geçer; widget'lar gerçek veriyle çalışır; anomali yokken panel gizlenir |
