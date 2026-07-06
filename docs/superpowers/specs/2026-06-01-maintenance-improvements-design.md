# Maintenance (Arıza/Bakım) İyileştirmeleri — Tasarım

**Tarih:** 2026-06-01
**Modül:** `maintenance` (backend + frontend)
**Durum:** Onaylandı (kullanıcı, 1 Haz 2026) — planlama turu

## Bağlam

Arıza yönetimi: talep, öncelik, SLA deadline takibi, teknisyen atama, güçlü foto
dokümantasyon (öncesi/sonrası), durum akışı. Backend testli (224). Dashboard'a
entegre (TechnicianDashboard + aktif arızalar + SLA aşımı uyarısı). 20 uç, Zod yok.

## Kapsam (onaylı)

### Faz M1 — Eksikler
- **M1a · Zod şemaları.** 20 uç ham `req.body`. Öncelik: request create/update,
  technician assign, status-change, wait-reason. `schemas.js` + `validate()`.
- **M1b · MaintenancePage decomposition.** 1386 satır (25 useState, 185 inline,
  0 ARIA) → liste / detay / form / atama panelleri ayrı bileşenlere.

### Faz M2 — Yeni değer
- **M2a · SLA eskalasyon.** Deadline aşımında otomatik bildirim/eskalasyon —
  mevcut `automation` evaluator + anomali motoruna trigger bağla (`sla_overdue`).
- **M2b · Periyodik bakım planı.** Recurring bakım (ör. aylık jeneratör) — plan
  tablosu + otomatik talep üretimi (cron/job queue hazır).
- **M2c · Tarayıcı-içi kamera.** Foto için `getUserMedia` (StationPage kalıbı),
  dosya upload fallback korunur — sahada tablet/telefon.
- **M2d · Teknisyen performans metriği.** Ortalama kapanış süresi, SLA uyum oranı
  (performance modülü iskeletine besle).

### Faz M3 — a11y
- Tablo/form semantiği, durum-değişim butonlarına aria, klavye, foto galeri.

## Kapsam dışı (bilinçli)
- **i18n** — sonraki tura.

## Mimari / izolasyon
- SLA hesabı (deadline, aşım, kalan süre) saf modüle — automation + dashboard +
  performans tek kaynaktan tüketir.
- Periyodik plan üretimi job queue handler'ı (`maintenance.recurring`).
- Kamera bileşeni checkin ile paylaşılan `CameraCapture` (stations'tan genelleştir).

## Test stratejisi
- Backend: Zod şemaları + SLA hesap saf-mantık + periyodik üretim testi. Mevcut
  224-satır suite korunur.
- Frontend: panel bileşenleri smoke.
- e2e: arıza aç → ata → SLA → kapat happy-path.

## Önerilen uygulama sırası
M1a → M1b → M2a (yüksek değer) → M2b/c/d → M3.
