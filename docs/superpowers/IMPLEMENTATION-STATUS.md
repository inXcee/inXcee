# YYS İyileştirme Programı — Uygulama Durumu

**Son güncelleme:** 2026-06-01
**Canlı commit:** `fc738ae` (avskamp.com) — batch 4 (7 modül) deploy bekliyor
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
- **Batch 4 (companies + announcements + drills + surveys + communications + notification-groups + automation)** ✓ — companies (ad sınırı, `.passthrough()`), announcements (başlık/içerik), drills (tip enum + metin sınırları), surveys (puan 1-5 + yorum, `.refine` ile "en az bir"), communications (SMS/broadcast enum+sınır), notification-groups (ad + üye), automation (kural — PUT önceden doğrulanmıyordu, artık trigger/action enum). +8 test (toplam 1057). NOT: users/kvkk service katmanında doğrulanıyor (auth/compliance-kritik, dokunulmadı).

### Oturum içi diğer canlı işler (program dışı, tamamlandı)
- axios HIGH advisory fix (`b57e459`) · CI tedarik-zinciri imza gate (`2b8869d`) · mevcudiyet Excel export (`a8ab06a`) · login düzeltmeleri: popover z-index + dil seçici + /login 403 + tam i18n TR/EN/AR (`a858b9f`/`7fc2d35`/`a7c33bb`) · demo veri temizliği

---

## ⏳ KALAN — öncelik sırasıyla

### 1. Cross-cutting Zod sweep (DEVAM EDİYOR — en büyük boşluk)
52 modülden ~9'unda validation var (checkin/checkout/expenses/capacity + People/Compliance:
personnel/hr/discipline/visitors). Kalan yazma uçlarına Zod şeması.
En yüksek tutarlılık/güvenlik kazancı, mekanik, düşük risk. Modül-modül uygulanır.
**Sıradaki aday gruplar:** Operasyonel (shifts/transport/maintenance/capacity-kalan),
Laundry (42 uç — en büyük), Inventory (alt-router'lar), Meals, Stations/Cards, Safety.

### 2. God component decomposition (en büyük teknik borç)
- **Shifts** `ShiftsPage.jsx` 4429 satır → sekme bileşenleri (S1) ⭐ en büyük
- **Laundry** `LaundryHub` 2038 + `RoomsSection` 2026 (L1b)
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
