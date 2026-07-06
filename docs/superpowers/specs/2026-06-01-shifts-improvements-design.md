# Shifts (Vardiya/İK) İyileştirmeleri — Tasarım

**Tarih:** 2026-06-01
**Modül:** `shifts` (backend + frontend)
**Durum:** Onaylandı (kullanıcı, 1 Haz 2026) — planlama turu

## Bağlam

Shifts aslında tam bir İK/vardiya alt-uygulaması (~40 uç): personel CRUD+detay,
departman, vardiya tanımları, çizelge (çakışma kontrollü), izin (bakiye/talep/onay),
fazla mesai, devamsızlık, puantaj+bordro (CSV export, bordro slibi/detayı), resmi
tatil, kesinti, istatistik. Backend testli (577 satır). **Uygulamanın en büyük
teknik borcu burada.**

## Kapsam (onaylı)

### Faz S1 — God component decomposition ⭐ (en büyük borç)
`ShiftsPage.jsx` **4429 satır** = 8+ sekme tek dosyada (`ScheduleTab` ~1000,
`StaffDetailPanel` ~590). 70 `useState`, 28 `useQuery`, 623 inline style, 0 ARIA.

- **S1a · Paylaşılan primitive'leri çıkar.** `SidePanel`, `BottomSheet`,
  `ModalOverlay`, `InlinePopover` bu dosyada gömülü ama genel UI → `shared/components`'e
  taşı, app geneli reuse.
- **S1b · Sekmeleri ayır.** `StaffTab`, `ScheduleTab`, `LeaveTab`, `OvertimeTab`,
  `DepartmentsTab`, `SwapTab`, `SettingsTab`, `PuantajTab` → `modules/shifts/tabs/*`.
  `ShiftsPage` sadece orkestratör (nav + tab seçimi), ~200 satıra iner.
- **S1c · Büyük sekmeleri alt-bileşenlere.** `ScheduleTab` (haftalık ızgara, hücre
  ata, hafta doldur) ve `PuantajTab` (özet/takvim/liste + bordro slibi/detayı)
  kendi alt-bileşen dosyalarına. Staff form/detay sheet'leri ayrı.
- Her taşımada smoke test ekle (şu an frontend test YOK).

**Risk:** S1 tüm programın en büyük/en riskli işi. TDD + davranış-koruma şart;
her sekme taşındıktan sonra e2e + manuel doğrulama. Çizelge mantığı (çakışma,
hafta doldurma) saf fonksiyonlara çıkarılıp ayrıca test edilmeli.

### Faz S2 — Validation
- **S2a · Zod şemaları.** ~40 yazma ucu ham `req.body`. Öncelik: staff (POST/PUT),
  schedule (POST + check-conflicts), leave (POST/PATCH), overtime (POST/PUT),
  deductions (POST), holidays, attendance. `schemas.js` + `validate()`.

### Faz S3 — Yeni değer
- **S3a · Excel bordro export.** Mevcut CSV yanına xlsx (client-side
  `exportRowsToXlsx`). Bordro detayı için çok-sayfalı/biçimli.
- **S3b · İzin takvimi görünümü.** Kim ne zaman izinli — aylık takvim (mevcut
  leave verisinden türet).
- **S3c · Çizelge anomalisi → dashboard.** Eksik-vardiya / çakışma uyarılarını
  dashboard anomali motoruna besle (`getAnomalies` kalıbı).

### Faz S4 — a11y
- **S4a.** Çizelge/puantaj tablo semantiği (`<table>` + scope), form `aria-*`,
  klavye navigasyonu, hücre-atama popover'larına focus yönetimi.

## Kapsam dışı (bilinçli)
- **i18n** — sonraki tura.
- Haftalık çizelge şablon kütüphanesi — S3 sonrası opsiyonel.

## Mimari / izolasyon
- Çizelge iş mantığı (çakışma tespiti, hafta doldurma, vardiya renk/etiket) saf
  modüllere (`shifts/logic/*`) — test edilebilir, sekme bileşenlerinden ayrı.
- Paylaşılan sheet/popover primitive'leri tek kaynak (`shared/components`).
- Tab bileşenleri kendi veri sorgularını sahiplenir (mevcut 28 useQuery dağıtılır).

## Test stratejisi
- Backend: yeni Zod şemaları birim testi; mevcut 577-satır suite korunur.
- Frontend: her tab smoke test; çizelge saf-mantık birim testleri (çakışma/doldurma).
- e2e: çizelge ata + izin talep/onay happy-path.

## Önerilen uygulama sırası
S1 (decomposition — TDD, dikkatli, kendi içinde çok-fazlı) → S2 (Zod) → S3 → S4.
S1 ve S2 paralel ilerleyebilir (S2 backend, S1 frontend).
