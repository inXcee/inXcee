# Admin/Sistem + Comms + İçerik Grubu İyileştirmeleri — Tasarım

**Tarih:** 2026-06-01
**Modüller (26):** users, setup, system, backup, integrity, error-log, kvkk,
automation, notification-groups, notification-prefs, performance, safety, drills,
campus-map, display, bulk-actions, companies, room-history, communications,
documents, announcements, surveys, feedback, push, email, mobile-auth
**Durum:** Onaylandı (kullanıcı, 1 Haz 2026) — planlama turu (son grup)

## Bağlam

Kalan tüm modüller. Ortak: Zod yok, a11y/i18n yok (display'de test de yok).
Çoğu küçük (2-14 uç). Değere göre iki kova: yüksek-değer (derinleştirilecek) +
standart (Zod+a11f+küçük iyileştirme deseni).

## Kapsam (onaylı)

### Faz 1 — Cross-cutting Zod sweep
26 modülün yazma uçlarına `schemas.js` + `validate()`. Mekanik, toplu; en büyük
tutarlılık kazancı. Öncelik: en çok yazma ucu olanlar (safety 14, performance 13,
bulk-actions 11, notification-prefs 9, email 8, users 7, kvkk 7, integrity 7,
companies 7, notification-groups 7, mobile-auth 7).

### Faz 2 — Hedefli build-out (yüksek değer)
- **performance:** KPI iskeletini tam modüle çıkar — SLA/doluluk/maliyet trendleri,
  hedef vs gerçek, departman/firma kıyas. Dashboard trend altyapısıyla tutarlı.
- **safety:** İSG olay/kaza takibi, **KKD (PPE) takibi** (zimmet kalıbı), `drills`
  entegrasyonu, İSG uyum panosu (dashboard `ComplianceWidget` ile bağ).
- **automation:** yeni trigger'lar — `discipline_threshold`, `contract_expiry`,
  `sla_overdue`, `maintenance_recurring` (diğer modül spec'lerinin eskalasyonlarını
  bu motor besler; tek kaynak).
- **kvkk:** veri export/silme talebi akışı, saklama-süresi (retention) otomasyonu
  (cron/job queue).

### Faz 3 — Notification/email/push çok-kanal tamamlama
- E-posta şablon editörü (mevcut `email` modülü + nodemailer).
- **BLOKE:** VAPID push anahtarı + SMS sağlayıcı (.env) — config gelince çok-kanal
  kritik bildirim tam çalışır. Kod altyapısı hazır (Faz 6.1 kanal handler'ları).

### Faz 4 — a11y sweep
Admin sayfaları (users/companies/setup/backup/integrity vb.): tablo/form semantiği,
klavye, hata duyurusu.

## Standart desen modülleri (Faz 1+4 kapsamında)
users, setup, system, backup, integrity, error-log, drills, campus-map, display,
bulk-actions, companies, room-history, communications, documents, announcements,
surveys, feedback, mobile-auth — Zod + a11y + küçük modüle-özel iyileştirme
(ör. companies export, documents son-kullanma uyarısı, surveys analitiği,
campus-map katman/filtre, display canlı yenileme).

## Kapsam dışı (bilinçli)
- **i18n** — sonraki tura (app-geneli).
- VAPID/SMS — kullanıcı .env config'ine bağlı.

## Mimari / izolasyon
- `automation` evaluator tek merkez: tüm modül eskalasyonları buraya trigger ekler.
- performance KPI hesapları saf modüle (dashboard trend altyapısı reuse).
- KVKK retention + safety KKD job queue handler'ları.

## Test stratejisi
- Backend: Zod şemaları toplu birim test; performance/safety/automation yeni
  mantık saf testleri; mevcut testler korunur.
- Frontend: yeni/derinleştirilen sayfalar smoke.

## Önerilen uygulama sırası
Zod sweep (toplu) → performance + safety build-out → automation trigger'ları →
kvkk → a11y sweep. Notification çok-kanal config gelince.
