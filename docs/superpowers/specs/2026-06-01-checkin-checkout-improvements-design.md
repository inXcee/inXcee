# Check-in / Check-out İyileştirmeleri — Tasarım

**Tarih:** 2026-06-01
**Modüller:** `checkin`, `checkout` (backend + frontend)
**Durum:** Onaylandı (kullanıcı, 1 Haz 2026) — planlama turu

## Bağlam

Çekirdek günlük akış, yüksek trafik. Checkin zaten zengin: 4-adımlı sihirbaz
(kişi bul → kayıt → oda ata → zimmet), akıllı oda önerisi (firma/memleket/vardiya),
zimmet + dijital imza + iade lifecycle, CSV bulk import (1000 cap), foto upload
(magic-byte), kiosk PIN, istatistik + autocomplete. Checkout sade: preview →
zimmet aksiyon → process → son çıkışlar. Checkin **3 modülden biri** olarak kısmi
Zod'a sahip (`registerSchema`/`zimmetSchema`/`placeholderBatchSchema`).

## Kapsam (onaylı)

### Faz C1 — Eksikler (validation + refactor)
- **C1a · Zod'u tamamla.** Checkin'de ~10 uç hâlâ ham `req.body` (lookup,
  search-name, assign-room, set-shift, zimmet/sign, zimmet/return,
  zimmet/return-all, import-csv satır şeması). **Checkout'ta hiç Zod yok** —
  özellikle `process`'in `zimmet_actions` dizisi (zimmet_id/action/condition/note
  şekli) doğrulanmıyor. Her ikisine `schemas.js` + `validate()`. Mevcut
  `validate.js` middleware kalıbı kullanılır; ilk-issue mesajı üst-düzey `error`'a.
- **C1b · CheckinPage decomposition.** 1033 satır + 52 `useState` → adım
  bileşenlerine böl: `StepFindPerson`, `StepRegister`, `StepAssignRoom`,
  `StepZimmet`. Adım-bazlı state grupları (sihirbaz state'i bir reducer/hook'ta).
  Mevcut `ZimmetForm`/`CsvImport`/`BlacklistAlert` zaten ayrı — onlarla tutarlı.
  Hedef: her adım bağımsız test edilebilir.

### Faz C2 — Yeni değer
- **C2a · Tarayıcı-içi kamera ile foto.** Mevcut foto akışı sadece dosya upload.
  `getUserMedia` ile canlı çekim (sahada tablet/telefon). Kalıp `StationPage.jsx`'te
  hazır (webcam kare → FormData → mevcut `/checkin/photo/:id` ucu). Dosya upload
  fallback korunur.
- **C2b · Checkout zimmet iade tutanağı PDF.** `process` sonrası iade edilen/eksik
  zimmet kalemlerini imzalı tutanak olarak PDF (pdfkit hazır, `shared/pdf`).
- **C2c · QR/barkod ile kişi bulma.** Checkin "kişi bul" adımına QR/barkod tarama
  (`html5-qrcode` zaten bağımlılık) → TC/sicil ile hızlı lookup.

### Faz C3 — UX
- **C3a · Search pagination/limit.** `search`/`search-name` tüm eşleşmeyi dönüyor;
  limit + "daha fazla" (company-personnel zaten limit/offset'li — aynı kalıp).
- **C3b · a11y.** Form label/aria, adım sihirbazı klavye akışı, hata duyurusu
  (`aria-live`). Günlük yoğun form sayfası — yüksek etki.

## Kapsam dışı (bilinçli)
- **i18n** — sonraki tura (app-geneli tutarlılık).
- Toplu checkout — `bulk-actions` modülü mevcut; ayrı değerlendirilir.

## Mimari / izolasyon
- Sihirbaz state'i izole hook/reducer (`useCheckinWizard`) — adım bileşenleri saf
  sunum, test edilebilir.
- Kamera bileşeni yeniden kullanılabilir (`CameraCapture`) — checkin + ileride
  başka modüller (stations kalıbından genelleştir).
- Checkout `process` şeması, zimmet aksiyon tiplerini (return/keep/missing)
  tek kaynaktan doğrular.

## Test stratejisi
- Backend: yeni Zod şemaları için birim test (geçerli/geçersiz body); checkout
  `process` zimmet_actions reddi. Mevcut checkin/checkout testleri korunur.
- Frontend: adım bileşenleri smoke test; `useCheckinWizard` saf mantık testi.
- e2e: checkin happy-path (kişi bul → kayıt → oda → zimmet) korunur.

## Önerilen uygulama sırası
C1a (kritik, veri bütünlüğü) → C1b (refactor) → C2a → C2b → C2c → C3a → C3b.
