# Dashboard Global Tarih Aralığı Filtresi — Tasarım

**Tarih**: 2026-05-19
**Modül**: `dashboard`
**Kapsam**: Tek faz, küçük-orta büyüklük (yalnızca frontend, backend dokunulmaz)

## Amaç

Dashboard'da kullanıcının tarih penceresini tek noktadan seçebileceği, paylaşılabilir (URL tabanlı) global bir filtre. Filtre yalnızca tarih aralığına anlamlı yanıt veren widget'ları etkiler: **TrendChartsSection** ve **AuditLogPanel**.

## Kapsam Dışı

- KPI, HeatMap, BedOccupancy, TodaysPulse, UpcomingEvents, AnomalyAlerts, HealthScore, Projection bileşenleri **dokunulmaz**. Bunlar anlık/sabit pencere bileşenleridir.
- Backend (`backend/src/modules/dashboard/`) **dokunulmaz**: `getTrends(metrics, days)` ve `getAuditLog(limit, {date_from, date_to, …})` zaten ihtiyacı karşılar.
- Geçmiş tarihli "Mart ayı doluluğu" gibi sliding-window olmayan görüntüler şu sürümde desteklenmez (özel aralık yine bugüne kadar sayıyı yansıtır).

## Kararlar (özet)

| Konu | Karar |
|------|-------|
| Etkilenen widget'lar | Yalnızca TrendChartsSection + AuditLogPanel |
| Preset'ler | 7g / 30g / 90g + Özel aralık |
| Kalıcılık | URL query params (`?range=…&from=…&to=…`) |
| Trends API | `days` parametresini koru — özel aralıkta gün sayısına çevir |
| Varsayılan | 30 gün |

## Mimari

### URL şeması

```
?range=7
?range=30
?range=90
?range=custom&from=2026-04-01&to=2026-04-30
```

- Param yok ya da geçersiz → 30 gün varsayılan
- `range=custom` ise `from` ve `to` her ikisi de zorunlu (YYYY-MM-DD). Biri eksikse fallback 30g.
- `to < from` ise fallback 30g.

### `useDateRange` hook'u (yeni)

`frontend/src/modules/dashboard/useDateRange.js`

```js
import { useSearchParams } from 'react-router-dom'

const PRESETS = { '7': 'SON 7 GÜN', '30': 'SON 30 GÜN', '90': 'SON 90 GÜN' }
const ISO = (d) => new Date(d).toISOString().slice(0, 10)

export function useDateRange() {
  const [params, setParams] = useSearchParams()
  const rawRange = params.get('range') || '30'
  const rawFrom = params.get('from')
  const rawTo = params.get('to')

  const isCustom = rawRange === 'custom' && rawFrom && rawTo && rawFrom <= rawTo
  let range, days, from, to

  if (isCustom) {
    range = 'custom'
    from = rawFrom
    to = rawTo
    days = Math.max(1, Math.min(90, Math.ceil((new Date(to) - new Date(from)) / 86400000) + 1))
  } else {
    range = PRESETS[rawRange] ? rawRange : '30'
    days = Number(range)
    to = ISO(Date.now())
    from = ISO(Date.now() - days * 86400000)
  }

  const label = isCustom ? `${from} → ${to}` : PRESETS[range]

  const setRange = (r) => setParams((p) => {
    p.set('range', String(r))
    p.delete('from')
    p.delete('to')
    return p
  }, { replace: true })

  const setCustom = (f, t) => setParams((p) => {
    p.set('range', 'custom')
    p.set('from', f)
    p.set('to', t)
    return p
  }, { replace: true })

  return { range, days, from, to, isCustom, label, setRange, setCustom }
}
```

**Dönen değerler**:
- `range`: `'7' | '30' | '90' | 'custom'`
- `days`: 1-90 arası tamsayı (Trends için)
- `from`, `to`: YYYY-MM-DD ISO tarih (Audit için)
- `isCustom`: boolean
- `label`: kullanıcıya gösterilecek metin
- `setRange(r)`: preset seçer, from/to temizler
- `setCustom(f, t)`: özel aralık ayarlar

### `DateRangeFilter` bileşeni (yeni)

`frontend/src/modules/dashboard/DateRangeFilter.jsx`

Görsel düzen (dashboard header'ında, `ExportButtons`'ın yanında):

```
[7g] [30g●] [90g] [Özel ▼]
```

- 3 chip butonu: preset (7/30/90), aktif olan `--accent` arkaplanlı
- 4. buton "Özel": tıklayınca açılır küçük panel — iki `<input type="date">` + "UYGULA" + "İPTAL"
- Açılır panelin pozisyonu: butonun altında, `position: absolute`
- Custom aralık aktifken 4. butonun label'ı `"… → …"` formatında gösterir

Bileşen `useDateRange()` hook'unu çağırır; dışarıdan prop almaz.

### `TrendChartsSection` değişiklikleri

`frontend/src/modules/dashboard/TrendChartsSection.jsx`

- Local `useState(30)` ve `DAYS_OPTIONS` chip'leri **kaldırılır** (artık global)
- Yeni prop: `days` (parent'tan iner)
- Header sağındaki günler toggle'ı kaldırılır; yerine her zaman `"SON {days} GÜN"` formatında readonly label gösterilir
- `queryKey: ['trends', days]` — `days` prop'una bağımlı

**Önemli — sliding window davranışı**: Trends grafiği daima "bugünden geriye N gün"dür. Custom aralık (örn. 1-30 Nisan) seçilse bile Trends bunu `days=30` olarak yorumlar ve "son 30 gün"ü gösterir; tarihler 1-30 Nisan **değildir**. Bu davranış kullanıcıya `"SON N GÜN"` label'ı ile iletilir. Audit ise gerçek tarih aralığını kullanır. Bu uyumsuzluk **kabul edilmiş tasarım kararıdır** (Approach A, backend dokunulmaz). Custom aralık gerçekten geçmiş pencere göstermek istenirse Approach B'ye (backend `from`/`to`) yükseltilebilir.

### `DashboardPage` değişiklikleri

`frontend/src/modules/dashboard/DashboardPage.jsx`

```jsx
const { days, from, to, label } = useDateRange()
// ...
<TrendChartsSection days={days} label={label} />
// ...
<AuditLogPanel globalFrom={from} globalTo={to} />
```

Header'a `<DateRangeFilter />` yerleştirilir.

### `AuditLogPanel` değişiklikleri

`DashboardPage` içindeki `AuditLogPanel` fonksiyonu:
- Lokal `auditDateFrom`/`auditDateTo` state'leri ve ilgili `<input type="date">` alanları **kaldırılır**
- Bunun yerine `props.globalFrom`/`props.globalTo` kullanılır
- Lokal `auditSearch`, `auditModule`, `auditLimit` kalır
- Query key'e `globalFrom`, `globalTo` eklenir; `auditParams` set edilirken bunlar geçirilir

## Veri Akışı

```
URL ?range=7
   ↓
useDateRange() hook  ──→  { days: 7, from: '2026-05-12', to: '2026-05-19' }
   ↓                                    ↓
DateRangeFilter                  DashboardPage props
   ↓                                    ↓
URL güncelleme                  TrendChartsSection (days)
                                AuditLogPanel (from, to)
                                      ↓
                                /api/dashboard/trends?days=7
                                /api/dashboard/audit-log?date_from=…&date_to=…
```

## Hata Yönetimi

- **Geçersiz `range` değeri** (örn. `?range=foo`): hook fallback 30g
- **`range=custom` ama `from`/`to` eksik**: fallback 30g
- **`to < from`**: fallback 30g; UI'da custom paneli açıldığında validation: from > to ise UYGULA disabled
- **Custom aralık > 90 gün**: `days` 90'a clamp. Audit ise `from`/`to`'yu olduğu gibi kullanır → bu durumda Trends son 90 günü, Audit tam aralığı gösterir (uyumsuzluk). Mitigasyon: `DateRangeFilter` özel aralık panelinde UYGULA tıklamadan önce 90 gün üst sınırını uygula (UI'da "Max 90 gün" uyarısı + UYGULA disabled).
- **Custom aralık < 1 gün** (aynı gün): `days` 1'e clamp; Audit aynı günü gösterir

## Test

### Yeni testler

**`useDateRange.test.jsx`** (vitest + @testing-library/react + MemoryRouter):
- Params yokken default 30g döner
- `?range=7` ile days=7
- `?range=custom&from=…&to=…` ile isCustom=true ve doğru from/to
- `?range=foo` (geçersiz) fallback 30g
- `?range=custom&from=2026-05-20&to=2026-05-19` (ters) fallback 30g
- 90+ günlük custom range clamp test'i
- `setRange('7')` URL'i günceller, from/to'yu temizler
- `setCustom('2026-04-01', '2026-04-30')` URL'i günceller

**`DateRangeFilter.test.jsx`**:
- Aktif preset chip'i vurgulanır
- Preset chip tıklaması `setRange` çağırır
- Özel butonu tıklayınca panel açılır
- UYGULA butonu `setCustom` çağırır
- Geçersiz aralıkta UYGULA disabled (from > to, >90 gün, eksik alan)

### Regresyon

Mevcut `backend/src/modules/dashboard/dashboard.test.js` testleri çalışmaya devam eder — backend değişmiyor.

## Faz planı (writing-plans için ön taslak)

1. `useDateRange` hook + birim testler
2. `DateRangeFilter` bileşeni + birim testler
3. `TrendChartsSection` prop'a dönüşüm + lokal toggle kaldırma
4. `AuditLogPanel` lokal date input'larını global prop'larla değiştirme
5. `DashboardPage` integrasyon (hook çağrısı + filter yerleşimi + prop drilling)
6. Manuel smoke test (URL paylaşımı, refresh, custom range)

Tek PR/commit olabilir; `/phase` komutuyla parça parça gitmek de mümkün ama küçük olduğundan tek pas önerilir.

## Riskler / Açık noktalar

- **TrendChartsSection internal toggle UX kaybı**: kullanıcı bugüne kadar "trend"in yanında 7/30/90 chip'ine alışkın. Global'e taşınınca header'a iner. Mitigasyon: trend section header'ında küçük readonly label ("SON 7 GÜN") göster.
- **Audit'in lokal date filtre kaybı**: ileride "global'den farklı bir aralıkla audit görme" ihtiyacı doğarsa "override" mode düşünülebilir. Şimdilik YAGNI.
- **i18n**: tüm metinler Türkçe hardcoded (proje geneliyle tutarlı).
