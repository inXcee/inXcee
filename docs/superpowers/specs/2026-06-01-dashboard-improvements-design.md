# Dashboard İyileştirmeleri — Tasarım

**Tarih:** 2026-06-01
**Modül:** `dashboard` (backend `src/modules/dashboard`, frontend `src/modules/dashboard`)
**Durum:** Onaylandı (kullanıcı, 1 Haz 2026) — planlama turu

## Bağlam

Dashboard uygulamanın en olgun modüllerinden: 12+ widget'a parçalanmış frontend,
cache'li (`cacheFor`) + RBAC'li backend, backend testleri mevcut. Bu yüzden iş
"kırığı tamir" değil, hedefli düzeltme + yeni değer + UX. Kapsam, kullanıcının
seçtiği 3 track ile sınırlı; **i18n/a11y bilinçli olarak sonraki tura bırakıldı**.

## Kapsam (onaylı)

### Faz D1 — Eksikler/buglar
- **D1a · Laundry rol dashboard'u (BUG, doğrulandı).** `postLoginRedirect` tüm
  rolleri `/`'e yolluyor; `DashboardPage` `technical` ve `housekeeper` için özel
  görünüm render ediyor ama **`laundry` için branch yok** → laundry rolü yönetici
  paneline düşüp manager-only `/dashboard/*` uçlarından 403 alıyor → boş ekran.
  **Çözüm:** `LaundryDashboard` bileşeni (housekeeper kalıbı), laundry-erişimli
  uçlardan özet (bekleyen torba / günlük teslim / iş kuyruğu). `DashboardPage`'e
  `if role === 'laundry'` branch'i.
- **D1b · Tarih-aralığı tutarlılığı.** Global `DateRangeFilter`/`useDateRange`
  yalnız trend + audit-log'u besliyor; KPI/doluluk hep "şu an". **Çözüm:**
  etkilenen kartlara "(seçili aralık)" rozeti + KPI/doluluk kartlarına açık
  "Canlı" etiketi. (Range'i tüm widget'lara yaymak yerine etiketleme — KPI'lar
  doğası gereği anlık olmalı.)
- **D1c · Loading skeleton.** KPI + ana widget'lara mevcut `Skeleton.jsx` reuse;
  veri gelene kadar boş yerine skeleton (algılanan hız).

### Faz D2 — Yeni analitik değer
- **D2a · Tıklanabilir KPI drill-down.** `KPICard`'a opsiyonel `onClick`/`to` →
  filtreli sayfaya git (açık arıza→`/maintenance?status=open`, karantina→
  `/capacity`, doluluk→ilgili görünüm). Salt sunum, mevcut route'lar.
- **D2b · Dönem-karşılaştırma okları.** Backend `getKPI`'a önceki-dönem değerleri
  ekle (ör. 7 gün önceki snapshot/karşılaştırma); `KPICard`'da ▲/▼ %X delta.
- **D2c · Excel export.** CSV butonlarının yanına "Excel" — client-side
  `exportRowsToXlsx` (frontend, `exportData.js`) reuse. Backend'e exceljs EKLENMEZ
  (frontend-only kuralı, bkz. [[yys-cards-roadmap]] mimari notu).

### Faz D3 — UX/kişiselleştirme
- **D3a · Widget göster/gizle + sırala.** Yönetici bento kartlarını aç/kapat +
  sürükle-sırala. **Yaklaşım: localStorage (v1)** — backend yok, anında, cihaz
  başı; `dnd-kit` zaten bağımlılık. (Sunucu-persist v2 olarak ertelendi.)
- **D3b · Mobil iyileştirme.** Bento grid küçük ekranda düzgün stack; rol
  dashboard'ları (technician/housekeeper/laundry) responsive denetimi.

## Kapsam dışı (bilinçli)
- **D2d · E-posta periyodik rapor** — SMTP config'e bağlı (.env yok → dormant),
  VAPID/SMS gibi bloke; SMTP gelince ayrı eklenir.
- **D3c · inline-style → tasarım token refactor** — app-geneli büyük refactor'un
  parçası, ayrı iş.
- **i18n + a11y** — sonraki tura bırakıldı (kullanıcı tercihi).

## Mimari / izolasyon
- Yeni `LaundryDashboard` ayrı bileşen (Technician/Housekeeper kalıbı) — tek
  sorumluluk, bağımsız test edilebilir.
- KPI delta backend'de (`getKPI` genişletme); frontend sadece sunum.
- Widget layout state'i izole bir hook'ta (`useDashboardLayout`, localStorage) —
  sunum bileşenlerinden ayrı, test edilebilir saf mantık.
- Drill-down: `KPICard`'a opsiyonel prop; mevcut kartlar kırılmaz (geriye uyumlu).

## Test stratejisi
- Backend: `getKPI` delta için birim test (dashboard.test.js genişlet).
- Frontend: `useDashboardLayout` saf mantık birim testi (göster/gizle/sırala +
  localStorage round-trip). `LaundryDashboard` smoke test.
- e2e: laundry rolüyle login → dashboard boş değil (en azından bir özet kart).

## Önerilen uygulama sırası
D1a (bug) → D1b → D1c → D2a → D2c → D2b → D3a → D3b.
Her alt-faz kendi içinde test'li + commit'li (proje workflow'u).
