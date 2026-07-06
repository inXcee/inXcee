# Performance KPI Panosu — Tasarım

**Tarih:** 2026-06-04
**Modül:** `performance`
**Kaynak:** 1 Haz admin-system-group spec'i Faz 2 ("performance: KPI iskeletini tam modüle çıkar") — implementasyon-düzeyi tasarım.

## Bağlam

Performance modülü şu an **personel-odaklı** ve üç parçadan oluşuyor:
- **Değerlendirmeler** (`performance_reviews`): personel × dönem, 8 boyut (productivity, teamwork, attendance, attitude, skills, initiative, reliability, communication) her biri 1-5, `total_score` (boyut ortalaması), `UNIQUE(staff_id, period)`.
- **Hedefler** (`performance_goals`): `status` ∈ open/in_progress/done/cancelled, `progress` 0-100, `target_date`, `closed_at`.
- **Pozitif puan** (`positive_points`): `points`, `reason`, `created_at`.

Frontend `PerformancePage` 3 sekme: Değerlendirmeler · Hedefler · Liderler. **Eksik olan:** verileri toplayan KPI/analiz panosu. Veriler tek tek listeleniyor ama departman kıyası, hedef tamamlama oranı, dönemsel trend gibi türetilmiş görünüm yok.

**Kapsam kararı (onaylı):** Pano **personel performans analizi** odaklı kalır — mevcut üç tablodan beslenir. Organizasyon-geneli operasyonel KPI (SLA/doluluk/maliyet) **kapsam dışı**: bunların kendi mod dashboard'ları zaten var, buraya taşımak tekrar + çapraz-modül bağımlılık olurdu.

## Amaç

Mevcut performance verilerini toplayan bir **KPI / Analiz** sekmesi: yöneticinin tek bakışta departman kıyası, hedef tamamlama durumu, dönemsel puan trendi ve değerlendirme boyut kırılımını görmesi.

## Yaklaşım (onaylı)

Tek toplayan endpoint + saf hesap modülü (inventory `analytics` deseni). Reddedilen alternatifler: widget başına ayrı endpoint (fazla bağlantı/çok istek); client-side hesap (liste uçları `LIMIT 200`, tüm personel üzerinden doğru agregasyon yapamaz).

## Bileşenler

### `backend/src/modules/performance/kpi.js` (yeni)
Saf fonksiyonlar, hepsi `db` parametresi alır (`= getDB()` varsayılan), salt-okuma:

- **`summary(db, period)`** — `{ reviewCount, avgScore, activeGoals, goalCompletionRate, positivePoints }`. `reviewCount`/`avgScore` o dönemin değerlendirmeleri; `activeGoals` = status IN (open,in_progress); `goalCompletionRate` = done / (toplam done+cancelled+open+in_progress) yüzdesi (tüm hedefler, dönemden bağımsız); `positivePoints` = o dönem yılı içindeki toplam (basitlik için son 365 gün). period varsayılan = içinde bulunulan yıl.
- **`departmentComparison(db, period)`** — departman başına satır: `{ dept_id, dept_name, reviewed_count, avg_score, avg_goal_progress, positive_points }`. Departmanı olmayan personel `'(Departman yok)'` altında toplanır. `avg_score` o dönemin değerlendirmeleri; `avg_goal_progress` aktif hedeflerin ortalama progress'i.
- **`goalAchievement(db)`** — `{ open, in_progress, done, cancelled, onTime, overdue, completionRate }`. `onTime` = done & (`target_date` NULL veya `closed_at` ≤ `target_date`); `overdue` = (status IN open,in_progress) & `target_date` < bugün. `completionRate` = done / (done+cancelled+open+in_progress).
- **`scoreTrend(db, limit=8)`** — son `limit` dönemin `{ period, avg_score, review_count }` listesi, **kronolojik artan** (period TEXT, lexicographic sıralama yeterli — "2025"/"2026" ve "2026-Q1" formatları sıralanır).
- **`dimensionBreakdown(db, period)`** — 8 boyutun o dönemdeki org-geneli ortalaması: `{ productivity, teamwork, ... }` (her biri REAL veya null).

### `backend/src/modules/performance/routes.js` (değişiklik)
Tek route eklenir:
```
GET /performance/kpi?period=YYYY
```
- Guard: mevcut `view = requireRole('campus_manager','shift_supervisor')`.
- `period` verilmezse içinde bulunulan yıl (`new Date().getFullYear()`).
- Dönüş: `{ period, summary, departments, goals, trend, dimensions }` — beş saf fonksiyonu çağırır.
- Hata: try/catch → 500 `{ error: 'Sunucu hatası' }` (modüldeki diğer GET'lerle aynı kalıp).

### `frontend/src/modules/performance/PerformancePage.jsx` (değişiklik)
- Sekme listesine `{ key: 'kpi', label: '📊 KPI / Analiz' }` eklenir, `{tab === 'kpi' && <KpiTab />}`.
- **`KpiTab`** yeni component (aynı dosyada, mevcut `ReviewsTab`/`GoalsTab`/`LeadersTab` gibi): dönem seçici + tek `GET /performance/kpi` fetch (react-query). Bölümler:
  1. **Özet stat kartları** — reviewCount, avgScore, activeGoals, goalCompletionRate %, positivePoints.
  2. **Departman kıyası** — tablo veya inline bar (avg_score'a göre).
  3. **Hedef tamamlama** — onTime/overdue/open/done sayıları + completionRate.
  4. **Puan trendi** — dönem bazlı inline bar listesi (avg_score).
  5. **Boyut kırılımı** — 8 boyut inline bar (1-5 skala).
- Mevcut `Skeleton`/inline-bar primitifleri kullanılır; **yeni grafik kütüphanesi eklenmez** (repo deseni: inline style + basit bar).

## Veri / şema
**Yeni kolon / tablo / migration YOK.** Hepsi mevcut `performance_reviews` + `performance_goals` + `positive_points` (+ `staff`/`departments` join) üzerinden salt-okuma agregasyon.

## Hata / sınır durumları
- Veri yoksa: saf fonksiyonlar boş dizi / null / 0 döner; frontend boş-durum gösterir.
- `total_score` NULL olan değerlendirmeler ortalamada SQL `AVG` ile zaten atlanır.
- `target_date` NULL hedefler: onTime'da done ise sayılır, overdue'da sayılmaz.
- Departmansız personel ayrı grup.
- Bölme-sıfır: completionRate paydası 0 ise 0 döner.

## Kapsam dışı (bilinçli — YAGNI)
- Org-geneli ops KPI (SLA/doluluk/maliyet) — reddedilen kapsam.
- Excel/PDF export (gerekiyorsa ayrı, dashboard zaten client export deseni var).
- Personel-bazlı drill-down sayfası (mevcut Reviews/Goals sekmeleri zaten kişi bazlı).
- Yeni grafik kütüphanesi (inline bar yeterli).
- i18n (admin app TR-only, bilinçli sonraki tur).

## Test stratejisi
`backend/src/modules/performance/kpi.test.js` (vitest, :memory: + seedDev):
- 2 departman, ≥2 personel, 2 dönem (örn "2025"/"2026") değerlendirme + hedef (done on-time / done late / overdue open) + pozitif puan seed.
- **summary:** doğru sayım/ortalama; boş dönemde 0/null.
- **departmentComparison:** departman başına doğru ort. puan; departmansız grup.
- **goalAchievement:** onTime vs overdue ayrımı doğru; completionRate.
- **scoreTrend:** kronolojik sıra, dönem başına doğru ortalama.
- **dimensionBreakdown:** boyut ortalamaları.
- Mevcut `performance.test.js` kırılmamalı.

Frontend: `KpiTab` smoke testi (mock fetch → kartlar/bölümler render olur).

## Önerilen uygulama sırası
1. `kpi.js` saf fonksiyonlar — fonksiyon başına TDD (summary → departments → goals → trend → dimensions).
2. `GET /performance/kpi` route + route testi.
3. `KpiTab` frontend + smoke testi + build.
4. Manuel doğrulama: seed DB → endpoint çağır → değerler tutarlı.
5. Deploy (onayla).
