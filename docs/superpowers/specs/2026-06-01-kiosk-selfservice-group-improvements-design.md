# Kiosk/Self-Servis Grubu İyileştirmeleri — Tasarım

**Tarih:** 2026-06-01
**Modüller:** `avs-self-service`, `self-service`, `cards`, `stations`, `access`, `activity`, `qr`
**Durum:** Onaylandı (kullanıcı, 1 Haz 2026) — planlama turu

## Bağlam

Grup genel olarak daha iyi durumda — çoğu yeni kod (cards/stations/access/activity
= Faz 1-10). Kiosk'larda a11y zaten var (avs 12, self-service 10 ARIA) ve **kiosk
i18n tamamlanmış** (TR/EN/AR). Ortak eksik: Zod.

- avs-self-service (28 uç): `AvsSelfServicePage` 967 satır; a11y ✓, i18n ✓, 2 test.
- self-service (29 uç): a11y ✓(10).
- cards (8), stations (9, station-auth ✓), access (2, salt-okuma), activity (1,
  türetilmiş salt-okuma), qr (5).

## Kapsam (onaylı)

### Faz 1 — Validation
- cards: issue/bulk-issue/revoke/bind-nfc.
- stations: create/update/config (raw key akışı korunur).
- qr: token/print yazma uçları.
- self-service: sakin talep/işlem yazma uçları.
- *access/activity salt-okuma — Zod gerekmez.*

### Faz 2 — Decomposition
- `AvsSelfServicePage` (967) → sekme bileşenlerine (zaten TabState var; her sekme
  ayrı dosya).
- self-service ana sayfası benzer şekilde.

### Faz 3 — Modüle-özel değer
- **stations:** **istasyon sağlık izleme** (son scan zamanı, offline tespit,
  dashboard'a), offline scan kuyruğu (ağ kesintisinde yerel sıra → senkron).
- **cards:** kart analitiği (aktif/kayıp/süre dolan), toplu yeniden-basım.
- **avs-self-service:** offline mod (PWA SW hazır — okuma cache + kuyruk),
  daha çok self-servis aksiyon.
- **access:** SSE canlı presence (bilinçli ertelendi — maliyet/değer; 20sn poll
  yeterli), tarihsel presence raporu.

### Faz 4 — a11y
- Sadece admin tarafı (`CardsPage`, `StationsPage`) — kiosk'lar zaten iyi.

## Kapsam dışı (bilinçli)
- **i18n** — kiosk'lar zaten çevrili; admin tarafı sonraki turda app-geneli i18n ile.
- **access SSE** — değer/maliyet dengesi zayıf (bkz. [[yys-cards-roadmap]]).

## Mimari / izolasyon
- İstasyon sağlık: `stations` son-scan türevi + dashboard anomali kalıbı (yeni
  tablo yok).
- Offline scan kuyruğu: SW + IndexedDB; senkron `stations/scan` ucunu tekrar kullanır.
- Kiosk sekmeleri kendi veri sorgularını sahiplenir (mevcut TabState korunur).

## Test stratejisi
- Backend: cards/stations/qr Zod şemaları birim testi; mevcut testler korunur.
- Frontend: kiosk sekme bileşenleri smoke (mevcut e2e nav-overflow'a dikkat).
- e2e: kart bas → istasyon scan → presence happy-path (mevcut korunur).

## Önerilen uygulama sırası
Zod (cards/stations/qr/self-service) → kiosk decomposition → istasyon sağlık +
kart analitiği → admin a11y.
