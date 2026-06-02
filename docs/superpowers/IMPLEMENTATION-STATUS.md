# YYS İyileştirme Programı — Uygulama Durumu

**Son güncelleme:** 2026-06-01
**Canlı commit:** `3071dd0` (avskamp.com) — Shifts S1 + LaundryHub L1b + **RoomsSection L1b TAM** deploy edildi (2 Haz 2026)
**Spec'ler:** `docs/superpowers/specs/2026-06-01-*.md` (9 onaylı tasarım, tüm modüller)

Bu dosya, modül-modül iyileştirme programının ilerlemesini takip eder. Her şey
TDD + test + deploy ile canlıya alınıyor. "Devam" denince buradan sıradakine geç.

---

## ✅ TAMAMLANAN (uygulandı + canlıda)

### Dashboard — TAM ✓
- **D1** — laundry rol bug fix (boş dashboard düzeltildi) · tarih-aralığı "seçili aralık" etiketi · KPI loading skeleton (`9a10a28`)
- **D2** — tıklanabilir KPI drill-down · 7-gün dönem karşılaştırma (↑/↓ delta) · client-side Excel export (`ed25356`)
- **D3** — widget göster/gizle kişiselleştirme (⚙ Paneller, localStorage) · mobil (zaten responsive, doğrulandı) (`c69d877`)

### Check-in / Check-out — KISMİ
- **C1a** ✓ — kalan mutation uçlarına Zod (checkin: assign-room/set-shift/zimmet sign+return+return-all; checkout: yeni process şeması) (`b17fae3`)
- C1b–C3 ⏳ bekliyor (aşağıda)

### Cross-cutting Zod sweep — BAŞLADI
- **People/Compliance grubu** ✓ — personnel (not/acil iletişim/arşiv), hr (checklist/adım/toggle), discipline (kart/blacklist), visitors (giriş) yazma uçlarına Zod şema + `validate()` middleware. Sessiz `slice()` kırpma → açık 400 reddetme. Her modülde `schemas.js`. +8 test (`479cbbd`).
- **Maintenance** ✓ — istek oluştur (multipart, konum/açıklama/öncelik), öncelik/durum enum, atama, bekleme nedeni, teknisyen ekle/güncelle (user_id null ile unlink), yorum (zorunlu metin). Multipart uçlarda `validate` multer'dan sonra. +3 test (`92b3970`).
- **Operasyonel batch 1** ✓ — transport (durak/rota/durak-stop CRUD, atama, personel pickup), housekeeping (kat tamamla, atla, oda not/no-clean, arıza bildir multipart, temizlik personeli). +5 test (`3806e9a`).
- **Batch 2 (laundry + inventory + meals)** ✓ — laundry: ham SQL uçları (garment-types CRUD, bags). inventory: item create/edit + checkout + receipts (`.passthrough()` ile alan kaybı önlendi), locations CRUD, suppliers. meals: log/selection/diet/menu (enum+sınır). +7 test (`8429fc8`). NOT: laundry item/machine/supply ve inventory lots/po/requests uçları service katmanında doğrulanıyor (zaten korunuyor).
- **Batch 3 (safety + stations + cards)** ✓ — safety: eğitim oturumu CRUD (kategori enum), KKD zimmet/iade. stations: admin create/patch (tip enum, isim/konum sınırı) — scan/manual cihaz uçları hariç. cards: issue/bulk-issue/bind-nfc (card_type enum). +7 test (`fc738ae`).
- **Batch 4 (companies + announcements + drills + surveys + communications + notification-groups + automation)** ✓ — companies (ad sınırı, `.passthrough()`), announcements (başlık/içerik), drills (tip enum + metin sınırları), surveys (puan 1-5 + yorum, `.refine` ile "en az bir"), communications (SMS/broadcast enum+sınır), notification-groups (ad + üye), automation (kural — PUT önceden doğrulanmıyordu, artık trigger/action enum). +8 test (`bfc9bfe`). NOT: users/kvkk service katmanında doğrulanıyor (auth/compliance-kritik, dokunulmadı).
- **Batch 5 (performance + avs-workers + self-service + avs-self-service)** ✓ — performance (review/goal/positive — period regex + puan 1-5 + metin sınırları, gate deseni), avs-workers (çalışan ad/tel), self-service (resident kiosk maintenance/feedback), avs-self-service (worker kiosk meal-selection/maintenance/feedback). Kiosk multipart uçlarda `validate` upload'tan sonra; 403-önce guard korundu. +5 test (toplam 1062).

### Zod sweep — kapsam özeti
**Zod ile doğrulanan modüller:** checkin, checkout, expenses, capacity, personnel, hr, discipline, visitors, maintenance, transport, housekeeping, laundry (ham SQL uçları), inventory (+locations/suppliers), meals, safety, stations, cards, companies, announcements, drills, surveys, communications, notification-groups, automation, performance, avs-workers, self-service, avs-self-service.
**Service katmanında doğrulanan (kasıtlı dokunulmadı):** users (auth-kritik), kvkk (compliance), notification-prefs, bulk-actions, inventory lots/po/requests, laundry item/machine/supply.
**Kapsam dışı (sistem/cihaz/salt-okuma):** stations scan/manual (cihaz-authed), push/mobile-auth/integrity/email/backup/setup/system/error-log/campus-map/qr/documents (sistem/altyapı ya da zaten enum+min doğrulamalı).

### Oturum içi diğer canlı işler (program dışı, tamamlandı)
- axios HIGH advisory fix (`b57e459`) · CI tedarik-zinciri imza gate (`2b8869d`) · mevcudiyet Excel export (`a8ab06a`) · login düzeltmeleri: popover z-index + dil seçici + /login 403 + tam i18n TR/EN/AR (`a858b9f`/`7fc2d35`/`a7c33bb`) · demo veri temizliği

---

## ⏳ KALAN — öncelik sırasıyla

### 1. Cross-cutting Zod sweep — ✅ TAMAM (canlıda)
Tüm kullanıcı-girdili yazma uçları Zod + `validate()` middleware ile doğrulanıyor
(batch 1-5, yukarıdaki "TAMAMLANAN" bölümüne bak). Service katmanında doğrulanan
uçlar (users/kvkk/bulk-actions/notification-prefs, inventory lots/po/requests,
laundry item/machine/supply) bilinçli dokunulmadı; sistem/cihaz uçları kapsam dışı.
Kalan tek istisna: **shifts** modülü — çoğu ucu service'te doğrulanıyor; ham kalan
uçlar (holidays/deductions) gerekirse ileride eklenebilir (düşük öncelik).

### 2. God component decomposition (en büyük teknik borç)
- **Shifts** `ShiftsPage.jsx` 4429 → **211 satır ✓ (S1 sekme ayrıştırması TAMAM)** — saf orkestratör:
  - S1a ✓ paylaşılan primitive'ler `shifts/shared.jsx`'e (`a6a5a31`)
  - S1b ✓ basit sekmeler `tabs/`'e: Leave/Overtime/Departments/Swap/Settings (`0c8f1f5`)
  - S1b ✓ Staff grubu: `tabs/StaffTab.jsx` (StaffTab+StaffFormSheet) + `StaffDetailPanel.jsx` (`3ec5f12`)
  - S1b ✓ Schedule grubu: `tabs/ScheduleTab.jsx` (DailyView/WeekFillSheet/CellAssignSheet/ScheduleTab) + **latent `SHIFT_COLORS` ReferenceError bug fix** (`c7072d6`)
  - S1b ✓ Puantaj grubu: `tabs/PuantajTab.jsx` (Summary/Calendar/List view + Bordro slip/detay) (`4fb487c`)
  - Her sekme için smoke testi (frontend suite 84→93 yeşil). Tüm yazma davranışı korundu (birebir taşıma), build OK.
  - S1c ✓ çizelge saf-mantığı `logic/schedule.js`'e (`buildStaffGrid`/`computeWeekStats`/`parseShiftCell`/`parseScheduleSheet`) + 15 birim test (`81f6a12`). Suite 93→108 yeşil. ScheduleTab ~1320→1198 satır.
  - **KALAN (opsiyonel, düşük öncelik):** PuantajTab alt-view'ları ayrı dosyalara bölünebilir. Artık ShiftsPage'i kirletmiyor — **Shifts S1 TAMAM.**
- **Laundry** (L1b): `LaundryHub` 2038 → **825 satır ✓** — iç bileşenler `components/`'e: QuickNotes+DeliveredTodaySection (`6f43290`), Kanban kümesi→`KanbanBoard.jsx` (ExpandedSection/DraggableKanbanCard/KanbanCard/KanbanCol + COLOR_MAP/GARMENT_COLOR_HEX/waLink) (`a84a3bd`), QuickAdd+FullRecordsView (`0ed7562`). 4 smoke testi (suite 112 yeşil). LaundryHub artık kanban board orkestrasyonu + records/reports/settings yönlendirmesi. `components/RoomsSection.jsx` 2026 → **295 satır ✓ — RoomsSection L1b TAMAM (saf orkestratör)**: analiz/grafik bileşenleri `roomsAnalytics.jsx`'e (`67f3c5c`); sonra (2 Haz 2026, **DEPLOY EDİLMEDİ** — canlı hâlâ `315b059`): ortak sabit/helper'lar `roomsShared.js`'e (`1a0a8bb`), kart bileşenleri (RoomCard/OccupantRow/PremiumGarmentsCard) `roomsCards.jsx`'e (`5a9686e`), satır-içi yeni kayıt formu (InlineNewRecord+CompactSigPad) `roomsNewRecord.jsx`'e (`c354d1d`), oda detay paneli (timeline/filtre/batch/CSV/analitik) `roomDetailPanel.jsx`'e (`ab0dc64`). RoomsSection artık liste/filtre/sırala/pin/arama + RoomDetailPanel yönlendirmesi. 13 yeni smoke testi (frontend suite 131 yeşil), build OK, e2e 29/30 (tek hata login-landing AR/RTL — base commit'te de var, refactor'la alakasız). Davranış birebir korundu. **DEPLOY EDİLDİ `3071dd0` (2 Haz 2026).**
- **Transport** `TransportPage` 1872 · **Capacity** `CapacityPage` 1587 (operasyonel grup)
- **Maintenance** `MaintenancePage` 1386 (M1b) · **CheckinPage** 1033 (C1b) · **DisciplinePage** ~926

### 3. Check-in/Check-out kalan fazlar
- C1b CheckinPage decomposition · C2a tarayıcı-içi kamera · C2b checkout iade tutanağı PDF · C2c QR/barkod kişi bulma · C3a search pagination · C3b a11y

### 4. Modül-özel yeni değer (spec'lerde detaylı)
- **Shifts:** Excel bordro · izin takvimi · çizelge çakışma→dashboard anomali
- **Maintenance:** SLA eskalasyon→automation · periyodik bakım planı · kamera · teknisyen performans
- **Laundry:** Excel rapor · makine analitiği · teslim SLA · QR torba takibi
- **Transport:** QR servise biniş · canlı harita (leaflet) · rota optimizasyonu
- **Meals:** mutfak ekranı (display kalıbı) · atık/no-show analitiği · maliyet raporu
- **Inventory:** ABC analitiği · düşük-stok uyarısı+yeniden-sipariş · barkod
- **Capacity:** what-if senaryo · doluluk projeksiyon
- **Personnel:** 360° zaman tüneli (activity bağla) · belge ekleri
- **HR:** sözleşme bitiş uyarısı · belge yönetimi
- **Discipline:** eskalasyon analitiği (puan eşiği→kara liste) · trend
- **Visitors:** ön-kayıt + QR ziyaretçi kartı · ev sahibi bildirimi
- **Stations:** istasyon sağlık izleme · offline scan kuyruğu
- **Cards:** kart analitiği · toplu yeniden-basım
- **Performance:** tam KPI modülü (iskeletten)
- **Safety:** olay/kaza takibi · KKD takibi · drills entegrasyonu
- **Automation:** yeni trigger'lar (sözleşme/SLA/disiplin eşiği)
- **KVKK:** veri export/silme talebi akışı · retention otomasyonu

### 5. a11y sweep (bilinçli ertelendi)
Tüm admin sayfaları — tablo/form semantiği, ARIA, klavye. (Kiosk + login zaten iyi.)

### 6. i18n admin app (bilinçli ertelendi — kullanıcı tercihi)
Yönetici uygulaması TR-only; kiosk+login TR/EN/AR çevrili. Login i18n pattern'i hazır.

---

## ⛔ BLOKE (kullanıcı .env config'i gerekli)
- **Sentry** prod'da kapalı (`SENTRY_DSN` yok) → 5xx görünürlüğü yok
- **Push** (VAPID anahtar yok) + **SMS** (sağlayıcı yok) → çok-kanal kritik alarm eksik

---

## Çalışma deseni (her iş için)
TDD (test önce) → backend `npx vitest run` (1019 test) + frontend build + 84 test →
commit (semantic) → `Scripts\deploy-yys.ps1` → canlı health doğrula. God component
refactor'larında davranış-koruma + e2e şart.
