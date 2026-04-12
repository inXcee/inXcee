# Raporlama Sistemi — Tasarım Dokümanı

**Tarih:** 2026-04-12  
**Kapsam:** İnteraktif Rapor Sayfası + Dashboard Trend Grafikleri

---

## Genel Bakış

Mevcut Raporlar sayfası yalnızca PDF indirme kartlarından oluşuyor; Dashboard'da ise tarih filtresi ve trend grafikleri yok. Bu tasarım iki sistemi birden güçlendirir:

1. **İnteraktif Rapor Sayfası** — Her rapor kartı, PDF'e gerek kalmadan özet sayıları ve açılır detay tablosunu gösterir.
2. **Dashboard Trend Grafikleri** — Mevcut KPI bölümünün altına 4 metrikli trend grafikleri eklenir (recharts).

---

## 1. Backend — Trends Endpoint

### Endpoint

```
GET /api/dashboard/trends?metrics=occupancy,sla,housekeeping,checkins&days=30
```

- `metrics`: virgülle ayrılmış metrik listesi (hepsi varsayılan)
- `days`: kaç günlük geçmiş (7 / 30 / 90, varsayılan 30)
- Erişim: `campus_manager`, `shift_supervisor`

### Yanıt Yapısı

```json
{
  "occupancy":    [{ "date": "2026-04-01", "value": 87 }],
  "sla":          [{ "date": "2026-04-01", "value": 94 }],
  "housekeeping": [{ "date": "2026-04-01", "value": 100 }],
  "checkins":     [{ "date": "2026-04-01", "in": 3, "out": 1 }]
}
```

### SQL Sorguları (`dashboard/queries.js` içine `getTrends`)

| Metrik | Kaynak Tablo | Hesap |
|--------|-------------|-------|
| `occupancy` | `check_ins` | `check_in_date <= gün AND (check_out_date IS NULL OR check_out_date > gün)` koşuluyla o gün aktif kişi sayısı / toplam aktif yatak sayısı |
| `sla` | `maintenance_requests` | Her gün kapanan taleplerden zamanında kapananların oranı |
| `housekeeping` | `housekeeping_tasks` | Her gün tamamlanan görev / toplam görev |
| `checkins` | `check_ins` tablosu | Günlük check-in (`in`) ve check-out (`out`) sayısı |

Cache: `cacheFor(300)` (5 dakika).

---

## 2. Backend — Rapor JSON Endpoint'leri

Mevcut PDF endpoint'leri (`GET /api/reports/:type`) **değişmez**. Her birine karşılık yeni `/data` route'u eklenir; mevcut `service.js` fonksiyonları doğrudan yeniden kullanılır.

| Endpoint | Servis Fonksiyonu | Dönen Veri |
|----------|------------------|-----------|
| `GET /api/reports/housekeeping/data?date=` | `getHousekeepingReport(date)` | `{ total, done, skipped, pending, tasks[] }` |
| `GET /api/reports/maintenance/data` | `getMaintenanceReport()` | `{ total, open, closed, overdue, requests[] }` |
| `GET /api/reports/occupancy/data` | `getOccupancyReport()` | `{ totals, blocks[], personnel[] }` |
| `GET /api/reports/discipline/data` | `getDisciplineReport()` | `{ total, records[] }` |

Erişim: `campus_manager`, `shift_supervisor`.

---

## 3. Frontend — Dashboard Trend Bölümü

### Bileşen Yapısı

```
DashboardPage.jsx
  └── TrendChartsSection.jsx       ← yeni
        ├── useTrends hook          ← yeni (React Query)
        └── TrendCard.jsx           ← yeni (tek grafik kartı)
```

### TrendChartsSection

- **Konum:** `DashboardPage.jsx` içinde mevcut `BedOccupancyPanel`'in altına yerleştirilir.
- **Zaman toggle:** `7G / 30G / 90G` — `useState` ile `days` parametresini değiştirir.
- **Layout:** 2×2 grid, `repeat(auto-fill, minmax(320px, 1fr))`.
- **Veri:** `useQuery(['trends', days], () => api.get('/dashboard/trends?days=' + days))` — staleTime 5 dakika.

### TrendCard

Her kart:
- Başlık + son değer büyük (ör. **%87**) + trend oku (↑ yeşil / ↓ kırmızı)
- `recharts AreaChart` — `ResponsiveContainer` ile tam genişlik
- Renk: doluluk → mavi, SLA → yeşil, temizlik → teal, giriş/çıkış → çift çizgi (yeşil giriş, kırmızı çıkış)
- Giriş/Çıkış kartında `LineChart` (iki DataKey: `in`, `out`)

### Bağımlılık

`recharts` paketi eklenecek (`npm install recharts --workspace=frontend`).

---

## 4. Frontend — İnteraktif Rapor Sayfası

`ReportsPage.jsx` tek dosya olarak güncellenir — yeni bileşen dosyası oluşturulmaz.

### Her Rapor Kartında

1. **Özet sayılar** — `/data` endpoint'inden `useQuery` ile çekilir. Kart içinde küçük sayı satırı gösterilir (ör. Tamamlandı: 38 · Atlınan: 4 · Bekleyen: 0).
2. **"▼ Detayları Göster" butonu** — `useState(false)` ile toggle, tablo `display:none/block` ile açılır/kapanır.
3. **Inline tablo** — Mevcut `addTable` PDF sütunlarıyla aynı alanlar, ama HTML `<table>` olarak.
4. **"PDF İNDİR" butonu** — Korunur, değişmez.

### Tarih Seçimi

Mevcut global `selectedDate` state'i korunur. Sadece `housekeeping/data` endpoint'ine tarih parametresi geçer; diğerleri tarihe bağımsız.

---

## 5. Test Kapsamı

`backend/src/modules/dashboard/dashboard.test.js` içine:
- `getTrends` her metrik için veri döndürüyor mu
- Geçersiz `metrics` parametresi graceful hata veriyor mu
- `days` sınır değerleri (7, 90)

`reports` modülü için mevcut testlere:
- `/housekeeping/data`, `/maintenance/data`, `/occupancy/data`, `/discipline/data` JSON döndürüyor mu

---

## Kapsam Dışı

- Özelleştirilebilir rapor oluşturucu
- Otomatik e-posta gönderimi
- Disiplin kartı trend grafiği (seçilmedi)
